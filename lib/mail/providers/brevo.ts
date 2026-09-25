import { MailProviderError } from '../errors';
import { getMailFrom } from '../from';
import type { MailMessage, MailProvider, MailSendResult } from '../types';

function brevoErrorMessageBody(body: any): string {
  if (!body) return 'Error desconocido al enviar con Brevo';
  return body.message ?? JSON.stringify(body);
}

export class BrevoProvider implements MailProvider {
  async send(message: MailMessage): Promise<MailSendResult> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      throw new MailProviderError('Falta BREVO_API_KEY');
    }

    const from = getMailFrom();
    const payload: any = {
      sender: { name: from.name, email: from.email },
      to: [{ email: message.to, name: message.toName || message.to }],
      subject: message.subject,
      htmlContent: message.html,
    };
    if (message.text) payload.textContent = message.text;
    // Sin esto Brevo no manda List-Unsubscribe ni Feedback-ID.
    if (message.headers && Object.keys(message.headers).length) payload.headers = message.headers;

    if (message.attachments?.length) {
      payload.attachment = message.attachments.map((a) => ({
        name: a.filename,
        content: a.contentBase64,
      }));
    }

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `api-key ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new MailProviderError(brevoErrorMessageBody(body), {
          retryable: res.status === 429 || res.status >= 500,
        });
      }

      const messageId = body?.messageId;
      if (!messageId) {
        throw new MailProviderError('Brevo no devolvió messageId');
      }
      return { messageId };
    } catch (err) {
      if (err instanceof MailProviderError) throw err;
      // fetch solo lanza por errores de red o de timeout.
      throw new MailProviderError(String(err ?? 'Error desconocido'), { retryable: true, cause: err });
    }
  }
}
