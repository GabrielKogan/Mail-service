import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import MailComposer from 'nodemailer/lib/mail-composer';
import { config } from '@/lib/config';
import { sesClient } from '@/lib/aws/ses-account';
import { MailProviderError, isNetworkError } from '../errors';
import { getMailFrom } from '../from';
import type { MailMessage, MailProvider, MailSendResult } from '../types';

const RETRYABLE_NAMES = new Set([
  'TooManyRequestsException',
  'ThrottlingException',
  'LimitExceededException',
  'InternalFailure',
  'ServiceUnavailable',
  'TimeoutError',
]);

/** Los valores de las etiquetas de SES solo admiten letras, números, `_` y `-`. */
function tagValue(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);
}

export function isRetryableSesError(err: unknown): boolean {
  const e = err as { name?: string; $retryable?: unknown; $metadata?: { httpStatusCode?: number } };
  if (e?.name && RETRYABLE_NAMES.has(e.name)) return true;
  if (e?.$retryable) return true;
  const status = e?.$metadata?.httpStatusCode;
  if (typeof status === 'number') return status >= 500 || status === 429;
  return isNetworkError(err);
}

export async function buildRawMessage(message: MailMessage): Promise<Buffer> {
  const from = getMailFrom();
  const composer = new MailComposer({
    from: { name: from.name, address: from.email },
    to: message.toName ? { name: message.toName, address: message.to } : message.to,
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
  return composer.compile().build();
}

/**
 * SES por API (SESv2 `SendEmail` en modo Raw). El configuration set y las
 * etiquetas van como parámetros, no como cabeceras `X-SES-*`.
 */
export class SesApiProvider implements MailProvider {
  async send(message: MailMessage): Promise<MailSendResult> {
    if (!config().awsRegion) {
      throw new MailProviderError('Falta AWS_REGION para MAIL_PROVIDER=ses-api');
    }

    const raw = await buildRawMessage(message);
    const tags = Object.entries(message.tags ?? {}).map(([Name, Value]) => ({
      Name,
      Value: tagValue(Value),
    }));

    try {
      const res = await sesClient().send(
        new SendEmailCommand({
          FromEmailAddress: getMailFrom().email,
          Destination: { ToAddresses: [message.to] },
          Content: { Raw: { Data: raw } },
          ConfigurationSetName: config().sesConfigurationSet,
          EmailTags: tags.length ? tags : undefined,
        })
      );
      if (!res.MessageId) {
        throw new MailProviderError('SES no devolvió MessageId', { retryable: false });
      }
      return { messageId: res.MessageId };
    } catch (err) {
      if (err instanceof MailProviderError) throw err;
      const name = (err as { name?: string })?.name;
      const detail = err instanceof Error ? err.message : String(err);
      throw new MailProviderError(name ? `SES ${name}: ${detail}` : detail, {
        retryable: isRetryableSesError(err),
        cause: err,
      });
    }
  }
}
