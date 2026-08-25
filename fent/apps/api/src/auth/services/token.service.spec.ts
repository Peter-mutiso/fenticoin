import { JwtService } from '@nestjs/jwt';

import type { AppConfigService } from '../../config/app-config.service';
import { TokenService } from './token.service';

function makeService(): TokenService {
  const config = {
    jwtSecret: 'a'.repeat(32),
    accessTokenTtlSeconds: 900,
  } as AppConfigService;
  return new TokenService(new JwtService(), config);
}

describe('TokenService', () => {
  it('signs and verifies an access token', () => {
    const service = makeService();
    const token = service.signAccessToken('user-1', 'session-1');
    const payload = service.verifyAccessToken(token);
    expect(payload).toMatchObject({ sub: 'user-1', sid: 'session-1', typ: 'access' });
  });

  it('rejects a tampered access token', () => {
    const service = makeService();
    const token = service.signAccessToken('user-1', 'session-1');
    expect(() => service.verifyAccessToken(`${token}tampered`)).toThrow();
  });

  it('signs and verifies a two-factor challenge token, rejecting the wrong type as an access token', () => {
    const service = makeService();
    const challenge = service.signTwoFactorChallengeToken('user-1');
    expect(service.verifyTwoFactorChallengeToken(challenge)).toMatchObject({
      sub: 'user-1',
      typ: 'two_factor_challenge',
    });
    expect(() => service.verifyAccessToken(challenge)).toThrow();
  });

  it('generates an opaque token whose hash is deterministic but the raw value is not guessable from the hash', () => {
    const service = makeService();
    const { raw, hash } = service.generateOpaqueToken();
    expect(service.hashOpaqueToken(raw)).toBe(hash);
    expect(raw).not.toBe(hash);
  });

  it('generates numeric OTPs of the requested length', () => {
    const service = makeService();
    for (let i = 0; i < 20; i++) {
      const otp = service.generateNumericOtp(6);
      expect(otp).toMatch(/^\d{6}$/);
    }
  });
});
