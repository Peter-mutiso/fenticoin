import { BadRequestException } from '@nestjs/common';

import { UpDownContract } from './up-down.contract';

describe('UpDownContract', () => {
  const contract = new UpDownContract();

  it('accepts up/down selections', () => {
    expect(() => contract.validatePlacementParams({ selection: 'up' })).not.toThrow();
    expect(() => contract.validatePlacementParams({ selection: 'down' })).not.toThrow();
  });

  it('rejects a rise/fall-style selection', () => {
    expect(() => contract.validatePlacementParams({ selection: 'rise' })).toThrow(BadRequestException);
  });

  it('wins "up" when settlement is above entry', () => {
    expect(contract.determineResult({ selection: 'up', entryPrice: 100n, settlementPrice: 105n })).toBe('win');
  });

  it('wins "down" when settlement is below entry', () => {
    expect(contract.determineResult({ selection: 'down', entryPrice: 100n, settlementPrice: 95n })).toBe('win');
  });

  it('loses when the direction is wrong', () => {
    expect(contract.determineResult({ selection: 'up', entryPrice: 100n, settlementPrice: 95n })).toBe('loss');
  });

  it('is a push on an exact tie', () => {
    expect(contract.determineResult({ selection: 'up', entryPrice: 100n, settlementPrice: 100n })).toBe('push');
  });
});
