import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordSesEvent } from '@/lib/mail/events';
import {
  GLOBAL_SUPPRESSION_ORIGEN,
  upsertSuppression,
} from '@/lib/mail/suppression';
import { normalizeMessageId } from '@/lib/mail/tracking';

type SnsEnvelope = {
  Type?: string;
  Message?: string;
  SubscribeURL?: string;
  Token?: string;
  TopicArn?: string;
};

type SesEvent = {
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
  bounce?: { timestamp?: string; bounceType?: string };
  complaint?: { timestamp?: string };
  click?: { timestamp?: string; ipAddress?: string; userAgent?: string };
};

function eventTypeOf(payload: SesEvent): string {
  return payload.eventType || payload.notificationType || '';
}

function eventTimestamp(payload: SesEvent, type: string): string | undefined {
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
    default:
      return payload.mail?.timestamp;
  }
}

async function findMailLogId(payload: SesEvent): Promise<number | null> {
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

async function handleSesPayload(rawMessage: string): Promise<void> {
  let payload: SesEvent;
  try {
    payload = JSON.parse(rawMessage) as SesEvent;
  } catch {
    return;
  }

  const type = eventTypeOf(payload);
  if (!type) return;

  // Solo nos interesan estos para el dashboard.
  if (
    !['Delivery', 'Open', 'Bounce', 'Complaint', 'Reject', 'Click', 'Send'].includes(
      type
    )
  ) {
    return;
  }

  const mailLogId = await findMailLogId(payload);
  if (mailLogId == null) return;

  const open = payload.open;
  const click = payload.click;

  await recordSesEvent({
    mailLogId,
    eventType: type,
    timestamp: eventTimestamp(payload, type),
    ip: open?.ipAddress || click?.ipAddress || null,
    userAgent: open?.userAgent || click?.userAgent || null,
    payloadRaw: rawMessage,
  });

  const shouldSuppressAll =
    type === 'Complaint' ||
    (type === 'Bounce' && payload.bounce?.bounceType === 'Permanent');

  if (!shouldSuppressAll) return;

  const log = await prisma.mailLog.findUnique({
    where: { id: mailLogId },
    select: { destinatario: true },
  });
  if (!log?.destinatario) return;

  await upsertSuppression({
    email: log.destinatario,
    origen: GLOBAL_SUPPRESSION_ORIGEN,
    motivo: type === 'Complaint' ? 'queja' : 'rebote',
    mailLogId,
  });
}

/**
 * Webhook para notificaciones SNS de Amazon SES (configuration set).
 * SNS envía SubscriptionConfirmation / Notification / UnsubscribeConfirmation.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let envelope: SnsEnvelope;
  try {
    envelope = JSON.parse(raw) as SnsEnvelope;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (envelope.Type === 'SubscriptionConfirmation' && envelope.SubscribeURL) {
    try {
      await fetch(envelope.SubscribeURL);
    } catch {
      return NextResponse.json(
        { error: 'No se pudo confirmar la suscripción SNS' },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, confirmed: true });
  }

  if (envelope.Type === 'UnsubscribeConfirmation') {
    return NextResponse.json({ ok: true });
  }

  if (envelope.Type === 'Notification' && envelope.Message) {
    try {
      await handleSesPayload(envelope.Message);
    } catch (err) {
      console.error('[ses-webhook]', err);
      return NextResponse.json({ error: 'Error al procesar evento' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Algunos destinos envían el evento SES directo (sin envelope SNS).
  if (eventTypeOf(envelope as SesEvent) || (envelope as SesEvent).mail) {
    try {
      await handleSesPayload(raw);
    } catch (err) {
      console.error('[ses-webhook]', err);
      return NextResponse.json({ error: 'Error al procesar evento' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: true });
}
