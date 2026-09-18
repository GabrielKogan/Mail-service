import nodemailer from 'nodemailer';
import { MailProviderError } from './errors';
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
    });
    return { messageId: info.messageId || fallbackMessageId() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido al enviar por SMTP';
    throw new MailProviderError(msg);
  }
}
