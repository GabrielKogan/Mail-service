import { NextRequest } from 'next/server';
import { isDashboardAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';
import { buildMailLogWhere, filtersFromSearchParams } from '@/lib/dashboard-query';
import { computeMailStats, defaultSerieRange } from '@/lib/mail/stats';
import type { Prisma } from '@prisma/client';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

// GET /api/dashboard/stats?desde=&hasta=&origen=&estado=&q=
export async function GET(req: NextRequest) {
  if (!isDashboardAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filters = filtersFromSearchParams(searchParams);
  const origenDiaRaw = searchParams.get('origenDia')?.trim() ?? '';
  const origenDia =
    origenDiaRaw === '__all__' ? null : origenDiaRaw || filters.origen || null;
  const desdeDia = searchParams.get('desdeDia')?.trim() || null;
  const hastaDia = searchParams.get('hastaDia')?.trim() || null;

  const where = buildMailLogWhere(filters);
  const range = defaultSerieRange(desdeDia, hastaDia);
  const whereSerieBase = buildMailLogWhere({
    ...filters,
    origen: undefined,
    desde: undefined,
    hasta: undefined,
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

  if (range.desde || range.hasta) {
    whereSerie.fechaEnvio = {
      ...(range.desde ? { gte: range.desde } : {}),
      ...(range.hasta ? { lte: range.hasta } : {}),
    };
  }

  const stats = await computeMailStats({
    where,
    whereSerie,
    filters,
    origenDia,
    serieDesde: desdeDia,
    serieHasta: hastaDia,
  });
  return jsonWithCors(req, stats);
}
