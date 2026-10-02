import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDashboardAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';
import { googleConnectionStatus } from '@/lib/google/sync';
import { filtersFromSearchParams, parseDayEnd, parseDayStart } from '@/lib/dashboard-query';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function GET(req: NextRequest) {
  if (!isDashboardAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  const conexion = await googleConnectionStatus();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const dias = await prisma.mail_postmaster_diario.findMany({
    where: { fecha: { gte: since } },
    orderBy: { fecha: 'asc' },
  });

  const last = dias.at(-1) ?? null;
  const { searchParams } = new URL(req.url);
  const filters = filtersFromSearchParams(searchParams);

  const whereQueja = {
    evento: 'queja',
    ...(filters.desde || filters.hasta
      ? {
          fecha_evento: {
            ...(filters.desde ? { gte: parseDayStart(filters.desde) } : {}),
            ...(filters.hasta ? { lte: parseDayEnd(filters.hasta) } : {}),
          },
        }
      : { fecha_evento: { gte: since } }),
    mail_log: filters.origen ? { origen: filters.origen } : {},
  };
  const whereEntrega = {
    evento: 'entrega',
    ...(whereQueja.fecha_evento ? { fecha_evento: whereQueja.fecha_evento } : {}),
    mail_log: whereQueja.mail_log,
  };

  const [quejas, entregas, quejasPorOrigen] = await Promise.all([
    prisma.mail_log_eventos.count({ where: whereQueja }),
    prisma.mail_log_eventos.count({ where: whereEntrega }),
    prisma.mail_log_eventos.groupBy({
      by: ['mail_log_id'],
      where: whereQueja,
      _count: { _all: true },
    }),
  ]);

  const logIds = quejasPorOrigen.map((q) => q.mail_log_id);
  const logs = logIds.length
    ? await prisma.mailLog.findMany({
        where: { id: { in: logIds } },
        select: { id: true, origen: true },
      })
    : [];
  const byOrigen = new Map<string, number>();
  for (const q of quejasPorOrigen) {
    const origen = logs.find((l) => l.id === q.mail_log_id)?.origen?.trim() || 'sin-origen';
    byOrigen.set(origen, (byOrigen.get(origen) ?? 0) + q._count._all);
  }

  return jsonWithCors(req, {
    conexion,
    ultimo: last
      ? {
          fecha: last.fecha,
          dominio: last.dominio,
          spamRate: last.spamRate,
          reputacionDominio: last.reputacionDominio,
          spfOk: last.spfOk,
          dkimOk: last.dkimOk,
          dmarcOk: last.dmarcOk,
          tlsOk: last.tlsOk,
        }
      : null,
    dias: dias.map((d) => ({
      fecha: d.fecha,
      spamRate: d.spamRate,
      reputacionDominio: d.reputacionDominio,
      spfOk: d.spfOk,
      dkimOk: d.dkimOk,
      dmarcOk: d.dmarcOk,
      tlsOk: d.tlsOk,
    })),
    quejasSes: {
      quejas,
      entregas,
      tasa: entregas > 0 ? Math.round((quejas / entregas) * 10000) / 10000 : null,
      porOrigen: [...byOrigen.entries()].map(([origen, cantidad]) => ({ origen, cantidad })),
    },
    nota:
      'Datos agregados de Gmail, con unas 48 h de demora. No hay detalle por destinatario. Los días de poco volumen no aparecen. El Feedback Loop por sistema se ve en la web de Postmaster Tools (la API no lo expone).',
  });
}
