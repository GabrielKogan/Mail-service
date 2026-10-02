import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { internalEventData, type InternalEvento } from '@/lib/mail/events';
import { MAX_INTENTOS } from '@/lib/mail/send-job';
import { deleteMessage, enqueueSendJob, receiveBatch } from '@/lib/queue/sqs';

const MIN = 60_000;
/** Mayor que el tiempo total de reintentos de SQS, para no duplicar mensajes que siguen en la cola. */
export const REQUEUE_AFTER_MS = 15 * MIN;
export const STUCK_SENDING_MS = 10 * MIN;
export const ATTACHMENT_RETENTION_MS = 7 * 24 * 60 * MIN;
const BATCH = 100;
const TRANSITION_BATCH = 500;

export type ReconcileResult = {
  agotados: number;
  reencolados: number;
  aRevisar: number;
  adjuntosBorrados: number;
};

export async function reconcileOnce(
  now: Date = new Date(),
  deps: { enqueue: (mailLogId: number) => Promise<void> } = { enqueue: enqueueSendJob }
): Promise<ReconcileResult> {
  // Sin este tope se reencolarían para siempre los que SQS ya mandó a la cola de fallidos.
  const agotados = await transitionEach(
    { estadoActual: 'en_cola', intentos: { gte: MAX_INTENTOS } },
    { estadoActual: 'error', errorDetalle: 'Agotó los reintentos de envío' }
  );
  await recordEvents(agotados, 'agotado');

  let reencolados = 0;
  const reencoladosIds: number[] = [];
  if (config().sqsSendQueueUrl) {
    const limite = new Date(now.getTime() - REQUEUE_AFTER_MS);
    const viejos = await prisma.mailLog.findMany({
      where: {
        estadoActual: 'en_cola',
        intentos: { lt: MAX_INTENTOS },
        OR: [{ fechaEncolado: { lt: limite } }, { fechaEncolado: null }],
      },
      select: { id: true, fechaEncolado: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    for (const row of viejos) {
      const claimed = await prisma.mailLog.updateMany({
        where: { id: row.id, estadoActual: 'en_cola', fechaEncolado: row.fechaEncolado },
        data: { fechaEncolado: now },
      });
      if (claimed.count === 0) continue;
      try {
        await deps.enqueue(row.id);
        reencolados++;
        reencoladosIds.push(row.id);
      } catch (err) {
        console.error('[reconciler] no se pudo reencolar', row.id, err);
      }
    }
  }
  await recordEvents(reencoladosIds, 'reencolado_auto');

  // No se reenvían solos: no se puede saber si SES llegó a aceptarlos.
  const aRevisar = await transitionEach(
    {
      estadoActual: 'enviando',
      fechaIntento: { lt: new Date(now.getTime() - STUCK_SENDING_MS) },
    },
    {
      estadoActual: 'revisar',
      errorDetalle: 'Quedó en "enviando" más de 10 minutos: revisar si salió antes de reencolar',
    }
  );
  await recordEvents(aRevisar, 'revisar');

  const adjuntos = await prisma.mail_adjunto.deleteMany({
    where: {
      mail_log: {
        estadoActual: { notIn: ['en_cola', 'enviando', 'revisar', 'error'] },
        fechaEnvio: { lt: new Date(now.getTime() - ATTACHMENT_RETENTION_MS) },
      },
    },
  });

  return {
    agotados: agotados.length,
    reencolados,
    aRevisar: aRevisar.length,
    adjuntosBorrados: adjuntos.count,
  };
}

/**
 * Cambia de estado uno por uno, con la condición repetida en cada `updateMany`: así
 * solo quedan en la lista (y reciben evento) los que realmente cambiaron.
 */
async function transitionEach(
  where: Prisma.MailLogWhereInput,
  data: Prisma.MailLogUpdateManyMutationInput
): Promise<number[]> {
  const rows = await prisma.mailLog.findMany({
    where,
    select: { id: true },
    orderBy: { id: 'asc' },
    take: TRANSITION_BATCH,
  });
  const changed: number[] = [];
  for (const { id } of rows) {
    const res = await prisma.mailLog.updateMany({ where: { AND: [{ id }, where] }, data });
    if (res.count > 0) changed.push(id);
  }
  return changed;
}

async function recordEvents(ids: number[], evento: InternalEvento): Promise<void> {
  if (!ids.length) return;
  try {
    await prisma.mail_log_eventos.createMany({
      data: ids.map((id) => internalEventData(id, evento)),
    });
  } catch (err) {
    console.error(`[reconciler] no se pudieron registrar los eventos "${evento}"`, err);
  }
}

/** Vacía `mail-send-dlq`: marca como error los registros que siguen en cola y borra los mensajes. */
export async function drainSendDlq(): Promise<number> {
  const url = config().sqsSendDlqUrl;
  if (!url) return 0;

  let total = 0;
  for (;;) {
    const batch = await receiveBatch(url, { max: 10, waitSeconds: 0 });
    if (!batch.length) break;
    for (const msg of batch) {
      let mailLogId: number | null = null;
      try {
        const parsed = JSON.parse(msg.body) as { mailLogId?: unknown };
        mailLogId = Number.isInteger(parsed.mailLogId) ? (parsed.mailLogId as number) : null;
      } catch {
        // mensaje inválido: se borra igual
      }
      if (mailLogId != null) {
        const res = await prisma.mailLog.updateMany({
          where: { id: mailLogId, estadoActual: 'en_cola' },
          data: { estadoActual: 'error', errorDetalle: 'Agotó los reintentos en SQS' },
        });
        if (res.count > 0) await recordEvents([mailLogId], 'agotado');
      }
      await deleteMessage(url, msg.receiptHandle);
      total++;
    }
  }
  return total;
}
