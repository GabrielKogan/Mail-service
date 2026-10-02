import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { sistemaCreateSchema } from '@/lib/validation';
import { clearSistemaCache } from '@/lib/mail/sistemas';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const sistemas = await prisma.mail_sistema.findMany({
    orderBy: { nombre: 'asc' },
    include: {
      api_keys: {
        orderBy: { fechaAlta: 'desc' },
        select: {
          id: true,
          prefijo: true,
          activo: true,
          fechaAlta: true,
          ultimoUso: true,
          revocadaEn: true,
        },
      },
    },
  });

  return NextResponse.json({
    sistemas: sistemas.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      origen: s.origen,
      clasificacion: s.clasificacion,
      permiteRawHtml: s.permiteRawHtml,
      corsOrigins: s.corsOrigins ? s.corsOrigins.split(',').filter(Boolean) : [],
      activo: s.activo,
      fechaAlta: s.fechaAlta,
      keys: s.api_keys,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = sistemaCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', detalle: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { nombre, origen, clasificacion, permiteRawHtml, corsOrigins } = parsed.data;
  try {
    const sistema = await prisma.mail_sistema.create({
      data: {
        nombre,
        origen,
        clasificacion,
        permiteRawHtml,
        corsOrigins: corsOrigins.length ? corsOrigins.join(',') : null,
      },
    });
    clearSistemaCache();
    return NextResponse.json({ ok: true, id: sistema.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: `Ya existe un sistema con origen "${origen}"` },
        { status: 409 }
      );
    }
    throw err;
  }
}
