import { MailProviderError } from './errors';
import { BrevoProvider, brevoApiKey } from './providers/brevo';
import { SesSmtpProvider } from './providers/ses';
import { SesApiProvider } from './providers/ses-api';
import { SesWithBrevoFallback } from './providers/ses-brevo';
import { SmtpProvider } from './providers/smtp';
import type { MailProvider } from './types';

export { MailProviderError, isRetryableError, mailErrorMessage } from './errors';
export type { MailMessage, MailProvider, MailSendResult } from './types';

export function getMailProvider(): MailProvider {
  const name = (process.env.MAIL_PROVIDER ?? 'ses-api').toLowerCase().trim();

  switch (name) {
    case 'ses':
      return new SesSmtpProvider();
    case 'ses-api': {
      const ses = new SesApiProvider();
      if (!brevoApiKey()) return ses;
      return new SesWithBrevoFallback(ses, new BrevoProvider());
    }
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
