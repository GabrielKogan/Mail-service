export class MailProviderError extends Error {
  /** `true` si otro intento puede funcionar (límite de tasa, 5xx, red); `false` si es definitivo. */
  readonly retryable: boolean;

  constructor(message: string, opts: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'MailProviderError';
    this.retryable = opts.retryable ?? false;
  }
}

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
]);

/** Errores de red de Node o de nodemailer. */
export function isNetworkError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && NETWORK_CODES.has(code);
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof MailProviderError) return err.retryable;
  return isNetworkError(err);
}

export function mailErrorMessage(err: unknown): string {
  if (err instanceof MailProviderError || err instanceof Error) {
    return err.message;
  }
  return 'Error desconocido';
}
