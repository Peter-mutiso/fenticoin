import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

// Value imports below: every service class in this constructor is injected
// without an explicit `@Inject()` token, so Nest resolves each by its
// declared TS type via emitted `design:paramtypes` metadata — an
// `import type` here would silently break that resolution. See
// eslint.config.js for why `consistent-type-imports` is off in this app.
import { AuditLogService } from '../audit/audit-log.service';
import { ROLES } from '../authorization/roles.catalog';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AppConfigService } from '../config/app-config.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import {
  authIdentities,
  twoFactorBackupCodes,
  twoFactorMethods,
  type User,
  userProfiles,
  userRoles,
  users,
} from '../database/schema';
import { UsersService } from '../users/users.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import { EMAIL_PROVIDER, type EmailProvider } from './providers/email/email-provider.interface';
import { OAUTH_GOOGLE_PROVIDER, type OAuthProvider } from './providers/oauth/oauth-provider.interface';
import { ProviderNotConfiguredError } from './providers/provider-not-configured.error';
import { SMS_PROVIDER, type SmsProvider } from './providers/sms/sms-provider.interface';
import { PasswordService } from './services/password.service';
import { SessionService, type SessionMeta } from './services/session.service';
import { TokenService } from './services/token.service';
import { TwoFactorService } from './services/two-factor.service';
import { VerificationTokenService } from './services/verification-token.service';

export interface PublicUser {
  id: string;
  email: string;
  status: string;
  kycStatus: string;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
}

const MIN_AGE_YEARS = 18; // floor only — see docs/ARCHITECTURE.md "Requirements you didn't mention" #1
const EMAIL_VERIFICATION_TTL_MINUTES = 60 * 24;
const PASSWORD_RESET_TTL_MINUTES = 30;
const PHONE_OTP_TTL_MINUTES = 10;

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    kycStatus: user.kycStatus,
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly twoFactorService: TwoFactorService,
    private readonly encryptionService: EncryptionService,
    private readonly verificationTokenService: VerificationTokenService,
    private readonly auditLog: AuditLogService,
    private readonly config: AppConfigService,
    @Inject(OAUTH_GOOGLE_PROVIDER) private readonly googleProvider: OAuthProvider,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  // ---- registration & password login -----------------------------------

  async register(dto: RegisterDto, meta: SessionMeta): Promise<AuthResult> {
    const email = this.usersService.normalizeEmail(dto.email);

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    if (dto.dateOfBirth) {
      this.assertMinimumAge(dto.dateOfBirth);
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({ email, dateOfBirth: dto.dateOfBirth })
        .returning();
      const created = newUser as User;

      await tx.insert(userProfiles).values({ userId: created.id });
      await tx.insert(authIdentities).values({ userId: created.id, provider: 'password', passwordHash });
      await tx.insert(userRoles).values({ userId: created.id, roleKey: ROLES.USER });

      return created;
    });

    await this.auditLog.record({
      actorUserId: user.id,
      action: 'user.registered',
      targetType: 'user',
      targetId: user.id,
      metadata: { via: 'password' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.sendEmailVerification(user).catch((error: unknown) => {
      this.logger.warn(`Failed to send verification email for ${user.id}: ${String(error)}`);
    });

    return this.issueSession(user, meta);
  }

  async login(dto: LoginDto, meta: SessionMeta): Promise<AuthResult | TwoFactorChallenge> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    if (user.status !== 'active') throw new ForbiddenException(`Account is ${user.status}`);

    const [identity] = await this.db
      .select()
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, user.id), eq(authIdentities.provider, 'password')))
      .limit(1);

    if (!identity?.passwordHash || !(await this.passwordService.verify(dto.password, identity.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const [twoFactor] = await this.db
      .select()
      .from(twoFactorMethods)
      .where(eq(twoFactorMethods.userId, user.id))
      .limit(1);

    if (twoFactor?.enabledAt) {
      return { twoFactorRequired: true, challengeToken: this.tokenService.signTwoFactorChallengeToken(user.id) };
    }

    await this.auditLog.record({
      actorUserId: user.id,
      action: 'user.login',
      targetType: 'user',
      targetId: user.id,
      metadata: { via: 'password' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return this.issueSession(user, meta);
  }

  async loginWithTwoFactor(challengeToken: string, code: string, meta: SessionMeta): Promise<AuthResult> {
    const payload = this.tokenService.verifyTwoFactorChallengeToken(challengeToken);
    const user = await this.usersService.findById(payload.sub);
    if (!user || user.status !== 'active') throw new UnauthorizedException('Invalid challenge');

    const [twoFactor] = await this.db
      .select()
      .from(twoFactorMethods)
      .where(eq(twoFactorMethods.userId, user.id))
      .limit(1);
    if (!twoFactor?.enabledAt) throw new UnauthorizedException('Two-factor authentication is not enabled');

    const secret = this.encryptionService.decrypt(twoFactor.secretCiphertext);
    const validTotp = this.twoFactorService.verifyCode(secret, code);
    const validBackup = validTotp ? false : await this.tryConsumeBackupCode(user.id, code);

    if (!validTotp && !validBackup) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    await this.auditLog.record({
      actorUserId: user.id,
      action: 'user.login',
      targetType: 'user',
      targetId: user.id,
      metadata: { via: validBackup ? 'password+2fa_backup_code' : 'password+2fa_totp' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return this.issueSession(user, meta);
  }

  // ---- session lifecycle -------------------------------------------------

  async refresh(refreshTokenRaw: string, meta: SessionMeta): Promise<AuthResult> {
    const result = await this.sessionService.rotate(refreshTokenRaw, meta);

    if (result.outcome === 'reused') {
      throw new UnauthorizedException('Refresh token reuse detected; all sessions have been revoked');
    }
    if (result.outcome === 'invalid') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(result.session.userId);
    if (!user || user.status !== 'active') {
      throw new ForbiddenException('Account is not active');
    }

    const accessToken = this.tokenService.signAccessToken(user.id, result.session.id);
    return { accessToken, refreshToken: result.refreshTokenRaw, user: toPublicUser(user) };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionService.revoke(sessionId, 'logout');
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionService.revokeAllForUser(userId, 'logout_all');
    await this.auditLog.record({ actorUserId: userId, action: 'user.logout_all', targetType: 'user', targetId: userId });
  }

  // ---- email verification & password reset -------------------------------

  private async sendEmailVerification(user: User): Promise<void> {
    const token = await this.verificationTokenService.issueOpaqueToken(
      user.id,
      'email_verification',
      user.email,
      EMAIL_VERIFICATION_TTL_MINUTES,
    );
    const link = `${this.config.appBaseUrl}/verify-email?token=${token}`;
    await this.emailProvider.send({
      to: user.email,
      subject: 'Verify your email',
      text: `Verify your email by visiting: ${link}\nThis link expires in 24 hours.`,
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const result = await this.verificationTokenService.verifyByRawToken('email_verification', token);
    if (!result) throw new UnauthorizedException('Invalid or expired verification token');

    await this.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, result.userId));
    await this.auditLog.record({
      actorUserId: result.userId,
      action: 'user.email_verified',
      targetType: 'user',
      targetId: result.userId,
    });
  }

  /** Always resolves without revealing whether the email is registered — no user enumeration. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return;

    const token = await this.verificationTokenService.issueOpaqueToken(
      user.id,
      'password_reset',
      user.email,
      PASSWORD_RESET_TTL_MINUTES,
    );
    const link = `${this.config.appBaseUrl}/reset-password?token=${token}`;

    await this.emailProvider
      .send({
        to: user.email,
        subject: 'Reset your password',
        text: `Reset your password by visiting: ${link}\nThis link expires in 30 minutes. If you didn't request this, ignore this email.`,
      })
      .catch((error: unknown) => {
        this.logger.warn(`Failed to send password reset email for ${user.id}: ${String(error)}`);
      });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const result = await this.verificationTokenService.verifyByRawToken('password_reset', token);
    if (!result) throw new UnauthorizedException('Invalid or expired reset token');

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.db
      .update(authIdentities)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(authIdentities.userId, result.userId), eq(authIdentities.provider, 'password')));

    await this.sessionService.revokeAllForUser(result.userId, 'password_changed');

    await this.auditLog.record({
      actorUserId: result.userId,
      action: 'user.password_reset',
      targetType: 'user',
      targetId: result.userId,
    });
  }

  // ---- phone verification (OTP) ------------------------------------------

  async requestPhoneOtp(userId: string, phone: string): Promise<void> {
    const code = await this.verificationTokenService.issueOtp(userId, 'phone_otp', phone, PHONE_OTP_TTL_MINUTES);

    try {
      await this.smsProvider.sendOtp(phone, code);
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) {
        throw new NotImplementedException(error.message);
      }
      throw error;
    }
  }

  async verifyPhoneOtp(userId: string, phone: string, code: string): Promise<void> {
    const verifiedUserId = await this.verificationTokenService.verify('phone_otp', phone, code);
    if (!verifiedUserId || verifiedUserId !== userId) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    await this.db
      .update(users)
      .set({ phone, phoneVerifiedAt: new Date() })
      .where(eq(users.id, userId));

    await this.auditLog.record({
      actorUserId: userId,
      action: 'user.phone_verified',
      targetType: 'user',
      targetId: userId,
    });
  }

  // ---- two-factor authentication ------------------------------------------

  async setupTwoFactor(userId: string, accountLabel: string): Promise<{ provisioningUri: string }> {
    const [existing] = await this.db
      .select()
      .from(twoFactorMethods)
      .where(eq(twoFactorMethods.userId, userId))
      .limit(1);

    if (existing?.enabledAt) {
      throw new ConflictException('Two-factor authentication is already enabled');
    }

    const { secretBase32, provisioningUri } = this.twoFactorService.generateEnrollment(accountLabel);
    const secretCiphertext = this.encryptionService.encrypt(secretBase32);

    if (existing) {
      await this.db
        .update(twoFactorMethods)
        .set({ secretCiphertext, updatedAt: new Date() })
        .where(eq(twoFactorMethods.userId, userId));
    } else {
      await this.db.insert(twoFactorMethods).values({ userId, secretCiphertext });
    }

    return { provisioningUri };
  }

  async confirmTwoFactor(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const [pending] = await this.db
      .select()
      .from(twoFactorMethods)
      .where(and(eq(twoFactorMethods.userId, userId), isNull(twoFactorMethods.enabledAt)))
      .limit(1);

    if (!pending) throw new ConflictException('No pending two-factor setup found');

    const secret = this.encryptionService.decrypt(pending.secretCiphertext);
    if (!this.twoFactorService.verifyCode(secret, code)) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    await this.db
      .update(twoFactorMethods)
      .set({ enabledAt: new Date() })
      .where(eq(twoFactorMethods.userId, userId));

    const { raw, hashes } = this.twoFactorService.generateBackupCodes();
    await this.db
      .insert(twoFactorBackupCodes)
      .values(hashes.map((codeHash) => ({ userId, codeHash })));

    await this.auditLog.record({ actorUserId: userId, action: 'user.2fa_enabled', targetType: 'user', targetId: userId });

    return { backupCodes: raw };
  }

  async disableTwoFactor(userId: string, password: string): Promise<void> {
    const [identity] = await this.db
      .select()
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, 'password')))
      .limit(1);

    if (!identity?.passwordHash || !(await this.passwordService.verify(password, identity.passwordHash))) {
      throw new UnauthorizedException('Invalid password');
    }

    await this.db.delete(twoFactorBackupCodes).where(eq(twoFactorBackupCodes.userId, userId));
    await this.db.delete(twoFactorMethods).where(eq(twoFactorMethods.userId, userId));

    await this.auditLog.record({ actorUserId: userId, action: 'user.2fa_disabled', targetType: 'user', targetId: userId });
  }

  private async tryConsumeBackupCode(userId: string, code: string): Promise<boolean> {
    const codeHash = this.twoFactorService.hashBackupCode(code);
    const [row] = await this.db
      .select()
      .from(twoFactorBackupCodes)
      .where(
        and(
          eq(twoFactorBackupCodes.userId, userId),
          eq(twoFactorBackupCodes.codeHash, codeHash),
          isNull(twoFactorBackupCodes.usedAt),
        ),
      )
      .limit(1);

    if (!row) return false;

    const consumed = await this.db
      .update(twoFactorBackupCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(twoFactorBackupCodes.id, row.id), isNull(twoFactorBackupCodes.usedAt)))
      .returning({ id: twoFactorBackupCodes.id });

    return Boolean(consumed?.[0]);
  }

  // ---- Google OAuth --------------------------------------------------------

  getGoogleAuthorizationUrl(): string {
    if (!this.googleProvider.isConfigured()) {
      throw new NotImplementedException('Google OAuth is not configured on this deployment');
    }
    const state = this.tokenService.signOAuthState();
    return this.googleProvider.getAuthorizationUrl(state);
  }

  async handleGoogleCallback(code: string, state: string, meta: SessionMeta): Promise<AuthResult> {
    if (!this.googleProvider.isConfigured()) {
      throw new NotImplementedException('Google OAuth is not configured on this deployment');
    }
    this.tokenService.verifyOAuthState(state);

    const info = await this.googleProvider.exchangeCodeForUserInfo(code);

    const [existingIdentity] = await this.db
      .select()
      .from(authIdentities)
      .where(and(eq(authIdentities.provider, 'google'), eq(authIdentities.providerUserId, info.providerUserId)))
      .limit(1);

    let user: User | undefined;

    if (existingIdentity) {
      user = await this.usersService.findById(existingIdentity.userId);
    } else {
      const email = this.usersService.normalizeEmail(info.email);
      const existingByEmail = await this.usersService.findByEmail(email);

      if (existingByEmail) {
        user = existingByEmail;
        await this.db
          .insert(authIdentities)
          .values({ userId: user.id, provider: 'google', providerUserId: info.providerUserId });
      } else {
        user = await this.db.transaction(async (tx) => {
          const [newUser] = await tx
            .insert(users)
            .values({ email, emailVerifiedAt: info.emailVerified ? new Date() : null })
            .returning();
          const created = newUser as User;

          await tx.insert(userProfiles).values({ userId: created.id });
          await tx
            .insert(authIdentities)
            .values({ userId: created.id, provider: 'google', providerUserId: info.providerUserId });
          await tx.insert(userRoles).values({ userId: created.id, roleKey: ROLES.USER });

          return created;
        });

        await this.auditLog.record({
          actorUserId: user.id,
          action: 'user.registered',
          targetType: 'user',
          targetId: user.id,
          metadata: { via: 'google' },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      }
    }

    if (!user) throw new UnauthorizedException('Unable to resolve Google account to a user');
    if (user.status !== 'active') throw new ForbiddenException(`Account is ${user.status}`);

    await this.auditLog.record({
      actorUserId: user.id,
      action: 'user.login',
      targetType: 'user',
      targetId: user.id,
      metadata: { via: 'google' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return this.issueSession(user, meta);
  }

  // ---- shared helpers --------------------------------------------------

  private async issueSession(user: User, meta: SessionMeta): Promise<AuthResult> {
    const { session, refreshTokenRaw } = await this.sessionService.createSession(user.id, meta);
    const accessToken = this.tokenService.signAccessToken(user.id, session.id);
    return { accessToken, refreshToken: refreshTokenRaw, user: toPublicUser(user) };
  }

  private assertMinimumAge(dateOfBirth: string): void {
    const dob = new Date(dateOfBirth);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - MIN_AGE_YEARS);
    if (dob > cutoff) {
      throw new ForbiddenException(`You must be at least ${MIN_AGE_YEARS} to register`);
    }
  }
}
