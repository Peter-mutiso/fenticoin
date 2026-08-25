import { Injectable, Logger } from '@nestjs/common';

import type { EmailMessage, EmailProvider } from './email-provider.interface';

/**
 * Dev-only fallback. No production email vendor (Postmark/SES/etc.) has
 * been selected yet — this is an intentional extension point, not an
 * oversight. Logs instead of sending; never selected in production (see
 * `providers.module.ts`), where `UnconfiguredEmailProvider` is used instead.
 */
@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'Console Email (dev stub)';
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.warn(
      `[DEV EMAIL STUB] To: ${message.to} | Subject: ${message.subject}\n${message.text}`,
    );
    await Promise.resolve();
  }
}
