import { BadRequestException } from '@nestjs/common';

import type { StrategyCatalogEntry } from './strategy-catalog';

const POSITIVE_INTEGER_STRING = /^[1-9]\d*$/;

/**
 * Validates and normalizes a user-submitted bot `config` object against
 * the field list of the strategy the user selected. This is the server
 * side of the config form the frontend generates from the same catalog
 * entry — the frontend's own validation is only ever a UX convenience,
 * never trusted (per the rest of this codebase's server-authoritative
 * convention, e.g. `PlaceBetDto`/`BettingService.placeBet`).
 */
export function validateStrategyConfig(
  entry: StrategyCatalogEntry,
  rawConfig: unknown,
): Record<string, unknown> {
  if (typeof rawConfig !== 'object' || rawConfig === null) {
    throw new BadRequestException('config must be an object');
  }
  const source = rawConfig as Record<string, unknown>;
  const config: Record<string, unknown> = {};

  for (const field of entry.configFields) {
    const value = source[field.key];
    if (value === undefined || value === null || value === '') {
      if (field.required) throw new BadRequestException(`${field.label} is required`);
      if (field.defaultValue !== undefined) config[field.key] = field.defaultValue;
      continue;
    }

    switch (field.type) {
      case 'instrument':
      case 'currency': {
        if (typeof value !== 'string' || value.length === 0) {
          throw new BadRequestException(`${field.label} must be a string`);
        }
        config[field.key] = field.type === 'currency' ? value.toUpperCase() : value;
        break;
      }
      case 'select': {
        if (typeof value !== 'string' || !field.options?.some((option) => option.value === value)) {
          const allowed = field.options?.map((option) => option.value).join(', ');
          throw new BadRequestException(`${field.label} must be one of: ${allowed}`);
        }
        config[field.key] = value;
        break;
      }
      case 'stake': {
        if (typeof value !== 'string' || !POSITIVE_INTEGER_STRING.test(value)) {
          throw new BadRequestException(`${field.label} must be a positive integer string (minor units)`);
        }
        config[field.key] = value;
        break;
      }
      case 'duration':
      case 'number': {
        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(num)) throw new BadRequestException(`${field.label} must be a number`);
        if (field.min !== undefined && num < field.min) {
          throw new BadRequestException(`${field.label} must be at least ${field.min}`);
        }
        if (field.max !== undefined && num > field.max) {
          throw new BadRequestException(`${field.label} must be at most ${field.max}`);
        }
        config[field.key] = num;
        break;
      }
    }
  }

  return config;
}
