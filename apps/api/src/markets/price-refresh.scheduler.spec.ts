import type { PriceFeedService } from './price-feed.service';
import { PriceRefreshScheduler } from './price-refresh.scheduler';

describe('PriceRefreshScheduler', () => {
  function makeHarness() {
    const priceFeedService = { refreshAllActive: jest.fn() } as unknown as PriceFeedService;
    const scheduler = new PriceRefreshScheduler(priceFeedService);
    return { scheduler, priceFeedService };
  }

  it('invokes PriceFeedService.refreshAllActive on every tick — the actual production refresh entry point', async () => {
    const { scheduler, priceFeedService } = makeHarness();
    (priceFeedService.refreshAllActive as jest.Mock).mockResolvedValue(undefined);

    await scheduler.refresh();

    expect(priceFeedService.refreshAllActive).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows a failure instead of letting it crash the scheduler (so the next tick still runs)', async () => {
    const { scheduler, priceFeedService } = makeHarness();
    (priceFeedService.refreshAllActive as jest.Mock).mockRejectedValue(new Error('refresh explosion'));
    const errorSpy = jest.spyOn((scheduler as unknown as { logger: { error: (msg: string) => void } }).logger, 'error');

    await expect(scheduler.refresh()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('refresh explosion'));
  });
});
