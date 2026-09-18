import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';
import { Prisma } from '@prisma/client';

const listSelect = {
  id: true,
  messageId: true,
  destinatario: true,
  nombreDest: true,
  remitente: true,
  asunto: true,
  estadoActual: true,
  origen: true,
  fechaEnvio: true,
} satisfies Prisma.MailLogSelect;

function parseDayEnd(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999`);
  }
  return new Date(value);
}

function parseDayStart(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

// GET /api/dashboard?estado=enviado&origen=...&q=...&desde=2026-09-01&hasta=2026-09-11&page=1
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const estado = searchParams.get('estado');
  const origen = searchParams.get('origen');
  const q = searchParams.get('q')?.trim();
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = 25;

  const where: Prisma.MailLogWhereInput = {};
  if (estado) where.estadoActual = estado;
  if (origen) where.origen = origen;
  if (q) {
    where.OR = [
      { destinatario: { contains: q } },
      { asunto: { contains: q } },
    ];
  }
  if (desde || hasta) {
    where.fechaEnvio = {};
    if (desde) where.fechaEnvio.gte = parseDayStart(desde);
    if (hasta) where.fechaEnvio.lte = parseDayEnd(hasta);
  }

  const [items, total] = await Promise.all([
    prisma.mailLog.findMany({
      where,
      select: listSelect,
      orderBy: { fechaEnvio: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mailLog.count({ where }),
  ]);

  return jsonWithCors(req, { items, total, page, pageSize });
}
