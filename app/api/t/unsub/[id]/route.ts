import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordMailEvent } from '@/lib/mail/events';
import {
  isCriticalOrigin,
  upsertSuppression,
} from '@/lib/mail/suppression';
import { verifyUnsubToken } from '@/lib/mail/tracking';
import { getMailFrom } from '@/lib/mail/from';

type UnsubLog = {
  id: number;
  destinatario: string;
  origen: string | null;
};

async function loadVerifiedLog(
  idRaw: string,
  token: string
): Promise<{ ok: true; log: UnsubLog } | { ok: false; status: number; error: string }> {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0 || !verifyUnsubToken(id, token)) {
    return { ok: false, status: 404, error: 'Enlace inválido o vencido' };
  }

  const log = await prisma.mailLog.findUnique({
    where: { id },
    select: { id: true, destinatario: true, origen: true },
  });
  if (!log) {
    return { ok: false, status: 404, error: 'Enlace inválido o vencido' };
  }

  return { ok: true, log };
}

async function alreadyUnsubscribed(email: string, origen: string): Promise<boolean> {
  const row = await prisma.mail_supresion.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      origen,
      motivo: 'baja',
      activo: true,
    },
    select: { id: true },
  });
  return row != null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.nextUrl.searchParams.get('t') ?? '';
  const loaded = await loadVerifiedLog((await params).id, token);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const { log } = loaded;
  const origen = log.origen?.trim() || 'desconocido';
  const critico = await isCriticalOrigin(origen);
  const yaDadoDeBaja = critico
    ? false
    : await alreadyUnsubscribed(log.destinatario, origen);

  return NextResponse.json({
    ok: true,
    email: log.destinatario,
    origen,
    critico,
    yaDadoDeBaja,
    permiteBaja: !critico,
    contacto: getMailFrom().email,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.nextUrl.searchParams.get('t') ?? '';
  const loaded = await loadVerifiedLog((await params).id, token);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const { log } = loaded;
  const origen = log.origen?.trim() || 'desconocido';
  const critico = await isCriticalOrigin(origen);

  if (critico) {
    return NextResponse.json({
      ok: false,
      critico: true,
      error:
        'Este correo es una notificación oficial. No se puede dar de baja de este sistema.',
      contacto: getMailFrom().email,
    });
  }

  await upsertSuppression({
    email: log.destinatario,
    origen,
    motivo: 'baja',
    mailLogId: log.id,
    origenAccion: 'vecino',
  });

  try {
    await recordMailEvent({
      mailLogId: log.id,
      evento: 'baja',
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, yaDadoDeBaja: true, origen, email: log.destinatario });
}
