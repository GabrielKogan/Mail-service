import { prisma } from '@/lib/prisma';
import { recordSesEvent } from '@/lib/mail/events';
import {
  GLOBAL_SUPPRESSION_ORIGEN,
  upsertSuppression,
} from '@/lib/mail/suppression';
import { normalizeMessageId } from '@/lib/mail/tracking';
import { isUniqueViolation } from '@/lib/mail/idempotency';

export type SesEvent = {
  eventType?: string;
  notificationType?: string;
  mail?: {
    messageId?: string;
    timestamp?: string;
    tags?: Record<string, string[]>;
    commonHeaders?: { messageId?: string };
  };
  open?: {
    timestamp?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  delivery?: { timestamp?: string };
  bounce?: { timestamp?: string; bounceType?: string; bounceSubType?: string };
  complaint?: { timestamp?: string };
  click?: { timestamp?: string; ipAddress?: string; userAgent?: string };
  reject?: { reason?: string };
  deliveryDelay?: { timestamp?: string };
};

const HANDLED_EVENTS = new Set([
  'Delivery',
  'Open',
  'Bounce',
  'Complaint',
  'Reject',
  'Click',
  'Send',
  'DeliveryDelay',
  'Rendering Failure',
]);

export type SesProcessResult = 'processed' | 'duplicate' | 'ignored' | 'unmatched';

export function eventTypeOf(payload: SesEvent): string {
  return payload.eventType || payload.notificationType || '';
}

export function eventTimestamp(payload: SesEvent, type: string): string | undefined {
  switch (type) {
    case 'Open':
      return payload.open?.timestamp;
    case 'Delivery':
      return payload.delivery?.timestamp;
    case 'Bounce':
      return payload.bounce?.timestamp;
    case 'Complaint':
      return payload.complaint?.timestamp;
    case 'Click':
      return payload.click?.timestamp;
    case 'DeliveryDelay':
      return payload.deliveryDelay?.timestamp;
    default:
      return payload.mail?.timestamp;
  }
}

export function hasMailLogTag(payload: SesEvent): boolean {
  return Boolean(payload.mail?.tags?.mail_log_id?.[0]);
}

export async function findMailLogId(payload: SesEvent): Promise<number | null> {
  const tagId = payload.mail?.tags?.mail_log_id?.[0];
  if (tagId) {
    const n = Number(tagId);
    if (Number.isInteger(n) && n > 0) {
      const byId = await prisma.mailLog.findUnique({
        where: { id: n },
        select: { id: true },
      });
      if (byId) return byId.id;
    }
  }

  const rawId =
    payload.mail?.messageId || payload.mail?.commonHeaders?.messageId;
  if (!rawId) return null;
  const messageId = normalizeMessageId(rawId);
  const byMsg = await prisma.mailLog.findUnique({
    where: { messageId },
    select: { id: true },
  });
  if (byMsg) return byMsg.id;

  const withBrackets = await prisma.mailLog.findUnique({
    where: { messageId: `<${messageId}>` },
    select: { id: true },
  });
  return withBrackets?.id ?? null;
}

/**
 * Procesa un evento de SES recibido por SNS (webhook o cola).
 * `snsMessageId` identifica la publicación y se usa para descartar duplicados.
 */
export async function processSesNotification(
  snsMessageId: string | undefined,
  rawMessage: string
): Promise<SesProcessResult> {
  let payload: SesEvent;
  try {
    payload = JSON.parse(rawMessage) as SesEvent;
  } catch {
    return 'ignored';
  }

  const type = eventTypeOf(payload);
  if (!type || !HANDLED_EVENTS.has(type)) return 'ignored';

  const mailLogId = await findMailLogId(payload);
  if (mailLogId == null) return 'unmatched';

  const open = payload.open;
  const click = payload.click;

  const shouldSuppressAll =
    type === 'Complaint' ||
    (type === 'Bounce' && payload.bounce?.bounceType === 'Permanent');
  // SES no llegó a enviar: la dirección ya estaba en la lista de supresión de la cuenta.
  const onAccountList =
    type === 'Bounce' && payload.bounce?.bounceSubType === 'OnAccountSuppressionList';

  // Supresión y evento en la misma transacción: si el proceso se cae a mitad de
  // camino, el reintento vuelve a aplicar las dos cosas; si el evento ya estaba,
  // el índice único de origen_evento_id hace fallar la inserción y se descarta.
  try {
    await prisma.$transaction(async (tx) => {
      if (shouldSuppressAll) {
        const log = await tx.mailLog.findUnique({
          where: { id: mailLogId },
          select: { destinatario: true },
        });
        if (log?.destinatario) {
          await upsertSuppression(
            {
              email: log.destinatario,
              origen: GLOBAL_SUPPRESSION_ORIGEN,
              motivo: type === 'Complaint' ? 'queja' : 'rebote',
              mailLogId,
              origenAccion: 'ses',
              nota: onAccountList
                ? 'SES no envió el correo: la dirección está en la lista de supresión de la cuenta.'
                : null,
            },
            tx
          );
        }
      }

      await recordSesEvent(
        {
          mailLogId,
          eventType: type,
          timestamp: eventTimestamp(payload, type),
          ip: open?.ipAddress || click?.ipAddress || null,
          userAgent: open?.userAgent || click?.userAgent || null,
          payloadRaw: rawMessage,
          origenEventoId: snsMessageId ?? null,
        },
        tx
      );
    });
  } catch (err) {
    if (isUniqueViolation(err)) return 'duplicate';
    throw err;
  }

  return 'processed';
}
