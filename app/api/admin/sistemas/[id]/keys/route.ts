import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { generateApiKey } from '@/lib/auth/api-keys';

export const runtime = 'nodejs';

async function sistemaIdFrom(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Genera una clave nueva. Se devuelve en claro una sola vez; solo se guarda el hash. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const sistemaId = await sistemaIdFrom(params);
  if (!sistemaId) {
    return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
  }

  const sistema = await prisma.mail_sistema.findUnique({ where: { id: sistemaId } });
  if (!sistema) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  const { key, prefijo, hash } = generateApiKey();
  const row = await prisma.mail_api_key.create({
    data: { sistemaId, prefijo, hash },
  });

  return NextResponse.json({ ok: true, id: row.id, prefijo, key }, { status: 201 });
}

/** Revoca una clave: `DELETE ?keyId=123`. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const sistemaId = await sistemaIdFrom(params);
  const keyId = Number(req.nextUrl.searchParams.get('keyId'));
  if (!sistemaId || !Number.isInteger(keyId) || keyId <= 0) {
    return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
  }

  const result = await prisma.mail_api_key.updateMany({
    where: { id: keyId, sistemaId, revocadaEn: null },
    data: { activo: false, revocadaEn: new Date() },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Clave no encontrada o ya revocada' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
