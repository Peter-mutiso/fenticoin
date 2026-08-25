import { AuthController } from './auth.controller';

describe('AuthController OAuth callback', () => {
  it('sets HttpOnly cookies and redirects without tokens in the URL', async () => {
    const authService = {
      handleGoogleCallback: jest.fn().mockResolvedValue({
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret',
      }),
    };
    const config = {
      appBaseUrl: 'https://app.example.test',
      isProduction: true,
      accessTokenTtlSeconds: 900,
      refreshTokenTtlDays: 30,
    };
    const response = { cookie: jest.fn(), redirect: jest.fn() };
    const controller = new AuthController(authService as never, config as never);

    await controller.googleCallback('code', 'state', { headers: {}, ip: '127.0.0.1' } as never, response as never);

    expect(response.cookie).toHaveBeenCalledWith('fenticoin_access_token', 'access-secret', expect.objectContaining({ httpOnly: true, secure: true }));
    expect(response.cookie).toHaveBeenCalledWith('fenticoin_refresh_token', 'refresh-secret', expect.objectContaining({ httpOnly: true, secure: true }));
    const redirectUrl = response.redirect.mock.calls[0][0] as string;
    expect(redirectUrl).toBe('https://app.example.test/dashboard');
    expect(redirectUrl).not.toContain('access-secret');
    expect(redirectUrl).not.toContain('refresh-secret');
  });
});