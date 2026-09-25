import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { isDashboardAuthorized } from '@/lib/auth';

export const runtime = 'nodejs';

/** Un worker late cada 30 s; sin latido en 2 minutos se lo considera caído. */
const STALE_MS = 2 * 60_000;

export async function GET(req: NextRequest) {
  if (!isDashboardAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const now = Date.now();
  const [workers, enCola, revisar] = await Promise.all([
    prisma.mail_worker_heartbeat.findMany({ orderBy: { ultimoLatido: 'desc' } }),
    prisma.mailLog.count({ where: { estadoActual: 'en_cola' } }),
    prisma.mailLog.count({ where: { estadoActual: 'revisar' } }),
  ]);

  const items = workers.map((w) => ({
    worker: w.worker,
    iniciado: w.iniciado,
    ultimoLatido: w.ultimoLatido,
    activo: now - w.ultimoLatido.getTime() < STALE_MS,
  }));
  const algunoActivo = items.some((w) => w.activo);
  const cfg = config();
  // El worker hace falta si se envía por cola o si los eventos llegan por SQS.
  const requerido = cfg.mailSendMode === 'queue' || !cfg.sesWebhookEnabled || items.length > 0;

  return NextResponse.json({
    modo: cfg.mailSendMode,
    workers: items,
    alerta: requerido && !algunoActivo,
    enCola,
    revisar,
  });
}
