import * as brevo from '@getbrevo/brevo';
import { MailProviderError } from '../errors';
import { getMailFrom } from '../from';
import type { MailMessage, MailProvider, MailSendResult } from '../types';

function brevoErrorMessage(err: unknown): string {
  const anyErr = err as { response?: { body?: { message?: string } }; message?: string };
  return anyErr?.response?.body?.message ?? anyErr.message ?? 'Error desconocido al enviar con Brevo';
}

export class BrevoProvider implements MailProvider {
  async send(message: MailMessage): Promise<MailSendResult> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      throw new MailProviderError('Falta BREVO_API_KEY');
    }

    const apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);

    const from = getMailFrom();
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { name: from.name, email: from.email };
    sendSmtpEmail.to = [{ email: message.to, name: message.toName || message.to }];
    sendSmtpEmail.subject = message.subject;
    sendSmtpEmail.htmlContent = message.html;

    try {
      const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
      const messageId = (response.body as { messageId?: string }).messageId;
      if (!messageId) {
        throw new MailProviderError('Brevo no devolvió messageId');
      }
      return { messageId };
    } catch (err) {
      if (err instanceof MailProviderError) {
        throw err;
      }
      throw new MailProviderError(brevoErrorMessage(err));
    }
  }
}
