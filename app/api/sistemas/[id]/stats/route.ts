import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { authenticateSystem } from '@/lib/auth/api-keys';
import { buildMailLogWhere, filtersFromSearchParams } from '@/lib/dashboard-query';
import { jsonWithCors, mailCorsPreflight, type CorsAllowList } from '@/lib/cors';
import { computeMailStats, defaultSerieRange, statsAccess } from '@/lib/mail/stats';

export const runtime = 'nodejs';

export function OPTIONS(req: NextRequest) {
  return mailCorsPreflight(req);
}

/**
 * GET /api/sistemas/:id/stats
 * La clave del sistema solo devuelve las estadísticas de ese id.
 * El token de administración puede consultar cualquier sistema.
 * Filtros opcionales: desde, hasta, estado, tipo, q.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sistema = await authenticateSystem(req);
  const admin = !sistema && isAdmin(req);
  const caller = sistema
    ? { kind: 'system' as const, sistemaId: sistema.sistemaId }
    : admin
      ? { kind: 'admin' as const }
      : null;

  const id = Number((await params).id);
  const cors: CorsAllowList = sistema?.corsOrigins.length ? sistema.corsOrigins : null;
  const reply = (body: unknown, init?: ResponseInit) => jsonWithCors(req, body, init, cors);

  if (!Number.isInteger(id) || id <= 0) {
    return reply(
      {
        ok: false,
        codigo: 'id_invalido',
        error: 'Id inválido',
        log: 'Rechazado: el id del sistema no es válido.',
      },
      { status: 400 }
    );
  }

  const access = statsAccess(caller, id);
  if (!access.ok) {
    return reply(
      { ok: false, codigo: access.codigo, error: access.error, log: access.log },
      { status: access.status }
    );
  }

  const row = sistema
    ? { id: sistema.sistemaId, nombre: sistema.nombre, origen: sistema.origen }
    : await prisma.mail_sistema.findUnique({
        where: { id },
        select: { id: true, nombre: true, origen: true },
      });
  if (!row) {
    return reply(
      {
        ok: false,
        codigo: 'no_encontrado',
        error: 'No encontrado',
        log: `Rechazado: no hay un sistema con id ${id}.`,
      },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const filters = filtersFromSearchParams(searchParams);
  // El origen sale del sistema. Un query ?origen= no puede ampliar el resultado.
  const scoped = { ...filters, origen: undefined };
  const where = { ...buildMailLogWhere(scoped), sistemaId: row.id };
  const range = defaultSerieRange(filters.desde ?? null, filters.hasta ?? null);
  const whereSerie = { ...where };
  if (!filters.desde && !filters.hasta && range.desde && range.hasta) {
    whereSerie.fechaEnvio = { gte: range.desde, lte: range.hasta };
  }

  const stats = await computeMailStats({
    where,
    whereSerie,
    filters: scoped,
    origenDia: row.origen,
  });

  return reply({
    ok: true,
    codigo: 'estadisticas',
    log: `Estadísticas del sistema ${row.id} (${row.origen}): ${stats.total} envíos.`,
    sistema: { id: row.id, nombre: row.nombre, origen: row.origen },
    ...stats,
  });
}
