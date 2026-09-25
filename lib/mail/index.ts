import { MailProviderError } from './errors';
import { BrevoProvider } from './providers/brevo';
import { SesSmtpProvider } from './providers/ses';
import { SesApiProvider } from './providers/ses-api';
import { SmtpProvider } from './providers/smtp';
import type { MailProvider } from './types';

export { MailProviderError, isRetryableError, mailErrorMessage } from './errors';
export type { MailMessage, MailProvider, MailSendResult } from './types';

export function getMailProvider(): MailProvider {
  const name = (process.env.MAIL_PROVIDER ?? 'ses').toLowerCase().trim();

  switch (name) {
    case 'ses':
      return new SesSmtpProvider();
    case 'ses-api':
      return new SesApiProvider();
    case 'brevo':
      return new BrevoProvider();
    case 'smtp':
      return new SmtpProvider();
    default:
      throw new MailProviderError(
        `MAIL_PROVIDER desconocido: "${name}". Usá "ses", "ses-api", "brevo" o "smtp".`
      );
  }
}
