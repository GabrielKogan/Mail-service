import { z } from 'zod';

/**
 * Tipos de campo de una plantilla. `linea` no admite saltos (va en el asunto o en
 * una fila de datos); `texto` sí; `url` solo http(s); `lista` es una lista de líneas.
 */
export type CampoTipo = 'linea' | 'texto' | 'url' | 'lista';

export type Campo = {
  nombre: string;
  etiqueta: string;
  tipo: CampoTipo;
  requerido?: boolean;
  ayuda?: string;
  ejemplo: string | string[];
};

export type PlantillaData = Record<string, string | string[] | undefined>;

const MAX_LINEA = 200;
const MAX_TEXTO = 4000;
const MAX_URL = 500;
const MAX_ITEMS = 20;

export const SIN_SALTOS = /^[^\r\n]*$/;

const linea = z
  .string()
  .trim()
  .max(MAX_LINEA)
  .regex(SIN_SALTOS, 'No puede tener saltos de línea');

const texto = z.string().trim().max(MAX_TEXTO);

const url = z
  .string()
  .trim()
  .max(MAX_URL)
  .url('URL inválida')
  .refine((u) => /^https?:\/\//i.test(u), 'Solo se aceptan enlaces http o https');

const lista = z.array(linea.min(1)).max(MAX_ITEMS);

function campoSchema(c: Campo): z.ZodTypeAny {
  const base =
    c.tipo === 'linea' ? linea : c.tipo === 'texto' ? texto : c.tipo === 'url' ? url : lista;
  if (c.requerido) {
    return c.tipo === 'lista' ? (base as typeof lista).min(1, 'Requerido') : (base as z.ZodString).min(1, 'Requerido');
  }
  // Vacío equivale a no enviado: los formularios mandan "" en los campos opcionales.
  return z.preprocess(
    (v) => (v === '' || (Array.isArray(v) && v.length === 0) ? undefined : v),
    base.optional()
  );
}

export function schemaFromCampos(campos: Campo[]): z.ZodType<PlantillaData> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const c of campos) shape[c.nombre] = campoSchema(c);
  return z.object(shape).strict() as unknown as z.ZodType<PlantillaData>;
}

export function ejemploDe(campos: Campo[]): PlantillaData {
  return Object.fromEntries(campos.map((c) => [c.nombre, c.ejemplo]));
}

export function str(data: PlantillaData, nombre: string): string {
  const v = data[nombre];
  return typeof v === 'string' ? v : '';
}

export function arr(data: PlantillaData, nombre: string): string[] {
  const v = data[nombre];
  return Array.isArray(v) ? v : [];
}
