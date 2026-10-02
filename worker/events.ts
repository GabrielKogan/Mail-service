import { config } from '@/lib/config';
import type { SnsEnvelope } from '@/lib/aws/sns-verify';
import { processSesNotification } from '@/lib/mail/ses-events';
import type { ReceivedMessage } from '@/lib/queue/sqs';

/** Se lanza para que SQS reintente: el evento puede llegar antes de que se guarde el messageId. */
export class UnmatchedEventError extends Error {
  constructor(public readonly snsMessageId: string | undefined) {
    super(`Evento SES sin MailLog (SNS ${snsMessageId ?? '?'})`);
    this.name = 'UnmatchedEventError';
  }
}

/**
 * Mensaje de `mail-events`: el sobre SNS completo (raw delivery desactivado).
 * La cola solo acepta mensajes del tópico de SES, así que no se vuelve a verificar la firma.
 */
export async function handleEventMessage(msg: ReceivedMessage): Promise<void> {
  let envelope: SnsEnvelope;
  try {
    envelope = JSON.parse(msg.body) as SnsEnvelope;
  } catch {
    console.warn('[worker:events] mensaje que no es JSON, se descarta', msg.messageId);
    return;
  }

  if (envelope.Type !== 'Notification' || !envelope.Message) return;

  const topic = config().sesSnsTopicArn;
  if (topic && envelope.TopicArn && envelope.TopicArn !== topic) {
    console.warn('[worker:events] TopicArn inesperado, se descarta', envelope.TopicArn);
    return;
  }

  const result = await processSesNotification(envelope.MessageId, envelope.Message);
  if (result === 'unmatched') {
    throw new UnmatchedEventError(envelope.MessageId);
  }
}
