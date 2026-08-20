import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import * as OTPAuth from 'otpauth';

const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const BACKUP_CODE_LENGTH = 10;
const BACKUP_CODE_COUNT = 10;

@Injectable()
export class TwoFactorService {
  /** Generates a fresh TOTP secret plus the `otpauth://` URI an authenticator app scans. */
  generateEnrollment(accountLabel: string): { secretBase32: string; provisioningUri: string } {
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'FentiCoin',
      label: accountLabel,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    return { secretBase32: secret.base32, provisioningUri: totp.toString() };
  }

  /** Verifies a 6-digit code, allowing one 30s step of clock drift either way. */
  verifyCode(secretBase32: string, code: string): boolean {
    const totp = new OTPAuth.TOTP({
      issuer: 'FentiCoin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });

    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  }

  /** Returns raw codes (show once) and their hashes (what actually gets stored). */
  generateBackupCodes(): { raw: string[]; hashes: string[] } {
    const raw = Array.from({ length: BACKUP_CODE_COUNT }, () => this.randomBackupCode());
    return { raw, hashes: raw.map((code) => this.hashBackupCode(code)) };
  }

  hashBackupCode(code: string): string {
    return createHash('sha256').update(code.toUpperCase()).digest('hex');
  }

  private randomBackupCode(): string {
    const bytes = randomBytes(BACKUP_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
      code += BACKUP_CODE_ALPHABET[(bytes[i] as number) % BACKUP_CODE_ALPHABET.length];
    }
    return code;
  }
}
