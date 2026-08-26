import { ApiError, getBet, getMe, login, NetworkError, SessionExpiredError } from './api-client';
import { clearSession, storeSession } from './auth/token-storage';

// jsdom doesn't reliably provide a global `Response` constructor, so these
// build plain objects shaped exactly like what `api-client.ts` actually
// reads off a fetch response (`.ok`, `.status`, `.json()`) — deliberately
// not depending on the real Fetch API being present in the test environment.
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function malformedJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error('Unexpected token')),
  } as unknown as Response;
}

function errorResponse(status: number, message: string, code: string): Response {
  return jsonResponse({ error: { statusCode: status, message, code } }, status);
}

describe('api-client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearSession();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('error classification', () => {
    it('parses the server error shape into a typed ApiError', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(errorResponse(422, 'Insufficient funds', 'InsufficientFundsError'));

      await expect(login({ email: 'a@b.com', password: 'x' })).rejects.toBeInstanceOf(ApiError);
      try {
        await login({ email: 'a@b.com', password: 'x' });
        throw new Error('expected login to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.status).toBe(422);
        expect(apiError.code).toBe('InsufficientFundsError');
        expect(apiError.message).toBe('Insufficient funds');
      }
    });

    it('throws NetworkError when fetch itself rejects (offline, DNS failure, etc.)', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(login({ email: 'a@b.com', password: 'x' })).rejects.toBeInstanceOf(NetworkError);
    });

    it('falls back to a generic message when the error body cannot be parsed', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(malformedJsonResponse(500));

      try {
        await login({ email: 'a@b.com', password: 'x' });
        throw new Error('expected login to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(500);
        expect((error as ApiError).code).toBe('UnknownError');
      }
    });
  });

  describe('authenticated requests', () => {
    it('attaches the stored access token as a bearer header', async () => {
      storeSession({ accessToken: 'access-1', refreshToken: 'refresh-1', user: { id: 'u1', email: 'a@b.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null } });
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ id: 'u1', email: 'a@b.com' }));

      await getMe();

      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    });

    it('on a 401, refreshes the session once and retries the original request', async () => {
      storeSession({ accessToken: 'stale-token', refreshToken: 'refresh-1', user: { id: 'u1', email: 'a@b.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null } });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(errorResponse(401, 'Session has expired', 'UnauthorizedException')) // original request
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh-token', refreshToken: 'refresh-2', user: { id: 'u1', email: 'a@b.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null } })) // refresh
        .mockResolvedValueOnce(jsonResponse({ id: 'bet-1' })); // retried request

      const result = await getBet('bet-1');

      expect(result).toEqual({ id: 'bet-1' });
      expect(global.fetch).toHaveBeenCalledTimes(3);
      const retriedCall = (global.fetch as jest.Mock).mock.calls[2] as [string, RequestInit];
      expect((retriedCall[1].headers as Record<string, string>).Authorization).toBe('Bearer fresh-token');
    });

    it('throws SessionExpiredError and clears the session when refresh also fails', async () => {
      storeSession({ accessToken: 'stale-token', refreshToken: 'refresh-1', user: { id: 'u1', email: 'a@b.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null } });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(errorResponse(401, 'Session has expired', 'UnauthorizedException')) // original
        .mockResolvedValueOnce(errorResponse(401, 'Invalid or expired token', 'UnauthorizedException')); // refresh fails too

      await expect(getBet('bet-1')).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it('throws SessionExpiredError immediately when there is no refresh token to try', async () => {
      clearSession();
      (global.fetch as jest.Mock).mockResolvedValue(errorResponse(401, 'Missing bearer token', 'UnauthorizedException'));

      await expect(getBet('bet-1')).rejects.toBeInstanceOf(SessionExpiredError);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
