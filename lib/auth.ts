import { createHash, timingSafeEqual } from 'crypto';
import { config } from '@/lib/config';

type RequestLike = { headers: Headers };

/** Token del request: `x-api-key`, `x-internal-token` o `Authorization: Bearer`. */
export function requestToken(req: RequestLike): string | null {
  const apiKey = req.headers.get('x-api-key')?.trim();
  if (apiKey) return apiKey;

  const header = req.headers.get('x-internal-token')?.trim();
  if (header) return header;

  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const match = /^Bearer\s+(\S+)/i.exec(auth.trim());
  return match?.[1] ?? null;
}

/** Comparación en tiempo constante, también para largos distintos. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

function matchesSecret(req: RequestLike, secret: string | undefined): boolean {
  if (!secret) return false;
  const token = requestToken(req);
  return Boolean(token) && safeEqual(token as string, secret);
}

/** Token compartido anterior (`INTERNAL_API_TOKEN`), mientras `LEGACY_TOKEN_ENABLED=true`. */
export function isLegacyToken(req: RequestLike): boolean {
  const cfg = config();
  return cfg.legacyTokenEnabled && matchesSecret(req, cfg.internalApiToken);
}

/** @deprecated Usar `isLegacyToken`; se mantiene para las integraciones anteriores. */
export function isAuthorized(req: RequestLike): boolean {
  return isLegacyToken(req);
}

/** Acceso a la interfaz interna (dashboard, supresión, sistemas). */
export function isAdmin(req: RequestLike): boolean {
  return matchesSecret(req, config().adminToken);
}

/**
 * Rutas del dashboard: token de administración o, si `DASHBOARD_LEGACY_TOKEN=true`,
 * también el token legacy (para sistemas externos que todavía consultan el dashboard).
 */
export function isDashboardAuthorized(req: RequestLike): boolean {
  if (isAdmin(req)) return true;
  return config().dashboardLegacyToken && isLegacyToken(req);
}
