import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonWithCors(req, { error: 'Id inválido' }, { status: 400 });
  }

  const item = await prisma.mailLog.findUnique({ where: { id } });
  if (!item) {
    return jsonWithCors(req, { error: 'No encontrado' }, { status: 404 });
  }

  return jsonWithCors(req, item);
}
