import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateSystem } from '@/lib/auth/api-keys';
import { isAdmin } from '@/lib/auth';
import { jsonWithCors, mailCorsPreflight, type CorsAllowList } from '@/lib/cors';

export const runtime = 'nodejs';

export function OPTIONS(req: NextRequest) {
  return mailCorsPreflight(req);
}

/**
 * GET /api/mail/:id — estado de un envío. Cada sistema solo ve sus propios envíos
 * (se responde 404 si el registro es de otro sistema).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sistema = await authenticateSystem(req);
  const admin = !sistema && isAdmin(req);
  const cors: CorsAllowList = sistema?.corsOrigins.length ? sistema.corsOrigins : null;
  const reply = (body: unknown, init?: ResponseInit) => jsonWithCors(req, body, init, cors);

  if (!sistema && !admin) {
    return reply({ error: 'No autorizado' }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply({ error: 'Id inválido' }, { status: 400 });
  }

  const log = await prisma.mailLog.findUnique({
    where: { id },
    select: {
      id: true,
      sistemaId: true,
      estadoActual: true,
      messageId: true,
      errorDetalle: true,
      fechaEnvio: true,
      intentos: true,
      tipo: true,
      plantillaVersion: true,
      mail_log_eventos: {
        orderBy: { fecha_evento: 'asc' },
        select: { evento: true, fecha_evento: true },
      },
    },
  });

  if (!log || (sistema && log.sistemaId !== sistema.sistemaId)) {
    return reply({ error: 'No encontrado' }, { status: 404 });
  }

  const pendiente = /^(pending|queued|suppressed|error)-/.test(log.messageId);
  return reply({
    id: log.id,
    estado: log.estadoActual,
    tipo: log.tipo,
    plantillaVersion: log.plantillaVersion,
    messageId: pendiente ? null : log.messageId,
    errorDetalle: log.errorDetalle,
    fechaEnvio: log.fechaEnvio,
    intentos: log.intentos,
    eventos: log.mail_log_eventos.map((e) => ({ evento: e.evento, fecha: e.fecha_evento })),
  });
}
