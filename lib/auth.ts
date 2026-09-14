import { NextRequest } from 'next/server';

/**
 * Valida que la request interna traiga el token compartido.
 * Uso: if (!isAuthorized(req)) return NextResponse.json({error:'No autorizado'}, {status:401})
 */
export function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token');
  return Boolean(token) && token === process.env.INTERNAL_API_TOKEN;
}
