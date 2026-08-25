import * as OTPAuth from 'otpauth';

import { TwoFactorService } from './two-factor.service';

describe('TwoFactorService', () => {
  const service = new TwoFactorService();

  it('generates an enrollment secret with a valid provisioning URI', () => {
    const { secretBase32, provisioningUri } = service.generateEnrollment('user@example.com');
    expect(secretBase32.length).toBeGreaterThan(0);
    expect(provisioningUri).toMatch(/^otpauth:\/\/totp\//);
  });

  it('verifies a correctly generated current code', () => {
    const { secretBase32 } = service.generateEnrollment('user@example.com');
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    const code = totp.generate();

    expect(service.verifyCode(secretBase32, code)).toBe(true);
  });

  it('rejects an incorrect code', () => {
    const { secretBase32 } = service.generateEnrollment('user@example.com');
    expect(service.verifyCode(secretBase32, '000000')).toBe(false);
  });

  it('generates unique, consistently-hashable backup codes', () => {
    const { raw, hashes } = service.generateBackupCodes();
    expect(raw).toHaveLength(10);
    expect(new Set(raw).size).toBe(10);
    expect(hashes[0]).toBe(service.hashBackupCode(raw[0] as string));
    expect(hashes[0]).not.toBe(raw[0]);
  });
});
