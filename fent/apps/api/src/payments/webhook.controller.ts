import { Controller, HttpCode, HttpStatus, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../authorization/decorators/public.decorator';
import { WebhookService } from './webhook.service';

/**
 * Inbound payment provider webhooks. `@Public()` because the caller is
 * the provider's server, not a logged-in user — authentication here is
 * entirely the provider's own signature mechanism, verified inside
 * `WebhookService`/`PaymentProvider.parseWebhookEvent`, never a bearer
 * token. Reads `req.rawBody` (see `main.ts`'s `rawBody: true`) rather
 * than the parsed `req.body`: signature verification must hash/sign the
 * exact bytes the provider sent, not a re-serialization of them.
 */
@Public()
@Controller('payments/webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  // 'x-webhook-signature' is a placeholder header name — every real
  // provider uses its own convention (e.g. `Stripe-Signature`,
  // `X-MPesa-Signature`). Update this once a provider is chosen; nothing
  // else about the flow (raw-body hashing, verification, idempotency)
  // needs to change.
  @HttpCode(HttpStatus.OK)
  @Post()
  async handleWebhook(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-webhook-signature') signature?: string) {
    const rawBody = (req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}))).toString('utf8');
    const result = await this.webhookService.handleWebhook(rawBody, signature);
    return { received: true, outcome: result.outcome };
  }
}
