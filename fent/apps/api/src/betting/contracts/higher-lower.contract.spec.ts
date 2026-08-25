import { BadRequestException } from '@nestjs/common';

import { HigherLowerContract } from './higher-lower.contract';

describe('HigherLowerContract', () => {
  const contract = new HigherLowerContract();

  it('accepts higher/lower with a positive targetPrice', () => {
    expect(() => contract.validatePlacementParams({ selection: 'higher', targetPrice: 100n })).not.toThrow();
  });

  it('rejects an invalid selection', () => {
    expect(() => contract.validatePlacementParams({ selection: 'up', targetPrice: 100n })).toThrow(
      BadRequestException,
    );
  });

  it('requires a targetPrice', () => {
    expect(() => contract.validatePlacementParams({ selection: 'higher' })).toThrow(BadRequestException);
    expect(() => contract.validatePlacementParams({ selection: 'higher', targetPrice: 0n })).toThrow(
      BadRequestException,
    );
  });

  it('wins "higher" when settlement is above the target (not the entry price)', () => {
    expect(
      contract.determineResult({ selection: 'higher', entryPrice: 100n, targetPrice: 150n, settlementPrice: 151n }),
    ).toBe('win');
  });

  it('loses "higher" when settlement is below the target even if above entry', () => {
    expect(
      contract.determineResult({ selection: 'higher', entryPrice: 100n, targetPrice: 150n, settlementPrice: 120n }),
    ).toBe('loss');
  });

  it('wins "lower" when settlement is below the target', () => {
    expect(
      contract.determineResult({ selection: 'lower', entryPrice: 100n, targetPrice: 80n, settlementPrice: 70n }),
    ).toBe('win');
  });

  it('is a push when settlement exactly equals the target', () => {
    expect(
      contract.determineResult({ selection: 'higher', entryPrice: 100n, targetPrice: 150n, settlementPrice: 150n }),
    ).toBe('push');
  });

  it('throws if determineResult is somehow called without a targetPrice', () => {
    expect(() =>
      contract.determineResult({ selection: 'higher', entryPrice: 100n, settlementPrice: 150n }),
    ).toThrow('targetPrice');
  });
});
