import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import { Public } from '../authorization/decorators/public.decorator';
import type { RequestUser } from '../authorization/types/request-user';
// Value import: constructor-injected without an explicit `@Inject()` token.
import { AppConfigService } from '../config/app-config.service';
import { AuthService, type AuthResult, type TwoFactorChallenge } from './auth.service';
// Value imports below: every DTO here is read via `@Body()`/`@Query()`,
// which NestJS's ValidationPipe resolves through emitted `design:paramtypes`
// metadata to know what class to validate/transform against. `import type`
// would make that metatype `Object`, and ValidationPipe silently skips
// validation for that — see eslint.config.js for why the auto-fixable
// `consistent-type-imports` rule is off in this app.
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { Login2faDto } from './dto/login-2fa.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPhoneOtpDto, VerifyPhoneOtpDto } from './dto/phone-otp.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConfirmTwoFactorDto, DisableTwoFactorDto } from './dto/two-factor.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import type { SessionMeta } from './services/session.service';

function metaFromRequest(req: Request): SessionMeta {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthResult> {
    return this.authService.register(dto, metaFromRequest(req));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResult | TwoFactorChallenge> {
    return this.authService.login(dto, metaFromRequest(req));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login/2fa')
  loginWithTwoFactor(@Body() dto: Login2faDto, @Req() req: Request): Promise<AuthResult> {
    return this.authService.loginWithTwoFactor(dto.challengeToken, dto.code, metaFromRequest(req));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthResult> {
    const refreshToken = dto.refreshToken ?? readCookie(req, 'fenticoin_refresh_token');
    if (!refreshToken) throw new UnauthorizedException('Refresh token is required');
    return this.authService.refresh(refreshToken, metaFromRequest(req));
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@CurrentUser() user: RequestUser): Promise<void> {
    await this.authService.logout(user.sessionId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: RequestUser): Promise<void> {
    await this.authService.logoutAll(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: RequestUser): RequestUser {
    return user;
  }

  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('password/forgot')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If an account exists for this email, a reset link has been sent.' };
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('email/verify')
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.authService.verifyEmail(dto.token);
  }

  @HttpCode(HttpStatus.ACCEPTED)
  @Post('phone/otp/request')
  async requestPhoneOtp(@CurrentUser() user: RequestUser, @Body() dto: RequestPhoneOtpDto): Promise<{ message: string }> {
    await this.authService.requestPhoneOtp(user.id, dto.phone);
    return { message: 'Verification code sent.' };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('phone/otp/verify')
  async verifyPhoneOtp(@CurrentUser() user: RequestUser, @Body() dto: VerifyPhoneOtpDto): Promise<void> {
    await this.authService.verifyPhoneOtp(user.id, dto.phone, dto.code);
  }

  @Post('2fa/setup')
  setupTwoFactor(@CurrentUser() user: RequestUser): Promise<{ provisioningUri: string }> {
    return this.authService.setupTwoFactor(user.id, user.email);
  }

  @Post('2fa/confirm')
  confirmTwoFactor(
    @CurrentUser() user: RequestUser,
    @Body() dto: ConfirmTwoFactorDto,
  ): Promise<{ backupCodes: string[] }> {
    return this.authService.confirmTwoFactor(user.id, dto.code);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('2fa/disable')
  async disableTwoFactor(@CurrentUser() user: RequestUser, @Body() dto: DisableTwoFactorDto): Promise<void> {
    await this.authService.disableTwoFactor(user.id, dto.password);
  }

  @Public()
  @Get('oauth/google')
  googleStart(@Res() res: Response): void {
    const url = this.authService.getGoogleAuthorizationUrl();
    res.redirect(url);
  }

  @Public()
  @Get('oauth/google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.authService.handleGoogleCallback(code, state, metaFromRequest(req));
    const secure = this.config.isProduction;
    res.cookie('fenticoin_access_token', result.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: this.config.accessTokenTtlSeconds * 1000 });
    res.cookie('fenticoin_refresh_token', result.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000 });
    res.redirect(new URL('/dashboard', this.config.appBaseUrl).toString());
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const value = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : undefined;
}
