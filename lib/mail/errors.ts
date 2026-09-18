export class MailProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailProviderError';
  }
}

export function mailErrorMessage(err: unknown): string {
  if (err instanceof MailProviderError || err instanceof Error) {
    return err.message;
  }
  return 'Error desconocido';
}
