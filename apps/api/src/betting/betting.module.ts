import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { MarketsModule } from '../markets/markets.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminBettingController } from './admin-betting.controller';
import { BetSettlementScheduler } from './bet-settlement.scheduler';
import { BettingConfigService } from './betting-config.service';
import { BettingController } from './betting.controller';
import { BettingEligibilityService } from './betting-eligibility.service';
import { BettingService } from './betting.service';
import { BetContractRegistry } from './contracts/bet-contract.registry';
import { HigherLowerContract } from './contracts/higher-lower.contract';
import { RiseFallContract } from './contracts/rise-fall.contract';
import { UpDownContract } from './contracts/up-down.contract';
import { OddsEngine } from './odds-engine';
import { SettlementService } from './settlement.service';

@Module({
  // ScheduleModule is registered globally by MarketsModule (imported
  // above) — @Cron discovery works app-wide once registered anywhere, so
  // it must not be re-registered here.
  imports: [AuditModule, MarketsModule, WalletModule, UsersModule],
  controllers: [BettingController, AdminBettingController],
  providers: [
    RiseFallContract,
    HigherLowerContract,
    UpDownContract,
    BetContractRegistry,
    OddsEngine,
    BettingConfigService,
    BettingEligibilityService,
    BettingService,
    SettlementService,
    BetSettlementScheduler,
  ],
  exports: [BettingService, SettlementService, BettingConfigService],
})
export class BettingModule {}
