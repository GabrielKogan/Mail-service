import nodemailer from 'nodemailer';
import { MailProviderError, isNetworkError } from './errors';
import { getMailFrom } from './from';
import type { MailMessage, MailSendResult } from './types';

export type SmtpSendConfig = {
  host: string;
  user: string;
  pass: string;
  port?: number;
};

function smtpSecure(port: number): boolean {
  const raw = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return port === 465;
}

function fallbackMessageId(): string {
  return `smtp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Respuestas SMTP 4xx (p. ej. 454 por límite de tasa) y errores de red se reintentan; 5xx no. */
export function isRetryableSmtpError(err: unknown): boolean {
  const responseCode = (err as { responseCode?: unknown } | null)?.responseCode;
  if (typeof responseCode === 'number') return responseCode >= 400 && responseCode < 500;
  return isNetworkError(err);
}

export function parseSmtpPort(raw: string | undefined, fallback = 587): number {
  const port = Number(raw ?? fallback);
  if (!Number.isFinite(port) || port <= 0) {
    throw new MailProviderError('SMTP_PORT inválido');
  }
  return port;
}

export async function sendViaSmtp(
  message: MailMessage,
  config: SmtpSendConfig
): Promise<MailSendResult> {
  const port = config.port ?? 587;
  const secure = smtpSecure(port);
  const from = getMailFrom();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port,
    secure,
    auth: { user: config.user, pass: config.pass },
    ...(secure ? {} : { requireTLS: true }),
  });

  try {
    const info = await transporter.sendMail({
      from: `"${from.name}" <${from.email}>`,
      to: message.toName ? `"${message.toName}" <${message.to}>` : message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.headers,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: Buffer.from(a.contentBase64, 'base64'),
      })),
    });
    return { messageId: info.messageId || fallbackMessageId() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido al enviar por SMTP';
    throw new MailProviderError(msg, { retryable: isRetryableSmtpError(err), cause: err });
  }
}
