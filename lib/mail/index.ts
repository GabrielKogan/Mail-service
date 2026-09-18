import { MailProviderError } from './errors';
import { BrevoProvider } from './providers/brevo';
import { SesSmtpProvider } from './providers/ses';
import { SmtpProvider } from './providers/smtp';
import type { MailProvider } from './types';

export { MailProviderError, mailErrorMessage } from './errors';
export type { MailMessage, MailProvider, MailSendResult } from './types';

export function getMailProvider(): MailProvider {
  const name = (process.env.MAIL_PROVIDER ?? 'ses').toLowerCase().trim();

  switch (name) {
    case 'ses':
      return new SesSmtpProvider();
    case 'brevo':
      return new BrevoProvider();
    case 'smtp':
      return new SmtpProvider();
    default:
      throw new MailProviderError(
        `MAIL_PROVIDER desconocido: "${name}". Usá "ses", "brevo" o "smtp".`
      );
  }
}
