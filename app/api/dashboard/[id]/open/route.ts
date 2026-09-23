import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';
import { recordMailEvent } from '@/lib/mail/events';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * Marca un mail como abierto (para pruebas o cuando el píxel no pudo cargarse).
 * POST /api/dashboard/:id/open
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonWithCors(req, { error: 'Id inválido' }, { status: 400 });
  }

  const log = await prisma.mailLog.findUnique({
    where: { id },
    select: { id: true, estadoActual: true },
  });
  if (!log) {
    return jsonWithCors(req, { error: 'No encontrado' }, { status: 404 });
  }

  const alreadyOpen = await prisma.mail_log_eventos.findFirst({
    where: { mail_log_id: id, evento: 'apertura' },
    select: { id: true },
  });

  if (!alreadyOpen) {
    await recordMailEvent({
      mailLogId: id,
      evento: 'apertura',
      userAgent: 'manual-dashboard',
      nuevoEstado: 'abierto',
    });
  } else if (log.estadoActual !== 'abierto') {
    await prisma.mailLog.update({
      where: { id },
      data: { estadoActual: 'abierto' },
    });
  }

  const updated = await prisma.mailLog.findUnique({
    where: { id },
    include: {
      mail_log_eventos: {
        orderBy: { fecha_evento: 'asc' },
        select: {
          id: true,
          evento: true,
          fecha_evento: true,
          ip: true,
          user_agent: true,
        },
      },
    },
  });

  if (!updated) {
    return jsonWithCors(req, { error: 'No encontrado' }, { status: 404 });
  }

  const { mail_log_eventos, ...rest } = updated;
  return jsonWithCors(req, {
    ...rest,
    eventos: mail_log_eventos.map((e) => ({
      id: e.id,
      evento: e.evento,
      fechaEvento: e.fecha_evento,
      ip: e.ip,
      userAgent: e.user_agent,
    })),
  });
}
