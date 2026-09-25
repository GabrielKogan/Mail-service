import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';

export const PANEL_ORIGEN = 'panel';

export type Clasificacion = 'transactional' | 'subscription';

export const CLASIFICACIONES: Clasificacion[] = ['transactional', 'subscription'];

export type SistemaAuth = {
  sistemaId: number;
  nombre: string;
  origen: string;
  clasificacion: Clasificacion;
  permiteRawHtml: boolean;
  corsOrigins: string[];
};

type SistemaRow = {
  id: number;
  nombre: string;
  origen: string;
  clasificacion: string;
  permiteRawHtml: boolean;
  corsOrigins: string | null;
  activo: boolean;
};

export function parseCorsOrigins(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function normalizeClasificacion(raw: string): Clasificacion {
  return raw === 'subscription' ? 'subscription' : 'transactional';
}

export function toSistemaAuth(row: SistemaRow): SistemaAuth {
  return {
    sistemaId: row.id,
    nombre: row.nombre,
    origen: row.origen,
    clasificacion: normalizeClasificacion(row.clasificacion),
    permiteRawHtml: row.permiteRawHtml,
    corsOrigins: parseCorsOrigins(row.corsOrigins),
  };
}

const CACHE_MS = 30_000;
const byOrigen = new Map<string, { at: number; value: SistemaAuth | null }>();
let corsCache: { at: number; value: Set<string> } | null = null;

export function clearSistemaCache(): void {
  byOrigen.clear();
  corsCache = null;
}

/** Sistema activo con ese origen (caché de 30 s). */
export async function findSistemaByOrigen(origen: string): Promise<SistemaAuth | null> {
  const key = origen.trim();
  if (!key) return null;
  const hit = byOrigen.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const row = await prisma.mail_sistema.findUnique({ where: { origen: key } });
  const value = row && row.activo ? toSistemaAuth(row) : null;
  byOrigen.set(key, { at: Date.now(), value });
  return value;
}

export async function findSistemaById(id: number | null | undefined): Promise<SistemaAuth | null> {
  if (!id) return null;
  const row = await prisma.mail_sistema.findUnique({ where: { id } });
  return row && row.activo ? toSistemaAuth(row) : null;
}

/** Orígenes críticos por variable de entorno (respaldo para orígenes sin sistema). */
export function criticalOriginsFromEnv(): Set<string> {
  const raw = config().mailOrigenesCriticos;
  const source = raw === undefined ? 'turnos,expediente' : raw;
  return new Set(
    source
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Clasificación efectiva: la del sistema registrado o, si no hay, transaccional
 * para los orígenes de `MAIL_ORIGENES_CRITICOS` y suscripción para el resto.
 */
export async function clasificacionDe(
  origen: string | null | undefined,
  sistema?: SistemaAuth | null
): Promise<Clasificacion> {
  const s = sistema ?? (origen ? await findSistemaByOrigen(origen) : null);
  if (s) return s.clasificacion;
  const o = (origen ?? '').trim().toLowerCase();
  return o && criticalOriginsFromEnv().has(o) ? 'transactional' : 'subscription';
}

/** Unión de los orígenes CORS de todos los sistemas activos (para el preflight). */
export async function allSistemaCorsOrigins(): Promise<Set<string>> {
  if (corsCache && Date.now() - corsCache.at < CACHE_MS) return corsCache.value;
  const rows = await prisma.mail_sistema.findMany({
    where: { activo: true, corsOrigins: { not: null } },
    select: { corsOrigins: true },
  });
  const value = new Set(rows.flatMap((r) => parseCorsOrigins(r.corsOrigins)));
  corsCache = { at: Date.now(), value };
  return value;
}
