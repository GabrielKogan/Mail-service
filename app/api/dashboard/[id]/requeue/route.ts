import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { isAdmin } from '@/lib/auth';
import { mailErrorMessage } from '@/lib/mail';
import { processSendJob } from '@/lib/mail/send-job';
import { recordInternalEvent } from '@/lib/mail/events';
import { enqueueSendJob } from '@/lib/queue/sqs';

export const runtime = 'nodejs';

/**
 * Reencola un envío en `error` o `revisar`. Los de `revisar` piden `{ confirmar: true }`:
 * no se sabe si SES los mandó, así que el destinatario podría recibirlo dos veces.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { confirmar?: unknown };
  const log = await prisma.mailLog.findUnique({
    where: { id },
    select: { estadoActual: true },
  });
  if (!log) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }
  if (log.estadoActual !== 'error' && log.estadoActual !== 'revisar') {
    return NextResponse.json(
      { error: `Solo se reencolan envíos en error o revisar (está en ${log.estadoActual})` },
      { status: 409 }
    );
  }
  if (log.estadoActual === 'revisar' && body.confirmar !== true) {
    return NextResponse.json(
      {
        error: 'Puede que SES ya lo haya enviado: confirmá para reencolar',
        requiereConfirmacion: true,
      },
      { status: 409 }
    );
  }

  const updated = await prisma.mailLog.updateMany({
    where: { id, estadoActual: log.estadoActual },
    data: { estadoActual: 'en_cola', intentos: 0, fechaEncolado: new Date(), errorDetalle: null },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: 'El estado cambió mientras tanto; recargá' }, { status: 409 });
  }
  await recordInternalEvent(id, 'reencolado', { desde: log.estadoActual });

  if (config().mailSendMode === 'queue' && config().sqsSendQueueUrl) {
    try {
      await enqueueSendJob(id);
    } catch (err) {
      console.error('[requeue] no se pudo encolar', id, err);
    }
    return NextResponse.json({ ok: true, id, estado: 'en_cola' });
  }

  try {
    const result = await processSendJob(id, { allowRetry: false });
    const estado =
      result.status === 'sent' ? 'enviado' : result.status === 'suppressed' ? 'suprimido' : 'error';
    return NextResponse.json({
      ok: result.status === 'sent',
      id,
      estado,
      detalle: 'detalle' in result ? result.detalle : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudo enviar', detalle: mailErrorMessage(err) },
      { status: 502 }
    );
  }
}
