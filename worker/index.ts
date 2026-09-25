import os from 'os';
import { prisma } from '@/lib/prisma';
import { loadConfig } from '@/lib/config';
import { RetryableSendError } from '@/lib/mail/send-job';
import { poll, type Poller } from '@/lib/queue/sqs';
import { handleEventMessage, UnmatchedEventError } from './events';
import { drainSendDlq, reconcileOnce } from './reconciler';
import { syncPostmaster } from '@/lib/google/sync';
import { handleSendMessage, sendRetryDelaySeconds } from './send';

const HEARTBEAT_MS = 30_000;
const RECONCILE_MS = 60_000;
const DLQ_MS = 5 * 60_000;
const POSTMASTER_MS = 6 * 60 * 60_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;

function every(ms: number, name: string, fn: () => Promise<unknown>): NodeJS.Timeout {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (err) {
      console.error(`[worker] ${name} falló`, err);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, ms);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const name = cfg.workerName || os.hostname();
  const iniciado = new Date();
  const pollers: Poller[] = [];

  if (cfg.sqsSendQueueUrl) {
    pollers.push(
      poll(cfg.sqsSendQueueUrl, handleSendMessage, {
        concurrency: cfg.workerConcurrency,
        retryDelaySeconds: sendRetryDelaySeconds,
        onError: (err, msg) => {
          if (err instanceof RetryableSendError) {
            console.warn(`[worker:send] ${err.mailLogId} se reintenta (intento ${msg.receiveCount}): ${err.message}`);
          } else {
            console.error('[worker:send] error', msg.messageId, err);
          }
        },
      })
    );
  } else {
    console.warn('[worker] SQS_SEND_QUEUE_URL no está configurado: no se procesan envíos');
  }

  if (cfg.sqsEventsQueueUrl) {
    pollers.push(
      poll(cfg.sqsEventsQueueUrl, handleEventMessage, {
        concurrency: cfg.workerConcurrency,
        onError: (err, msg) => {
          if (err instanceof UnmatchedEventError) {
            // Normal en los primeros intentos: el evento puede llegar antes que el messageId.
            if (msg.receiveCount >= 3) console.warn(`[worker:events] ${err.message} (intento ${msg.receiveCount})`);
          } else {
            console.error('[worker:events] error', msg.messageId, err);
          }
        },
      })
    );
  } else {
    console.warn('[worker] SQS_EVENTS_QUEUE_URL no está configurado: no se procesan eventos');
  }

  const timers = [
    every(HEARTBEAT_MS, 'heartbeat', () =>
      prisma.mail_worker_heartbeat.upsert({
        where: { worker: name },
        create: { worker: name, iniciado, ultimoLatido: new Date() },
        update: { iniciado, ultimoLatido: new Date() },
      })
    ),
    every(RECONCILE_MS, 'reconciliador', async () => {
      const r = await reconcileOnce();
      if (r.agotados || r.reencolados || r.aRevisar || r.adjuntosBorrados) {
        console.log('[worker:reconciler]', r);
      }
    }),
    every(DLQ_MS, 'cola de fallidos', async () => {
      const n = await drainSendDlq();
      if (n) console.warn(`[worker:dlq] ${n} envío(s) marcados como error`);
    }),
    every(POSTMASTER_MS, 'postmaster', async () => {
      const r = await syncPostmaster();
      if (!r.ok && r.motivo !== 'Sin conexión con Google') {
        console.warn('[worker:postmaster]', r);
      } else if (r.ok && (r.dias || r.alertas.length)) {
        console.log('[worker:postmaster]', r);
      }
    }),
  ];

  console.log(
    `[worker] ${name} iniciado (proveedor ${cfg.mailProvider}, concurrencia ${cfg.workerConcurrency}, ${cfg.sesMaxSendRate} envíos/s)`
  );

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal}: dejando de leer y esperando los mensajes en curso`);
    timers.forEach(clearInterval);
    await Promise.all(pollers.map((p) => p.stop(SHUTDOWN_TIMEOUT_MS)));
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] no pudo iniciar', err);
  process.exit(1);
});
