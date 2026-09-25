import { isAdmin, isLegacyToken, requestToken } from '@/lib/auth';
import { authenticateApiKey, isApiKeyFormat } from '@/lib/auth/api-keys';
import {
  PANEL_ORIGEN,
  findSistemaByOrigen,
  type SistemaAuth,
} from '@/lib/mail/sistemas';

export type MailCaller =
  | { kind: 'system'; sistema: SistemaAuth }
  | { kind: 'admin' }
  | { kind: 'legacy' };

/** Quién llama a `/api/mail`: clave de sistema, token de administración o token legacy. */
export async function authenticateMailCaller(req: { headers: Headers }): Promise<MailCaller | null> {
  const token = requestToken(req);
  if (!token) return null;

  if (isApiKeyFormat(token)) {
    const sistema = await authenticateApiKey(token);
    return sistema ? { kind: 'system', sistema } : null;
  }
  if (isAdmin(req)) return { kind: 'admin' };
  if (isLegacyToken(req)) return { kind: 'legacy' };
  return null;
}

export type ResolvedOrigin =
  | { ok: true; origen: string; sistema: SistemaAuth | null }
  | { ok: false; status: number; error: string; detalle?: string };

/**
 * Origen efectivo del envío. Con clave de sistema sale de la credencial; con el
 * token de administración es siempre `panel`; con el token legacy, del body.
 */
export async function resolveOrigin(
  caller: MailCaller,
  bodyOrigen: string | undefined
): Promise<ResolvedOrigin> {
  const requested = bodyOrigen?.trim() || undefined;

  if (caller.kind === 'system') {
    if (requested && requested !== caller.sistema.origen) {
      return {
        ok: false,
        status: 403,
        error: 'El origen no coincide con la credencial',
        detalle: `La clave pertenece al origen "${caller.sistema.origen}".`,
      };
    }
    return { ok: true, origen: caller.sistema.origen, sistema: caller.sistema };
  }

  if (caller.kind === 'admin') {
    // Desde /enviar se puede elegir un sistema para probar sus plantillas y su clasificación.
    if (requested && requested !== PANEL_ORIGEN) {
      const sistema = await findSistemaByOrigen(requested);
      if (!sistema) {
        return { ok: false, status: 400, error: `No hay un sistema activo con el origen "${requested}"` };
      }
      return { ok: true, origen: sistema.origen, sistema };
    }
    return { ok: true, origen: PANEL_ORIGEN, sistema: await findSistemaByOrigen(PANEL_ORIGEN) };
  }

  const origen = requested ?? 'desconocido';
  console.warn(
    `[auth] envío con INTERNAL_API_TOKEN (legacy) para el origen "${origen}". Migrar a una clave de sistema.`
  );
  return { ok: true, origen, sistema: await findSistemaByOrigen(origen) };
}
