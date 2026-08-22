import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, ne } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type Instrument, type InstrumentStatus, instruments } from '../database/schema';
import { buildInstrumentStatusEvent } from '../realtime/realtime-events';
import { SUPPORTED_CURRENCIES } from '../wallet/wallet.constants';
import type { MarketSessionSchedule } from './market-session';

export interface CreateInstrumentInput {
  symbol: string;
  quoteCurrency: string;
  name: string;
  categoryKey: string;
  providerSymbol?: string;
  pricePrecision?: number;
  maxPriceAgeSeconds?: number;
  tradingSchedule?: MarketSessionSchedule;
  createdBy: string;
}

export interface UpdateInstrumentInput {
  name?: string;
  providerSymbol?: string;
  categoryKey?: string;
  maxPriceAgeSeconds?: number;
  tradingSchedule?: MarketSessionSchedule | null;
}

export interface SetInstrumentStatusInput {
  instrumentId: string;
  status: InstrumentStatus;
  actorUserId: string;
  reason: string;
}

@Injectable()
export class InstrumentService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly auditLog: AuditLogService,
    private readonly events: EventEmitter2,
  ) {}

  async list(params: { includeDelisted?: boolean; categoryKey?: string } = {}): Promise<Instrument[]> {
    const conditions = [];
    if (!params.includeDelisted) {
      conditions.push(ne(instruments.status, 'delisted'));
    }
    if (params.categoryKey) {
      conditions.push(eq(instruments.categoryKey, params.categoryKey));
    }

    return this.db
      .select()
      .from(instruments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(instruments.createdAt));
  }

  async getById(id: string): Promise<Instrument> {
    const [instrument] = await this.db.select().from(instruments).where(eq(instruments.id, id)).limit(1);
    if (!instrument) throw new NotFoundException(`Instrument ${id} not found`);
    return instrument;
  }

  async getBySymbol(symbol: string, quoteCurrency: string): Promise<Instrument> {
    const [instrument] = await this.db
      .select()
      .from(instruments)
      .where(and(eq(instruments.symbol, symbol.toUpperCase()), eq(instruments.quoteCurrency, quoteCurrency.toUpperCase())))
      .limit(1);
    if (!instrument) throw new NotFoundException(`Instrument ${symbol}/${quoteCurrency} not found`);
    return instrument;
  }

  async create(input: CreateInstrumentInput): Promise<Instrument> {
    const symbol = input.symbol.toUpperCase();
    const quoteCurrency = input.quoteCurrency.toUpperCase();

    if (!SUPPORTED_CURRENCIES.includes(quoteCurrency)) {
      throw new ConflictException(`Unsupported quote currency: ${quoteCurrency}`);
    }

    const [existing] = await this.db
      .select()
      .from(instruments)
      .where(and(eq(instruments.symbol, symbol), eq(instruments.quoteCurrency, quoteCurrency)))
      .limit(1);
    if (existing) {
      throw new ConflictException(`Instrument ${symbol}/${quoteCurrency} already exists`);
    }

    const [created] = await this.db
      .insert(instruments)
      .values({
        symbol,
        quoteCurrency,
        displaySymbol: `${symbol}/${quoteCurrency}`,
        name: input.name,
        categoryKey: input.categoryKey,
        providerSymbol: input.providerSymbol,
        pricePrecision: input.pricePrecision ?? 2,
        maxPriceAgeSeconds: input.maxPriceAgeSeconds ?? 30,
        tradingSchedule: input.tradingSchedule ?? null,
        createdBy: input.createdBy,
      })
      .returning();
    if (!created) throw new Error('Failed to create instrument');

    await this.auditLog.record({
      actorUserId: input.createdBy,
      action: 'instrument.created',
      targetType: 'instrument',
      targetId: created.id,
      after: { symbol, quoteCurrency },
    });

    return created;
  }

  async update(id: string, patch: UpdateInstrumentInput, actorUserId: string): Promise<Instrument> {
    const before = await this.getById(id);

    const [after] = await this.db
      .update(instruments)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(instruments.id, id))
      .returning();
    if (!after) throw new Error('Failed to update instrument');

    await this.auditLog.record({
      actorUserId,
      action: 'instrument.updated',
      targetType: 'instrument',
      targetId: id,
      before: { name: before.name, categoryKey: before.categoryKey, maxPriceAgeSeconds: before.maxPriceAgeSeconds },
      after: patch,
    });

    return after;
  }

  /** Suspend / reactivate / delist — always audited, always with a reason. */
  async setStatus(input: SetInstrumentStatusInput): Promise<Instrument> {
    const before = await this.getById(input.instrumentId);

    const [after] = await this.db
      .update(instruments)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(instruments.id, input.instrumentId))
      .returning();
    if (!after) throw new Error('Failed to update instrument status');

    await this.auditLog.record({
      actorUserId: input.actorUserId,
      action: 'instrument.status_changed',
      targetType: 'instrument',
      targetId: input.instrumentId,
      before: { status: before.status },
      after: { status: input.status, reason: input.reason },
    });

    const event = buildInstrumentStatusEvent(after);
    this.events.emit(event.type, event);

    return after;
  }
}
