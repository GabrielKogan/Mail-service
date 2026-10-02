import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { findPlantilla, parsePlantillaData, renderPlantilla } from '@/lib/mail/plantillas';

export const runtime = 'nodejs';

// POST /api/admin/plantillas/preview { tipo, data, nombre? }
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { tipo?: unknown; data?: unknown; nombre?: unknown }
    | null;
  const plantilla = typeof body?.tipo === 'string' ? findPlantilla(body.tipo) : null;
  if (!plantilla) {
    return NextResponse.json({ error: 'Plantilla inexistente' }, { status: 400 });
  }
  const data = parsePlantillaData(plantilla, body?.data);
  if (!data.ok) {
    return NextResponse.json({ error: 'Datos inválidos', detalle: data.detalle }, { status: 400 });
  }
  const nombre = typeof body?.nombre === 'string' ? body.nombre.replace(/[\r\n]+/g, ' ') : '';
  return NextResponse.json(renderPlantilla(plantilla, data.data, nombre));
}
