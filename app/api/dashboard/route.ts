import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';
import {
  buildMailLogWhere,
  filtersFromSearchParams,
} from '@/lib/dashboard-query';
import { trackingConfig } from '@/lib/mail/tracking';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

// GET /api/dashboard?estado=enviado&origen=...&q=...&desde=...&hasta=...&page=1
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filters = filtersFromSearchParams(searchParams);
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = 25;
  const where = buildMailLogWhere(filters);

  const [rows, total] = await Promise.all([
    prisma.mailLog.findMany({
      where,
      orderBy: { fechaEnvio: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        messageId: true,
        destinatario: true,
        nombreDest: true,
        remitente: true,
        asunto: true,
        estadoActual: true,
        origen: true,
        fechaEnvio: true,
        mail_log_eventos: {
          where: { evento: { in: ['entrega', 'apertura', 'rebote', 'queja'] } },
          select: { evento: true, fecha_evento: true },
          orderBy: { fecha_evento: 'desc' },
        },
      },
    }),
    prisma.mailLog.count({ where }),
  ]);

  const items = rows.map((row) => {
    const eventos = row.mail_log_eventos;
    const tieneEntrega =
      row.estadoActual === 'entregado' ||
      row.estadoActual === 'abierto' ||
      eventos.some((e) => e.evento === 'entrega');
    const tieneApertura =
      row.estadoActual === 'abierto' ||
      eventos.some((e) => e.evento === 'apertura');
    const rebotado =
      row.estadoActual === 'rebotado' ||
      eventos.some((e) => e.evento === 'rebote');
    const fechaEntrega =
      eventos.find((e) => e.evento === 'entrega')?.fecha_evento ?? null;
    const fechaApertura =
      eventos.find((e) => e.evento === 'apertura')?.fecha_evento ?? null;

    const { mail_log_eventos: _, ...rest } = row;
    return {
      ...rest,
      llego: rebotado ? false : tieneEntrega,
      abrio: tieneApertura,
      rebotado,
      fechaEntrega,
      fechaApertura,
    };
  });

  return jsonWithCors(req, {
    items,
    total,
    page,
    pageSize,
    tracking: trackingConfig(),
    sesConfigSet: Boolean(process.env.SES_CONFIGURATION_SET?.trim()),
  });
}
