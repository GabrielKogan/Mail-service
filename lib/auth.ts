import { NextRequest } from 'next/server';

function requestToken(req: NextRequest): string | null {
  const header = req.headers.get('x-internal-token')?.trim();
  if (header) return header;

  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const match = /^Bearer\s+(\S+)/i.exec(auth.trim());
  return match?.[1] ?? null;
}

/**
 * Valida que la request interna traiga el token compartido
 * (`x-internal-token` o `Authorization: Bearer`).
 */
export function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) return false;
  const token = requestToken(req);
  return Boolean(token) && token === expected;
}
