
import { Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { ConfigModule } from '../../config/config.module';
import { CoinbaseMarketDataProvider } from './coinbase-market-data.provider';
import { DevFixtureMarketDataProvider } from './dev-fixture-market-data.provider';
import { MARKET_DATA_PROVIDER } from './market-data-provider.interface';
import { UnconfiguredMarketDataProvider } from './unconfigured-market-data.provider';

@Module({
  imports: [ConfigModule],

  providers: [
    DevFixtureMarketDataProvider,
    CoinbaseMarketDataProvider,
    UnconfiguredMarketDataProvider,

    {
      provide: MARKET_DATA_PROVIDER,

      inject: [
        AppConfigService,
        DevFixtureMarketDataProvider,
        CoinbaseMarketDataProvider,
        UnconfiguredMarketDataProvider,
      ],

      useFactory: (
        config: AppConfigService,
        devFixture: DevFixtureMarketDataProvider,
        coinbase: CoinbaseMarketDataProvider,
        unconfigured: UnconfiguredMarketDataProvider,
      ): typeof coinbase | typeof devFixture | typeof unconfigured => {
        if (config.marketDataProvider === 'coinbase') {
          return coinbase;
        }

        return config.isProduction ? unconfigured : devFixture;
      },
    },
  ],

  exports: [MARKET_DATA_PROVIDER],
})
export class MarketDataProvidersModule {}
