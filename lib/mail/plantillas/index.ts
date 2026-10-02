import { ejemploDe, schemaFromCampos, type PlantillaData } from './campos';
import { renderHtml, renderTexto } from './layout';
import type { Plantilla } from './tipos';
import { turnoConfirmacion, turnoRecordatorio } from './turnos';
import { documentacionPendiente, expedienteActualizacion, novedad } from './tramites';

export type { Plantilla } from './tipos';
export type { Campo, PlantillaData } from './campos';

export const PLANTILLAS: Plantilla[] = [
  turnoConfirmacion,
  turnoRecordatorio,
  expedienteActualizacion,
  documentacionPendiente,
  novedad,
];

const byTipo = new Map(PLANTILLAS.map((p) => [p.tipo, p]));

export function findPlantilla(tipo: string): Plantilla | null {
  return byTipo.get(tipo) ?? null;
}

export type PlantillaRender = {
  tipo: string;
  version: number;
  asunto: string;
  html: string;
  texto: string;
};

export type ParseResult =
  | { ok: true; data: PlantillaData }
  | { ok: false; detalle: Record<string, string[]> };

export function parsePlantillaData(p: Plantilla, raw: unknown): ParseResult {
  const parsed = schemaFromCampos(p.campos).safeParse(raw ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  const flat = parsed.error.flatten();
  const detalle: Record<string, string[]> = { ...(flat.fieldErrors as Record<string, string[]>) };
  if (flat.formErrors.length) detalle._ = flat.formErrors;
  return { ok: false, detalle };
}

/** Asunto en una sola línea: cualquier espacio o salto se colapsa y se recorta a 200. */
function unaLinea(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function renderPlantilla(p: Plantilla, data: PlantillaData, nombre: string): PlantillaRender {
  const contenido = p.contenido(data);
  return {
    tipo: p.tipo,
    version: p.version,
    asunto: unaLinea(p.asunto(data)),
    html: renderHtml(contenido, nombre),
    texto: renderTexto(contenido, nombre),
  };
}

/** Descripción pública de las plantillas (para `/api/plantillas` y `/enviar`). */
export function describirPlantillas() {
  return PLANTILLAS.map((p) => ({
    tipo: p.tipo,
    version: p.version,
    nombre: p.nombre,
    descripcion: p.descripcion,
    clasificacion: p.clasificacion,
    origenes: p.origenes ?? null,
    campos: p.campos,
    ejemplo: ejemploDe(p.campos),
  }));
}

export type ClasificacionCheck =
  | { ok: true }
  | { ok: false; status: 403 | 422; error: string };

/**
 * Una plantilla de suscripción la usa un sistema de suscripción (lleva baja) y una
 * transaccional, uno transaccional. `origenes` restringe además qué sistemas la usan.
 */
export function checkPlantillaParaSistema(
  p: Plantilla,
  sistema: { origen: string; clasificacion: string },
  opts: { esAdmin?: boolean } = {}
): ClasificacionCheck {
  if (p.clasificacion !== sistema.clasificacion) {
    return {
      ok: false,
      status: 422,
      error:
        p.clasificacion === 'subscription'
          ? `La plantilla "${p.tipo}" es de suscripción y el sistema "${sistema.origen}" es transaccional.`
          : `La plantilla "${p.tipo}" es transaccional y el sistema "${sistema.origen}" es de suscripción.`,
    };
  }
  if (p.origenes && !opts.esAdmin && !p.origenes.includes(sistema.origen)) {
    return {
      ok: false,
      status: 403,
      error: `La plantilla "${p.tipo}" solo la pueden usar: ${p.origenes.join(', ')}.`,
    };
  }
  return { ok: true };
}
