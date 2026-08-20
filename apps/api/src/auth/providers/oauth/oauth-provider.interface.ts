export interface OAuthUserInfo {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
}

export interface OAuthProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Builds the URL the browser is redirected to; `state` must be a caller-generated CSRF nonce. */
  getAuthorizationUrl(state: string): string;
  /** Exchanges the callback `code` for verified identity info. Throws `ProviderNotConfiguredError` if unconfigured. */
  exchangeCodeForUserInfo(code: string): Promise<OAuthUserInfo>;
}

export const OAUTH_GOOGLE_PROVIDER = Symbol('OAUTH_GOOGLE_PROVIDER');
