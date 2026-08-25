import { Injectable } from '@nestjs/common';

// Value import: constructor-injected without an explicit `@Inject()` token.
import { AppConfigService } from '../../../config/app-config.service';
import { ProviderNotConfiguredError } from '../provider-not-configured.error';
import type { OAuthProvider, OAuthUserInfo } from './oauth-provider.interface';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

interface GoogleUserInfoResponse {
  sub: string;
  email: string;
  email_verified: boolean;
}

/**
 * A real client against Google's actual OAuth 2.0 / OpenID Connect
 * endpoints — not a mock. It simply has nothing to authenticate with until
 * `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` are set
 * (see `.env.example`), at which point it works against production Google
 * with zero code changes.
 */
@Injectable()
export class GoogleOAuthProvider implements OAuthProvider {
  readonly name = 'Google OAuth';

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return this.config.google !== undefined;
  }

  getAuthorizationUrl(state: string): string {
    const google = this.requireConfig();
    const params = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: google.redirectUri,
      response_type: 'code',
      scope: 'openid email',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCodeForUserInfo(code: string): Promise<OAuthUserInfo> {
    const google = this.requireConfig();

    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: google.clientId,
        client_secret: google.clientSecret,
        code,
        redirect_uri: google.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Google token exchange failed with status ${tokenResponse.status}`);
    }
    const tokens = (await tokenResponse.json()) as GoogleTokenResponse;

    const userInfoResponse = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userInfoResponse.ok) {
      throw new Error(`Google userinfo request failed with status ${userInfoResponse.status}`);
    }
    const userInfo = (await userInfoResponse.json()) as GoogleUserInfoResponse;

    return {
      providerUserId: userInfo.sub,
      email: userInfo.email,
      emailVerified: userInfo.email_verified,
    };
  }

  private requireConfig() {
    const google = this.config.google;
    if (!google) throw new ProviderNotConfiguredError(this.name);
    return google;
  }
}
