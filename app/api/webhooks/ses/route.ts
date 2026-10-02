import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { verifySnsMessage, type SnsEnvelope } from '@/lib/aws/sns-verify';
import { processSesNotification } from '@/lib/mail/ses-events';

/**
 * Webhook para notificaciones SNS de Amazon SES (configuration set).
 * Solo acepta mensajes firmados por SNS y del tópico `SES_SNS_TOPIC_ARN`.
 */
export async function POST(req: NextRequest) {
  if (!config().sesWebhookEnabled) {
    return NextResponse.json(
      { error: 'Webhook dado de baja: los eventos se procesan desde la cola SQS' },
      { status: 410 }
    );
  }

  const raw = await req.text();
  let envelope: SnsEnvelope;
  try {
    envelope = JSON.parse(raw) as SnsEnvelope;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!envelope || typeof envelope !== 'object' || !envelope.Type) {
    return NextResponse.json({ error: 'Se espera un mensaje SNS' }, { status: 400 });
  }

  const verified = await verifySnsMessage(envelope, config().sesSnsTopicArn);
  if (!verified.ok) {
    console.warn('[ses-webhook] mensaje rechazado:', verified.reason);
    return NextResponse.json({ error: 'Mensaje SNS no válido' }, { status: 403 });
  }

  if (envelope.Type === 'SubscriptionConfirmation' && envelope.SubscribeURL) {
    try {
      const res = await fetch(envelope.SubscribeURL, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      const result = await processSesNotification(envelope.MessageId, envelope.Message);
      return NextResponse.json({ ok: true, result });
    } catch (err) {
      console.error('[ses-webhook]', err);
      return NextResponse.json({ error: 'Error al procesar evento' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, ignored: true });
}
