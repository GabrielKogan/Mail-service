import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HEADERS = 'Content-Type, Authorization, x-internal-token';
const ALLOWED_METHODS = 'GET, POST, OPTIONS';

function configuredOrigins(): string[] | '*' | null {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return null;
  if (raw === '*') return '*';
  const list = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

function allowOrigin(req: NextRequest): string | null {
  const configured = configuredOrigins();
  if (!configured) return null;
  if (configured === '*') return '*';
  const origin = req.headers.get('origin');
  if (origin && configured.includes(origin)) return origin;
  return null;
}

export function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = allowOrigin(req);
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
  init?: ResponseInit
): NextResponse {
  return withCors(req, NextResponse.json(body, init));
}

export function corsPreflight(req: NextRequest): NextResponse {
  return withCors(req, new NextResponse(null, { status: 204 }));
}
