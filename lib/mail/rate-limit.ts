/**
 * Token bucket por proceso: permite ráfagas de hasta `ratePerSecond` envíos y
 * después uno cada `1 / ratePerSecond` segundos. Cada contenedor tiene el suyo,
 * así que `SES_MAX_SEND_RATE` se reparte entre los procesos que envían.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly ratePerSecond: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms))
  ) {
    this.tokens = ratePerSecond;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.ratePerSecond, this.tokens + ((t - this.last) / 1000) * this.ratePerSecond);
    this.last = t;
  }

  /** Espera hasta que haya un token disponible y lo consume. */
  take(): Promise<void> {
    const next = this.queue.then(async () => {
      this.refill();
      while (this.tokens < 1) {
        await this.sleep(Math.ceil(((1 - this.tokens) / this.ratePerSecond) * 1000));
        this.refill();
      }
      this.tokens -= 1;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}
