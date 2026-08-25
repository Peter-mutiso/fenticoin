import { Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { ConfigModule } from '../../config/config.module';
import { CoinGeckoMarketDataProvider } from './coingecko-market-data.provider';
import { DevFixtureMarketDataProvider } from './dev-fixture-market-data.provider';
import { MARKET_DATA_PROVIDER } from './market-data-provider.interface';
import { UnconfiguredMarketDataProvider } from './unconfigured-market-data.provider';

/**
 * Selection logic (deliberately conservative about production):
 *  - `MARKET_DATA_PROVIDER=coingecko` -> the real CoinGecko adapter, in
 *    any environment (an explicit opt-in).
 *  - otherwise, in production -> `UnconfiguredMarketDataProvider`, which
 *    fails loudly rather than silently picking a provider nobody vetted
 *    for production load/rate-limits.
 *  - otherwise (local/dev/test) -> the dev fixture, clearly labeled as
 *    simulated data.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    DevFixtureMarketDataProvider,
    CoinGeckoMarketDataProvider,
    UnconfiguredMarketDataProvider,
    {
      provide: MARKET_DATA_PROVIDER,
      inject: [AppConfigService, DevFixtureMarketDataProvider, CoinGeckoMarketDataProvider, UnconfiguredMarketDataProvider],
      useFactory: (
        config: AppConfigService,
        devFixture: DevFixtureMarketDataProvider,
        coinGecko: CoinGeckoMarketDataProvider,
        unconfigured: UnconfiguredMarketDataProvider,
      ) => {
        if (config.marketDataProvider === 'coingecko') return coinGecko;
        return config.isProduction ? unconfigured : devFixture;
      },
    },
  ],
  exports: [MARKET_DATA_PROVIDER],
})
export class MarketDataProvidersModule {}
