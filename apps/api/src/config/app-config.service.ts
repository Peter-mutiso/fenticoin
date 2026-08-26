import { Injectable } from '@nestjs/common';
// Value import: constructor-injected without an explicit `@Inject()` token.
import { ConfigService } from '@nestjs/config';

import type { Env } from './env.schema';

/**
 * Thin, typed facade over `@nestjs/config`'s stringly-typed `ConfigService`.
 * Consumers ask for `appConfig.port` instead of `configService.get('PORT')`,
 * which keeps env-variable naming an internal detail of this one file.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.configService.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.get('PORT');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get corsAllowedOrigins(): string[] {
    return this.get('CORS_ALLOWED_ORIGINS');
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.get('LOG_LEVEL');
  }

  get appBaseUrl(): string {
    return this.get('APP_BASE_URL');
  }

  get jwtSecret(): string {
    return this.get('AUTH_JWT_SECRET');
  }

  get accessTokenTtlSeconds(): number {
    return this.get('AUTH_ACCESS_TOKEN_TTL_SECONDS');
  }

  get refreshTokenTtlDays(): number {
    return this.get('AUTH_REFRESH_TOKEN_TTL_DAYS');
  }

  get encryptionKeyHex(): string {
    return this.get('ENCRYPTION_KEY');
  }

  get google(): { clientId: string; clientSecret: string; redirectUri: string } | undefined {
    const clientId = this.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.get('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.get('GOOGLE_REDIRECT_URI');
    if (!clientId || !clientSecret || !redirectUri) return undefined;
    return { clientId, clientSecret, redirectUri };
  }

  get twilio(): { accountSid: string; authToken: string; fromNumber: string } | undefined {
    const accountSid = this.get('TWILIO_ACCOUNT_SID');
    const authToken = this.get('TWILIO_AUTH_TOKEN');
    const fromNumber = this.get('TWILIO_FROM_NUMBER');
    if (!accountSid || !authToken || !fromNumber) return undefined;
    return { accountSid, authToken, fromNumber };
  }

  get marketDataProvider(): Env['MARKET_DATA_PROVIDER'] {
    return this.get('MARKET_DATA_PROVIDER');
  }

  get coinGeckoApiKey(): string | undefined {
    return this.get('COINGECKO_API_KEY');
  }

  get demoInitialBalanceMinorUnits(): number {
    return this.get('DEMO_INITIAL_BALANCE_MINOR_UNITS');
  }

  get demoCurrency(): string {
    return this.get('DEMO_CURRENCY');
  }
}
