import { Module } from '@nestjs/common';

import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { UnconfiguredPaymentProvider } from './unconfigured-payment.provider';

@Module({
  providers: [
    UnconfiguredPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: UnconfiguredPaymentProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
