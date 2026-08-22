import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../authorization/permissions.catalog';
import type { RequestUser } from '../authorization/types/request-user';
import { DepositService } from './deposit.service';
import { ListDepositsQueryDto } from './dto/list-deposits-query.dto';
import { ListWithdrawalsQueryDto } from './dto/list-withdrawals-query.dto';
import { ResolveDepositDto } from './dto/resolve-deposit.dto';
import { WithdrawalActionReasonDto } from './dto/withdrawal-action-reason.dto';
import { serializeDeposit, serializeWebhookReceipt, serializeWithdrawal } from './mappers';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaymentWebhookReceiptService } from './payment-webhook-receipt.service';
import { WithdrawalService } from './withdrawal.service';

/**
 * Admin payment operations. Reads require `deposits.view`/`withdrawals.view`;
 * approving/rejecting/reversing a withdrawal or manually resolving a
 * stuck deposit requires the matching `*.approve` permission — never
 * inferred from a role name, enforced server-side by `PermissionsGuard`.
 */
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(
    private readonly depositService: DepositService,
    private readonly withdrawalService: WithdrawalService,
    private readonly receiptService: PaymentWebhookReceiptService,
    private readonly reconciliationService: PaymentReconciliationService,
  ) {}

  // ---- deposits -----------------------------------------------------------

  @RequirePermissions(PERMISSIONS.DEPOSITS_VIEW)
  @Get('deposits')
  async listDeposits(@Query() query: ListDepositsQueryDto) {
    const items = await this.depositService.listAll({
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
      status: query.status,
      userId: query.userId,
    });
    return { items: items.map(serializeDeposit) };
  }

  @RequirePermissions(PERMISSIONS.DEPOSITS_VIEW)
  @Get('deposits/:id')
  async getDeposit(@Param('id') id: string) {
    return serializeDeposit(await this.depositService.getById(id));
  }

  /** Full history of every webhook delivery attempt for this deposit — the "investigate" tool. */
  @RequirePermissions(PERMISSIONS.DEPOSITS_VIEW)
  @Get('deposits/:id/webhook-receipts')
  async getDepositWebhookReceipts(@Param('id') id: string) {
    const items = await this.receiptService.listForDeposit(id);
    return { items: items.map(serializeWebhookReceipt) };
  }

  /** Manual resolution for a deposit stuck/ambiguous after out-of-band investigation — skips re-verification, requires a reason, fully audited. */
  @RequirePermissions(PERMISSIONS.DEPOSITS_APPROVE)
  @Post('deposits/:id/resolve')
  async resolveDeposit(@Param('id') id: string, @Body() dto: ResolveDepositDto, @CurrentUser() actor: RequestUser) {
    const deposit = await this.depositService.resolveManually(id, dto.outcome, actor.id, dto.reason);
    return serializeDeposit(deposit);
  }

  @RequirePermissions(PERMISSIONS.DEPOSITS_APPROVE)
  @Post('reconcile/deposits')
  async reconcileDeposits() {
    return this.reconciliationService.reconcilePendingDeposits();
  }

  // ---- withdrawals ----------------------------------------------------------

  @RequirePermissions(PERMISSIONS.WITHDRAWALS_VIEW)
  @Get('withdrawals')
  async listWithdrawals(@Query() query: ListWithdrawalsQueryDto) {
    const items = await this.withdrawalService.listAll({
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
      status: query.status,
      userId: query.userId,
    });
    return { items: items.map(serializeWithdrawal) };
  }

  @RequirePermissions(PERMISSIONS.WITHDRAWALS_VIEW)
  @Get('withdrawals/:id')
  async getWithdrawal(@Param('id') id: string) {
    return serializeWithdrawal(await this.withdrawalService.getById(id));
  }

  @RequirePermissions(PERMISSIONS.WITHDRAWALS_VIEW)
  @Get('withdrawals/:id/webhook-receipts')
  async getWithdrawalWebhookReceipts(@Param('id') id: string) {
    const items = await this.receiptService.listForWithdrawal(id);
    return { items: items.map(serializeWebhookReceipt) };
  }

  @RequirePermissions(PERMISSIONS.WITHDRAWALS_APPROVE)
  @Post('withdrawals/:id/approve')
  async approveWithdrawal(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    const withdrawal = await this.withdrawalService.reviewWithdrawal(id, 'approve', actor.id);
    return serializeWithdrawal(withdrawal);
  }

  @RequirePermissions(PERMISSIONS.WITHDRAWALS_APPROVE)
  @Post('withdrawals/:id/reject')
  async rejectWithdrawal(@Param('id') id: string, @Body() dto: WithdrawalActionReasonDto, @CurrentUser() actor: RequestUser) {
    const withdrawal = await this.withdrawalService.reviewWithdrawal(id, 'reject', actor.id, dto.reason);
    return serializeWithdrawal(withdrawal);
  }

  @RequirePermissions(PERMISSIONS.WITHDRAWALS_APPROVE)
  @Post('withdrawals/:id/reverse')
  async reverseWithdrawal(@Param('id') id: string, @Body() dto: WithdrawalActionReasonDto, @CurrentUser() actor: RequestUser) {
    const withdrawal = await this.withdrawalService.reverseWithdrawal(id, actor.id, dto.reason);
    return serializeWithdrawal(withdrawal);
  }

  @RequirePermissions(PERMISSIONS.WITHDRAWALS_APPROVE)
  @Post('reconcile/withdrawals')
  async reconcileWithdrawals() {
    return this.reconciliationService.reconcilePendingWithdrawals();
  }
}
