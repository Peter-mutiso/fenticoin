describe('getPublicEnv', () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalEnv;
    jest.resetModules();
  });

  it('defaults NEXT_PUBLIC_API_URL when unset', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    jest.resetModules();
    const { getPublicEnv } = await import('./env');
    expect(getPublicEnv().NEXT_PUBLIC_API_URL).toBe('http://localhost:4000');
  });

  it('accepts a valid configured URL', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    jest.resetModules();
    const { getPublicEnv } = await import('./env');
    expect(getPublicEnv().NEXT_PUBLIC_API_URL).toBe('https://api.example.com');
  });

  it('throws on an invalid URL', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'not-a-url';
    jest.resetModules();
    const { getPublicEnv } = await import('./env');
    expect(() => getPublicEnv()).toThrow(/Invalid public environment configuration/);
  });
});
