import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes and verifies a correct password', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify('wrong password', hash)).resolves.toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await service.hash('same-password');
    const b = await service.hash('same-password');
    expect(a).not.toBe(b);
  });

  it('rejects malformed encoded hashes instead of throwing', async () => {
    await expect(service.verify('anything', 'not-a-real-hash')).resolves.toBe(false);
    await expect(service.verify('anything', 'scrypt$bad$params')).resolves.toBe(false);
  });
});
