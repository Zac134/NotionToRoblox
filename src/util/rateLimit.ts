export class RateLimiter {
  private readonly intervalMs: number;
  private nextAllowedAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(requestsPerSecond: number) {
    if (requestsPerSecond <= 0) {
      throw new Error("requestsPerSecond must be positive");
    }
    this.intervalMs = 1000 / requestsPerSecond;
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextAllowedAt - now);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      this.nextAllowedAt = Date.now() + this.intervalMs;
      return fn();
    };

    const result = this.chain.then(run, run);
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class RateLimiterPerMinute {
  private readonly minIntervalMs: number;
  private nextAllowedAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(requestsPerMinute: number) {
    if (requestsPerMinute <= 0) {
      throw new Error("requestsPerMinute must be positive");
    }
    this.minIntervalMs = 60_000 / requestsPerMinute;
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextAllowedAt - now);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      this.nextAllowedAt = Date.now() + this.minIntervalMs;
      return fn();
    };

    const result = this.chain.then(run, run);
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Notion API: 3 requests per second */
export const notionRateLimiter = new RateLimiter(3);

/** Roblox developer-product write: 3/s */
export const robloxDeveloperProductWriteLimiter = new RateLimiter(3);

/** Roblox developer-product read: 10/s */
export const robloxDeveloperProductReadLimiter = new RateLimiter(10);

/** Roblox game-pass write: 5/s */
export const robloxGamePassWriteLimiter = new RateLimiter(5);

/** Roblox game-pass read: 10/s */
export const robloxGamePassReadLimiter = new RateLimiter(10);

/** Roblox badge mutations: 100/minute */
export const robloxBadgeLimiter = new RateLimiterPerMinute(100);
