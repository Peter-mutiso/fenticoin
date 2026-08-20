import { randomBytes } from 'node:crypto';

import type { AppConfigService } from '../../config/app-config.service';
import { EncryptionService } from './encryption.service';

function makeService(): EncryptionService {
  const config = { encryptionKeyHex: randomBytes(32).toString('hex') } as AppConfigService;
  return new EncryptionService(config);
}

describe('EncryptionService', () => {
  it('round-trips plaintext', () => {
    const service = makeService();
    const secret = 'JBSWY3DPEHPK3PXP';
    const ciphertext = service.encrypt(secret);

    expect(ciphertext).not.toBe(secret);
    expect(service.decrypt(ciphertext)).toBe(secret);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const service = makeService();
    const a = service.encrypt('same-value');
    const b = service.encrypt('same-value');
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with the wrong key', () => {
    const service = makeService();
    const other = makeService();
    const ciphertext = service.encrypt('top-secret');
    expect(() => other.decrypt(ciphertext)).toThrow();
  });

  it('fails to decrypt tampered ciphertext', () => {
    const service = makeService();
    const ciphertext = service.encrypt('top-secret');
    const buf = Buffer.from(ciphertext, 'base64');
    const lastIndex = buf.length - 1;
    buf[lastIndex] = (buf[lastIndex] ?? 0) ^ 0xff;
    expect(() => service.decrypt(buf.toString('base64'))).toThrow();
  });
});
