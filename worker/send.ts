import { processSendJob } from '@/lib/mail/send-job';
import type { ReceivedMessage } from '@/lib/queue/sqs';

/** Mensaje de `mail-send`: `{ mailLogId }`. El contenido del mail está en la base. */
export async function handleSendMessage(msg: ReceivedMessage): Promise<void> {
  let mailLogId: unknown;
  try {
    mailLogId = (JSON.parse(msg.body) as { mailLogId?: unknown }).mailLogId;
  } catch {
    mailLogId = undefined;
  }
  if (!Number.isInteger(mailLogId) || (mailLogId as number) <= 0) {
    console.warn('[worker:send] mensaje inválido, se descarta', msg.messageId);
    return;
  }

  const result = await processSendJob(mailLogId as number);
  if (result.status === 'failed') {
    console.warn(`[worker:send] ${mailLogId} quedó en error: ${result.detalle}`);
  }
}

/** Espera antes de reintentar: 15 s, 30 s, 60 s, 120 s... hasta 5 minutos. */
export function sendRetryDelaySeconds(receiveCount: number): number {
  return Math.min(300, 15 * 2 ** Math.max(0, receiveCount - 1));
}
