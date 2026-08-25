import { Injectable } from '@nestjs/common';

// Value import: constructor-injected without an explicit `@Inject()` token.
import { AppConfigService } from '../../../config/app-config.service';
import { ProviderNotConfiguredError } from '../provider-not-configured.error';
import type { SmsProvider } from './sms-provider.interface';

/** Real client against Twilio's REST API (no SDK needed — it's one POST). */
@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'Twilio SMS';

  constructor(private readonly config: AppConfigService) {}

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    const twilio = this.config.twilio;
    if (!twilio) throw new ProviderNotConfiguredError(this.name);

    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`;
    const credentials = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phoneE164,
        From: twilio.fromNumber,
        Body: `Your FentiCoin verification code is ${code}. It expires in 10 minutes.`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Twilio send failed with status ${response.status}`);
    }
  }
}
