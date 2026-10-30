import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { resolveMailFrom } from '@/lib/mail/from';
import { findPlantilla, parsePlantillaData, renderPlantilla } from '@/lib/mail/plantillas';

export const runtime = 'nodejs';

// POST /api/admin/plantillas/preview { tipo, data, nombre? }
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { tipo?: unknown; data?: unknown; nombre?: unknown; desde?: unknown; nombre_remitente?: unknown }
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
  const elegido = resolveMailFrom({
    desde: typeof body?.desde === 'string' ? body.desde : undefined,
    nombre: typeof body?.nombre_remitente === 'string' ? body.nombre_remitente : undefined,
  });
  if (!elegido.ok) {
    return NextResponse.json({ error: elegido.error, detalle: elegido.detalle }, { status: 400 });
  }
  return NextResponse.json(
    renderPlantilla(plantilla, data.data, nombre, { consultas: elegido.identity.email })
  );
}
