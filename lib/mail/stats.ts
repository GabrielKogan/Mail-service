import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { DashboardFilters } from '@/lib/dashboard-query';
import { defaultSerieRange } from '@/lib/mail/serie-range';
import { contarPorServicio } from '@/lib/mail/servicio';
import { trackingConfig } from '@/lib/mail/tracking';

export { defaultSerieRange };

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type MailStats = {
  total: number;
  resumen: {
    total: number;
    ok: number;
    error: number;
    entregados: number;
    abiertos: number;
    abiertosPorEstado: number;
    abiertosPorEvento: number;
    tasaApertura: number;
  };
  porEstado: { estado: string; cantidad: number; porcentaje: number }[];
  porOrigen: { origen: string; cantidad: number; porcentaje: number }[];
  porTipo: { tipo: string; cantidad: number; porcentaje: number }[];
  porServicio: { servicio: string; cantidad: number; porcentaje: number }[];
  porDia: Record<string, string | number>[];
  estadosSerie: string[];
  origenDia: string;
  rango: {
    desde: string | null;
    hasta: string | null;
    serieDiariaDefault15d: boolean;
    kpisFiltrados: boolean;
  };
  tracking: ReturnType<typeof trackingConfig>;
};

/** Agrega envíos según el `where` (KPIs) y `whereSerie` (gráfico diario). */
export async function computeMailStats(args: {
  where: Prisma.MailLogWhereInput;
  whereSerie: Prisma.MailLogWhereInput;
  filters: DashboardFilters;
  origenDia: string | null;
  serieDesde?: string | null;
  serieHasta?: string | null;
}): Promise<MailStats> {
  const { where, whereSerie, filters, origenDia } = args;
  const serieDesde = args.serieDesde !== undefined ? args.serieDesde : filters.desde ?? null;
  const serieHasta = args.serieHasta !== undefined ? args.serieHasta : filters.hasta ?? null;
  const range = defaultSerieRange(serieDesde, serieHasta);

  const [total, porEstadoGrouped, porOrigenGrouped, porTipoGrouped, destinatarios, fechas, aperturasEventos] =
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
      prisma.mailLog.groupBy({
        by: ['tipo'],
        where,
        _count: { _all: true },
        orderBy: { _count: { tipo: 'desc' } },
      }),
      prisma.mailLog.findMany({
        where,
        select: { destinatario: true },
      }),
      prisma.mailLog.findMany({
        where: whereSerie,
        select: { fechaEnvio: true, estadoActual: true, origen: true },
      }),
      prisma.mail_log_eventos.findMany({
        where: { evento: 'apertura', mail_log: where },
        select: { mail_log_id: true },
        distinct: ['mail_log_id'],
      }),
    ]);

  const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 1000) / 10 : 0);

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

  const totalTipos = porTipoGrouped.reduce((s, r) => s + r._count._all, 0);
  const porTipo = porTipoGrouped.map((r) => ({
    tipo: r.tipo?.trim() || 'html',
    cantidad: r._count._all,
    porcentaje: pct(r._count._all, totalTipos),
  }));

  type DayBucket = {
    fecha: string;
    cantidad: number;
    porEstado: Record<string, number>;
  };
  const dayMap = new Map<string, DayBucket>();
  for (const row of fechas) {
    const key = dayKey(row.fechaEnvio);
    let bucket = dayMap.get(key);
    if (!bucket) {
      bucket = { fecha: key, cantidad: 0, porEstado: {} };
      dayMap.set(key, bucket);
    }
    bucket.cantidad += 1;
    const est = row.estadoActual || 'enviado';
    bucket.porEstado[est] = (bucket.porEstado[est] ?? 0) + 1;
  }

  if (range.desde && range.hasta) {
    const cursor = new Date(range.desde);
    cursor.setHours(0, 0, 0, 0);
    const last = dayKey(range.hasta);
    for (let i = 0; i < 400 && dayKey(cursor) <= last; i++) {
      const key = dayKey(cursor);
      if (!dayMap.has(key)) {
        dayMap.set(key, { fecha: key, cantidad: 0, porEstado: {} });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const estadosEnSerie = [
    ...new Set([...dayMap.values()].flatMap((b) => Object.keys(b.porEstado))),
  ].sort();

  const porDia = [...dayMap.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((b) => {
      const row: Record<string, string | number> = { fecha: b.fecha, cantidad: b.cantidad };
      for (const est of estadosEnSerie) row[est] = b.porEstado[est] ?? 0;
      return row;
    });

  const errores = new Set(['error', 'rebotado', 'queja', 'rechazado', 'suprimido']);
  const enviadosOk = porEstado
    .filter((e) => !errores.has(e.estado))
    .reduce((s, e) => s + e.cantidad, 0);
  const conError = porEstado
    .filter((e) => errores.has(e.estado))
    .reduce((s, e) => s + e.cantidad, 0);
  const abiertosPorEstado = porEstado.find((e) => e.estado === 'abierto')?.cantidad ?? 0;
  const abiertosPorEvento = aperturasEventos.length;
  const abiertos = Math.max(abiertosPorEstado, abiertosPorEvento);
  const entregados = porEstado.find((e) => e.estado === 'entregado')?.cantidad ?? 0;

  return {
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
    porTipo,
    porServicio: contarPorServicio(destinatarios.map((r) => r.destinatario)),
    porDia,
    estadosSerie: estadosEnSerie,
    origenDia: origenDia ?? '__all__',
    rango: {
      desde: range.desde ? dayKey(range.desde) : null,
      hasta: range.hasta ? dayKey(range.hasta) : null,
      serieDiariaDefault15d: range.esDefault15d,
      kpisFiltrados: Boolean(
        filters.desde || filters.hasta || filters.estado || filters.origen || filters.tipo || filters.q
      ),
    },
    tracking: trackingConfig(),
  };
}

export type StatsCaller = { kind: 'system'; sistemaId: number } | { kind: 'admin' };

/** La clave de un sistema solo puede leer el id de ese sistema. */
export function statsAccess(
  caller: StatsCaller | null,
  requestedId: number
): { ok: true } | { ok: false; status: 401 | 403; codigo: string; error: string; log: string } {
  if (!caller) {
    return {
      ok: false,
      status: 401,
      codigo: 'no_autorizado',
      error: 'No autorizado',
      log: 'Rechazado: falta la clave o no es válida.',
    };
  }
  if (caller.kind === 'system' && caller.sistemaId !== requestedId) {
    return {
      ok: false,
      status: 403,
      codigo: 'sistema_no_coincide',
      error: 'La clave no corresponde a este sistema',
      log: `Rechazado: la clave es del sistema ${caller.sistemaId} y se pidieron estadísticas del sistema ${requestedId}.`,
    };
  }
  return { ok: true };
}
