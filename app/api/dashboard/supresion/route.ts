import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

// GET /api/dashboard/supresion?q=&activo=&page=
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const activoRaw = searchParams.get('activo')?.trim() ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = 25;

  const where: {
    email?: { contains: string };
    activo?: boolean;
  } = {};
  if (q) where.email = { contains: q };
  if (activoRaw === '1' || activoRaw === 'true') where.activo = true;
  if (activoRaw === '0' || activoRaw === 'false') where.activo = false;

  const [rows, total] = await Promise.all([
    prisma.mail_supresion.findMany({
      where,
      orderBy: { fecha: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mail_supresion.count({ where }),
  ]);

  return jsonWithCors(req, {
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      origen: row.origen,
      motivo: row.motivo,
      mailLogId: row.mail_log_id,
      activo: row.activo,
      fecha: row.fecha,
    })),
    total,
    page,
    pageSize,
  });
}

// PATCH /api/dashboard/supresion { id, activo }
export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors(req, { error: 'JSON inválido' }, { status: 400 });
  }

  const id = Number((body as { id?: unknown }).id);
  const activo = (body as { activo?: unknown }).activo;
  if (!Number.isInteger(id) || id <= 0 || typeof activo !== 'boolean') {
    return jsonWithCors(req, { error: 'Datos inválidos' }, { status: 400 });
  }

  try {
    const updated = await prisma.mail_supresion.update({
      where: { id },
      data: { activo },
    });
    return jsonWithCors(req, {
      ok: true,
      item: {
        id: updated.id,
        email: updated.email,
        origen: updated.origen,
        motivo: updated.motivo,
        mailLogId: updated.mail_log_id,
        activo: updated.activo,
        fecha: updated.fecha,
      },
    });
  } catch {
    return jsonWithCors(req, { error: 'No encontrado' }, { status: 404 });
  }
}
