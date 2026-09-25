import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { sistemaUpdateSchema } from '@/lib/validation';
import { clearSistemaCache } from '@/lib/mail/sistemas';

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
