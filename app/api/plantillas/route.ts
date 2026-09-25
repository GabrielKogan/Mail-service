import { NextRequest } from 'next/server';
import { authenticateMailCaller } from '@/lib/auth/caller';
import { jsonWithCors, mailCorsPreflight } from '@/lib/cors';
import { describirPlantillas } from '@/lib/mail/plantillas';

export const runtime = 'nodejs';

export function OPTIONS(req: NextRequest) {
  return mailCorsPreflight(req);
}

// GET /api/plantillas: tipos disponibles, sus campos y un ejemplo de `data`.
export async function GET(req: NextRequest) {
  const caller = await authenticateMailCaller(req);
  if (!caller) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }
  const plantillas = describirPlantillas();
  const origen = caller.kind === 'system' ? caller.sistema.origen : null;
  const clasificacion = caller.kind === 'system' ? caller.sistema.clasificacion : null;
  return jsonWithCors(req, {
    plantillas: plantillas.map((p) => ({
      ...p,
      disponible:
        origen == null ||
        (p.clasificacion === clasificacion && (!p.origenes || p.origenes.includes(origen))),
    })),
  });
}
