import { Injectable } from '@nestjs/common';

import { ProviderNotConfiguredError } from '../provider-not-configured.error';
import type { SmsProvider } from './sms-provider.interface';

/** Selected in production when Twilio isn't configured — fails loudly per call, never silently. */
@Injectable()
export class UnconfiguredSmsProvider implements SmsProvider {
  readonly name = 'SMS (unconfigured)';

  async sendOtp(): Promise<void> {
    await Promise.resolve();
    throw new ProviderNotConfiguredError('SMS provider');
  }
}
