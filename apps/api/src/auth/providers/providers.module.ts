import { Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { ConfigModule } from '../../config/config.module';
import { ConsoleEmailProvider } from './email/console-email.provider';
import { EMAIL_PROVIDER } from './email/email-provider.interface';
import { UnconfiguredEmailProvider } from './email/unconfigured-email.provider';
import { GoogleOAuthProvider } from './oauth/google-oauth.provider';
import { OAUTH_GOOGLE_PROVIDER } from './oauth/oauth-provider.interface';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { SMS_PROVIDER } from './sms/sms-provider.interface';
import { TwilioSmsProvider } from './sms/twilio-sms.provider';
import { UnconfiguredSmsProvider } from './sms/unconfigured-sms.provider';

/**
 * Selects the concrete provider implementation per environment:
 *  - credentials configured -> the real adapter, everywhere.
 *  - not configured, non-production -> a clearly-labeled console stub.
 *  - not configured, production -> an adapter that fails loudly per call
 *    rather than either crashing boot or silently pretending to succeed.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    GoogleOAuthProvider,
    {
      provide: OAUTH_GOOGLE_PROVIDER,
      useExisting: GoogleOAuthProvider,
    },
    TwilioSmsProvider,
    ConsoleSmsProvider,
    UnconfiguredSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [AppConfigService, TwilioSmsProvider, ConsoleSmsProvider, UnconfiguredSmsProvider],
      useFactory: (
        config: AppConfigService,
        twilio: TwilioSmsProvider,
        dev: ConsoleSmsProvider,
        unconfigured: UnconfiguredSmsProvider,
      ) => {
        if (config.twilio) return twilio;
        return config.isProduction ? unconfigured : dev;
      },
    },
    ConsoleEmailProvider,
    UnconfiguredEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [AppConfigService, ConsoleEmailProvider, UnconfiguredEmailProvider],
      useFactory: (config: AppConfigService, dev: ConsoleEmailProvider, unconfigured: UnconfiguredEmailProvider) =>
        config.isProduction ? unconfigured : dev,
    },
  ],
  exports: [OAUTH_GOOGLE_PROVIDER, SMS_PROVIDER, EMAIL_PROVIDER],
})
export class ProvidersModule {}
