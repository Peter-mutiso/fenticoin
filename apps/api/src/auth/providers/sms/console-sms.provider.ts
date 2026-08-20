import { Injectable, Logger } from '@nestjs/common';

import type { SmsProvider } from './sms-provider.interface';

/**
 * Non-production fallback used only when Twilio isn't configured. Writes
 * the OTP to the server log instead of sending it — unmistakably labeled,
 * never selectable in production (see `providers.module.ts`).
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'Console SMS (dev stub)';
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    this.logger.warn(`[DEV SMS STUB] Would send OTP ${code} to ${phoneE164} (Twilio not configured)`);
    await Promise.resolve();
  }
}
