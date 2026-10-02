import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { encryptSecret } from '@/lib/google/crypto';
import {
  GOOGLE_SCOPES,
  STATE_COOKIE,
  cookieOptions,
  exchangeCode,
  verifyOAuthState,
} from '@/lib/google/oauth';

export const runtime = 'nodejs';

function redirectToSistemas(query: string): NextResponse {
  const base = (config().appBaseUrl ?? '').replace(/\/$/, '') || '';
  return NextResponse.redirect(`${base}/sistemas?${query}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const err = url.searchParams.get('error');
  if (err) return redirectToSistemas(`google=error&detalle=${encodeURIComponent(err)}`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const jar = await cookies();
  const nonce = jar.get(STATE_COOKIE)?.value ?? '';
  jar.set(STATE_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });

  if (!code || !state) return redirectToSistemas('google=error&detalle=faltan_parametros');
  const checked = verifyOAuthState(state, nonce);
  if (!checked.ok) {
    return redirectToSistemas(`google=error&detalle=${encodeURIComponent(checked.error)}`);
  }

  try {
    const tokens = await exchangeCode(code);
    const enc = encryptSecret(tokens.refreshToken);
    await prisma.$transaction(async (tx) => {
      await tx.mail_google_conexion.deleteMany();
      await tx.mail_google_conexion.create({
        data: {
          email: tokens.email || 'desconocido',
          refreshTokenEnc: enc,
          scopes: GOOGLE_SCOPES,
          estado: 'activa',
          ultimoError: null,
          alertadoVencida: null,
        },
      });
    });
    return redirectToSistemas('google=ok');
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    return redirectToSistemas(`google=error&detalle=${encodeURIComponent(detalle)}`);
  }
}
