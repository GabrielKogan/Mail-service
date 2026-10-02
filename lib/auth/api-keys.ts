import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requestToken } from '@/lib/auth';
import { toSistemaAuth, type SistemaAuth } from '@/lib/mail/sistemas';

/** mls_<prefijo de 8 hex>_<32 bytes en base64url> */
export const API_KEY_PATTERN = /^mls_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$/;

const TOUCH_INTERVAL_MS = 60_000;

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; prefijo: string; hash: string } {
  const prefijo = randomBytes(4).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const key = `mls_${prefijo}_${secret}`;
  return { key, prefijo, hash: hashApiKey(key) };
}

export function parseApiKey(key: string): { prefijo: string } | null {
  const match = API_KEY_PATTERN.exec(key);
  return match ? { prefijo: match[1] } : null;
}

export function isApiKeyFormat(token: string | null | undefined): token is string {
  return Boolean(token && API_KEY_PATTERN.test(token));
}

function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

/** Valida una clave con formato `mls_...`: clave y sistema activos, hash correcto. */
export async function authenticateApiKey(key: string): Promise<SistemaAuth | null> {
  const parsed = parseApiKey(key);
  if (!parsed) return null;

  const row = await prisma.mail_api_key.findUnique({
    where: { prefijo: parsed.prefijo },
    include: { sistema: true },
  });
  if (!row || !row.activo || row.revocadaEn || !row.sistema.activo) return null;
  if (!hashesMatch(hashApiKey(key), row.hash.trim())) return null;

  const now = new Date();
  try {
    await prisma.mail_api_key.updateMany({
      where: {
        id: row.id,
        OR: [{ ultimoUso: null }, { ultimoUso: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) } }],
      },
      data: { ultimoUso: now },
    });
  } catch {
    // No bloquear el envío por no poder registrar el último uso.
  }

  return toSistemaAuth(row.sistema);
}

/** Sistema autenticado por la clave del request, o null. */
export async function authenticateSystem(req: { headers: Headers }): Promise<SistemaAuth | null> {
  const token = requestToken(req);
  if (!isApiKeyFormat(token)) return null;
  return authenticateApiKey(token);
}
