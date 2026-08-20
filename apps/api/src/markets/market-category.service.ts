import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type MarketCategory, marketCategories } from '../database/schema';

export interface CreateMarketCategoryInput {
  key: string;
  name: string;
  description?: string;
  displayOrder?: number;
}

@Injectable()
export class MarketCategoryService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async list(): Promise<MarketCategory[]> {
    return this.db.select().from(marketCategories).orderBy(asc(marketCategories.displayOrder));
  }

  async create(input: CreateMarketCategoryInput): Promise<MarketCategory> {
    const key = input.key.toLowerCase();
    const [existing] = await this.db.select().from(marketCategories).where(eq(marketCategories.key, key)).limit(1);
    if (existing) {
      throw new ConflictException(`Market category "${key}" already exists`);
    }

    const [created] = await this.db
      .insert(marketCategories)
      .values({ key, name: input.name, description: input.description, displayOrder: input.displayOrder ?? 0 })
      .returning();
    if (!created) throw new Error('Failed to create market category');
    return created;
  }
}
