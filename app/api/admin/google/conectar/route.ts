import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  STATE_COOKIE,
  authorizationUrl,
  cookieOptions,
  googleConfigured,
  newNonce,
  oauthRedirectAllowed,
  revokeToken,
  signOAuthState,
} from '@/lib/google/oauth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const row = await prisma.mail_google_conexion.findFirst({ orderBy: { id: 'asc' } });
  if (!row) {
    return NextResponse.json({
      conectado: false,
      configurado: googleConfigured(),
    });
  }
  return NextResponse.json({
    conectado: true,
    configurado: googleConfigured(),
    email: row.email,
    estado: row.estado,
    ultimaSync: row.ultimaSync,
    ultimoError: row.ultimoError,
    conectadoEn: row.conectadoEn,
  });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!googleConfigured()) {
    return NextResponse.json(
      { error: 'Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_TOKEN_KEY.' },
      { status: 400 }
    );
  }
  const allowed = oauthRedirectAllowed();
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.error }, { status: 400 });
  }
  const nonce = newNonce();
  const state = signOAuthState(nonce);
  const jar = await cookies();
  jar.set(STATE_COOKIE, nonce, cookieOptions(10 * 60));
  return NextResponse.json({ url: authorizationUrl(state) });
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const row = await prisma.mail_google_conexion.findFirst({ orderBy: { id: 'asc' } });
  if (row) {
    try {
      const { decryptSecret } = await import('@/lib/google/crypto');
      await revokeToken(decryptSecret(row.refreshTokenEnc));
    } catch {
      // ignore
    }
    await prisma.mail_google_conexion.delete({ where: { id: row.id } });
  }
  return NextResponse.json({ ok: true });
}
