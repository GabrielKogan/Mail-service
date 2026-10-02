import { MailProviderError } from '../errors';
import { parseSmtpPort, sendViaSmtp } from '../smtp-send';
import type { MailMessage, MailProvider, MailSendResult } from '../types';

export class SmtpProvider implements MailProvider {
  async send(message: MailMessage): Promise<MailSendResult> {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      throw new MailProviderError('Faltan SMTP_HOST, SMTP_USER o SMTP_PASS');
    }

    return sendViaSmtp(message, {
      host,
      user,
      pass,
      port: parseSmtpPort(process.env.SMTP_PORT),
    });
  }
}
