import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';
import {
  buildMailLogWhere,
  filtersFromSearchParams,
  parseDayEnd,
  parseDayStart,
} from '@/lib/dashboard-query';
import { trackingConfig } from '@/lib/mail/tracking';
import type { Prisma } from '@prisma/client';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

function defaultSerieRange(desde: string | null, hasta: string | null) {
  if (desde || hasta) {
    return {
      desde: desde ? parseDayStart(desde) : undefined,
      hasta: hasta ? parseDayEnd(hasta) : undefined,
      esDefault30d: false,
    };
  }
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { desde: start, hasta: end, esDefault30d: true };
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// GET /api/dashboard/stats?desde=&hasta=&origen=&estado=&q=
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filters = filtersFromSearchParams(searchParams);
  const origenDiaRaw = searchParams.get('origenDia')?.trim() ?? '';
  // origenDia=__all__ → serie sin filtrar por origen; vacío → hereda filtro global.
  const origenDia =
    origenDiaRaw === '__all__'
      ? null
      : origenDiaRaw || filters.origen || null;

  const where = buildMailLogWhere(filters);
  const range = defaultSerieRange(filters.desde ?? null, filters.hasta ?? null);

  const whereSerieBase = buildMailLogWhere({
    ...filters,
    // El origen de la serie se aplica aparte (origenDia).
    origen: undefined,
  });
  const whereSerie: Prisma.MailLogWhereInput = { ...whereSerieBase };

  if (origenDia === 'sin-origen') {
    whereSerie.AND = [
      ...(Array.isArray(whereSerieBase.AND)
        ? whereSerieBase.AND
        : whereSerieBase.AND
          ? [whereSerieBase.AND]
          : []),
      { OR: [{ origen: null }, { origen: '' }] },
    ];
  } else if (origenDia) {
    whereSerie.origen = origenDia;
  }

  if (!filters.desde && !filters.hasta) {
    whereSerie.fechaEnvio = { gte: range.desde, lte: range.hasta };
  } else if (whereSerieBase.fechaEnvio) {
    whereSerie.fechaEnvio = whereSerieBase.fechaEnvio;
  }

  const [total, porEstadoGrouped, porOrigenGrouped, fechas, aperturasEventos] =
    await Promise.all([
      prisma.mailLog.count({ where }),
      prisma.mailLog.groupBy({
        by: ['estadoActual'],
        where,
        _count: { _all: true },
        orderBy: { _count: { estadoActual: 'desc' } },
      }),
      prisma.mailLog.groupBy({
        by: ['origen'],
        where,
        _count: { _all: true },
        orderBy: { _count: { origen: 'desc' } },
      }),
      prisma.mailLog.findMany({
        where: whereSerie,
        select: { fechaEnvio: true, estadoActual: true, origen: true },
      }),
      prisma.mail_log_eventos.findMany({
        where: {
          evento: 'apertura',
          mail_log: where,
        },
        select: { mail_log_id: true },
        distinct: ['mail_log_id'],
      }),
    ]);

  const pct = (n: number, of: number) =>
    of > 0 ? Math.round((n / of) * 1000) / 10 : 0;

  const totalEstados = porEstadoGrouped.reduce((s, r) => s + r._count._all, 0);
  const porEstado = porEstadoGrouped.map((r) => ({
    estado: r.estadoActual,
    cantidad: r._count._all,
    porcentaje: pct(r._count._all, totalEstados),
  }));

  const totalOrigenes = porOrigenGrouped.reduce((s, r) => s + r._count._all, 0);
  const porOrigen = porOrigenGrouped.map((r) => ({
    origen: r.origen?.trim() || 'sin-origen',
    cantidad: r._count._all,
    porcentaje: pct(r._count._all, totalOrigenes),
  }));

  type DayBucket = {
    fecha: string;
    cantidad: number;
    porEstado: Record<string, number>;
    porOrigen: Record<string, number>;
  };
  const dayMap = new Map<string, DayBucket>();
  for (const row of fechas) {
    const key = dayKey(row.fechaEnvio);
    let bucket = dayMap.get(key);
    if (!bucket) {
      bucket = { fecha: key, cantidad: 0, porEstado: {}, porOrigen: {} };
      dayMap.set(key, bucket);
    }
    bucket.cantidad += 1;
    const est = row.estadoActual || 'enviado';
    bucket.porEstado[est] = (bucket.porEstado[est] ?? 0) + 1;
    const org = row.origen?.trim() || 'sin-origen';
    bucket.porOrigen[org] = (bucket.porOrigen[org] ?? 0) + 1;
  }

  const estadosEnSerie = [
    ...new Set(
      [...dayMap.values()].flatMap((b) => Object.keys(b.porEstado))
    ),
  ].sort();

  const porDia = [...dayMap.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((b) => {
      const row: Record<string, string | number> = {
        fecha: b.fecha,
        cantidad: b.cantidad,
      };
      for (const est of estadosEnSerie) {
        row[est] = b.porEstado[est] ?? 0;
      }
      return row;
    });

  const errores = new Set(['error', 'rebotado', 'queja', 'rechazado', 'suprimido']);
  const enviadosOk = porEstado
    .filter((e) => !errores.has(e.estado))
    .reduce((s, e) => s + e.cantidad, 0);
  const conError = porEstado
    .filter((e) => errores.has(e.estado))
    .reduce((s, e) => s + e.cantidad, 0);
  const abiertosPorEstado =
    porEstado.find((e) => e.estado === 'abierto')?.cantidad ?? 0;
  const abiertosPorEvento = aperturasEventos.length;
  // Preferimos el máximo: estado abierto o mails con evento apertura.
  const abiertos = Math.max(abiertosPorEstado, abiertosPorEvento);
  const entregados =
    porEstado.find((e) => e.estado === 'entregado')?.cantidad ?? 0;

  const tracking = trackingConfig();

  return jsonWithCors(req, {
    total,
    resumen: {
      total,
      ok: enviadosOk,
      error: conError,
      entregados,
      abiertos,
      abiertosPorEstado,
      abiertosPorEvento,
      tasaApertura: total > 0 ? Math.round((abiertos / total) * 1000) / 10 : 0,
    },
    porEstado,
    porOrigen,
    porDia,
    estadosSerie: estadosEnSerie,
    origenDia: origenDia ?? '__all__',
    rango: {
      desde: range.desde ? dayKey(range.desde) : null,
      hasta: range.hasta ? dayKey(range.hasta) : null,
      serieDiariaDefault30d: range.esDefault30d,
      kpisFiltrados: Boolean(
        filters.desde ||
          filters.hasta ||
          filters.estado ||
          filters.origen ||
          filters.q
      ),
    },
    tracking,
  });
}
