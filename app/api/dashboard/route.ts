import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/dashboard?estado=enviado&desde=2026-09-01&hasta=2026-09-11&page=1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const estado = searchParams.get('estado');
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = 25;

  const where: any = {};
  if (estado) where.estadoActual = estado;
  if (desde || hasta) {
    where.fechaEnvio = {};
    if (desde) where.fechaEnvio.gte = new Date(desde);
    if (hasta) where.fechaEnvio.lte = new Date(hasta);
  }

  const [items, total] = await Promise.all([
    prisma.mailLog.findMany({
      where,
      orderBy: { fechaEnvio: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mailLog.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
