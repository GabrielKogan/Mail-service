import { prisma } from '@/lib/prisma';
import { esErrorScopePostmaster } from './scopes';
import { syncPostmaster, type SyncResult } from './sync';

/** Mínimo entre dos pasadas exitosas contra la API de Postmaster. */
export const POSTMASTER_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Cada cuánto se revisa si ya toca sincronizar. */
export const POSTMASTER_CHECK_MS = 15 * 60 * 1000;
const BOOT_DELAY_MS = 20_000;

const globalState = globalThis as typeof globalThis & { __mailPostmasterAutoSync?: boolean };

export function isPostmasterSyncDue(
  ultimaSync: Date | null | undefined,
  now = Date.now(),
  intervalMs = POSTMASTER_SYNC_INTERVAL_MS
): boolean {
  if (!ultimaSync) return true;
  return now - ultimaSync.getTime() >= intervalMs;
}

/** Sincroniza si la conexión está activa y la última pasada exitosa ya cumplió 6 h. */
export async function syncPostmasterIfDue(): Promise<SyncResult> {
  const row = await prisma.mail_google_conexion.findFirst({
    orderBy: { id: 'asc' },
    select: { estado: true, ultimaSync: true, ultimoError: true },
  });
  if (!row) {
    return { ok: false, motivo: 'Sin conexión con Google', dias: 0, alertas: [], omitido: true };
  }
  if (row.estado !== 'activa') {
    return { ok: false, motivo: 'La conexión con Google está vencida', dias: 0, alertas: [], omitido: true };
  }
  if (esErrorScopePostmaster(row.ultimoError)) {
    return { ok: false, motivo: row.ultimoError ?? undefined, dias: 0, alertas: [], omitido: true };
  }
  if (!isPostmasterSyncDue(row.ultimaSync)) {
    return { ok: true, dias: 0, alertas: [], omitido: true };
  }
  return syncPostmaster();
}

function logSync(result: SyncResult): void {
  if (result.omitido) return;
  if (!result.ok && result.motivo !== 'Sin conexión con Google') {
    console.warn('[postmaster] sync automática', result);
    return;
  }
  if (result.ok && (result.dias || result.alertas.length)) {
    console.log('[postmaster] sync automática', result);
  }
}

async function tick(): Promise<void> {
  try {
    logSync(await syncPostmasterIfDue());
  } catch (err) {
    console.error('[postmaster] sync automática falló', err);
  }
}

/** Arranca el ciclo en el proceso de Next. No hace nada si ya estaba corriendo. */
export function startPostmasterAutoSync(): void {
  if (globalState.__mailPostmasterAutoSync) return;
  globalState.__mailPostmasterAutoSync = true;

  const boot = setTimeout(() => void tick(), BOOT_DELAY_MS);
  const interval = setInterval(() => void tick(), POSTMASTER_CHECK_MS);
  boot.unref?.();
  interval.unref?.();
}
