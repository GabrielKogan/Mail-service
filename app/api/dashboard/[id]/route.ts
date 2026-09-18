import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function GET(
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

  const item = await prisma.mailLog.findUnique({
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
  if (!item) {
    return jsonWithCors(req, { error: 'No encontrado' }, { status: 404 });
  }

  const { mail_log_eventos, ...rest } = item;
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
