import { BadRequestException } from '@nestjs/common';

import { RiseFallContract } from './rise-fall.contract';

describe('RiseFallContract', () => {
  const contract = new RiseFallContract();

  it('accepts rise/fall selections', () => {
    expect(() => contract.validatePlacementParams({ selection: 'rise' })).not.toThrow();
    expect(() => contract.validatePlacementParams({ selection: 'fall' })).not.toThrow();
  });

  it('rejects any other selection', () => {
    expect(() => contract.validatePlacementParams({ selection: 'higher' })).toThrow(BadRequestException);
  });

  it('wins "rise" when settlement is above entry', () => {
    expect(
      contract.determineResult({ selection: 'rise', entryPrice: 100n, settlementPrice: 101n }),
    ).toBe('win');
  });

  it('loses "rise" when settlement is below entry', () => {
    expect(
      contract.determineResult({ selection: 'rise', entryPrice: 100n, settlementPrice: 99n }),
    ).toBe('loss');
  });

  it('wins "fall" when settlement is below entry', () => {
    expect(
      contract.determineResult({ selection: 'fall', entryPrice: 100n, settlementPrice: 99n }),
    ).toBe('win');
  });

  it('is a push when settlement exactly equals entry', () => {
    expect(
      contract.determineResult({ selection: 'rise', entryPrice: 100n, settlementPrice: 100n }),
    ).toBe('push');
    expect(
      contract.determineResult({ selection: 'fall', entryPrice: 100n, settlementPrice: 100n }),
    ).toBe('push');
  });
});
