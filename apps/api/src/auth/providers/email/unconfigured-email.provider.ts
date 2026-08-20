import { Injectable } from '@nestjs/common';

import { ProviderNotConfiguredError } from '../provider-not-configured.error';
import type { EmailProvider } from './email-provider.interface';

/** Selected in production until a real email vendor is wired up — fails loudly per call. */
@Injectable()
export class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = 'Email (unconfigured)';

  async send(): Promise<void> {
    await Promise.resolve();
    throw new ProviderNotConfiguredError('Email provider');
  }
}
