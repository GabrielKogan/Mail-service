import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { allSistemaCorsOrigins } from '@/lib/mail/sistemas';

const ALLOWED_HEADERS = 'Content-Type, Authorization, x-internal-token, x-api-key';
const ALLOWED_METHODS = 'GET, POST, OPTIONS';

export type CorsAllowList = string[] | '*' | null;

/** Lista global `CORS_ORIGINS` (interfaz y credencial legacy). */
export function globalCorsOrigins(): CorsAllowList {
  const raw = config().corsOrigins;
  if (!raw) return null;
  if (raw === '*') return '*';
  const list = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

function allowOrigin(req: NextRequest, allowed: CorsAllowList): string | null {
  if (!allowed) return null;
  if (allowed === '*') return '*';
  const origin = req.headers.get('origin');
  if (origin && allowed.includes(origin)) return origin;
  return null;
}

export function withCors(
  req: NextRequest,
  res: NextResponse,
  allowed: CorsAllowList = globalCorsOrigins()
): NextResponse {
  const origin = allowOrigin(req, allowed);
  if (!origin) return res;
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  res.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.headers.set('Vary', 'Origin');
  return res;
}

export function jsonWithCors(
  req: NextRequest,
  body: unknown,
  init?: ResponseInit,
  allowed?: CorsAllowList
): NextResponse {
  return withCors(req, NextResponse.json(body, init), allowed);
}

export function corsPreflight(req: NextRequest): NextResponse {
  return withCors(req, new NextResponse(null, { status: 204 }));
}

/**
 * Preflight de `/api/mail`: el navegador no manda credenciales en el OPTIONS,
 * así que se permite la unión de los orígenes de todos los sistemas. La
 * respuesta real solo lleva CORS si el origen es del sistema autenticado.
 */
export async function mailCorsPreflight(req: NextRequest): Promise<NextResponse> {
  const global = globalCorsOrigins();
  if (global === '*') return corsPreflight(req);
  let sistemas = new Set<string>();
  try {
    sistemas = await allSistemaCorsOrigins();
  } catch {
    // Si la base no responde, solo se usa la lista global.
  }
  const allowed = [...(global ?? []), ...sistemas];
  return withCors(req, new NextResponse(null, { status: 204 }), allowed.length ? allowed : null);
}
