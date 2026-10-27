import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { sistemaUpdateSchema } from '@/lib/validation';
import { clearSistemaCache, PANEL_ORIGEN } from '@/lib/mail/sistemas';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = sistemaUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', detalle: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.mail_sistema.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  const { corsOrigins, ...rest } = parsed.data;
  await prisma.mail_sistema.update({
    where: { id },
    data: {
      ...rest,
      ...(corsOrigins !== undefined
        ? { corsOrigins: corsOrigins.length ? corsOrigins.join(',') : null }
        : {}),
    },
  });
  clearSistemaCache();

  return NextResponse.json({ ok: true });
}

/** Borra el sistema y sus claves. Si ya tiene envíos, se rechaza para no perder el historial. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
  }

  const existing = await prisma.mail_sistema.findUnique({
    where: { id },
    include: { _count: { select: { mail_logs: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }
  if (existing.origen === PANEL_ORIGEN) {
    return NextResponse.json({ error: 'El sistema panel no se puede eliminar' }, { status: 400 });
  }
  if (existing._count.mail_logs > 0) {
    return NextResponse.json(
      { error: 'No se puede eliminar: tiene envíos registrados.' },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.mail_api_key.deleteMany({ where: { sistemaId: id } }),
    prisma.mail_sistema.delete({ where: { id } }),
  ]);
  clearSistemaCache();

  return NextResponse.json({ ok: true });
}
