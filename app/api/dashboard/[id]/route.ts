import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDashboardAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';
import type { InternalEvento } from '@/lib/mail/events';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

const INTERNAL_EVENTOS = new Set<string>([
  'creado',
  'encolado',
  'enviando',
  'aceptado',
  'reintento',
  'fallo',
  'suprimido',
  'revisar',
  'agotado',
  'reencolado_auto',
  'reencolado',
] satisfies InternalEvento[]);

function internalDetail(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    const parts: string[] = [];
    if (d.intento != null) parts.push(`intento ${d.intento}`);
    if (d.modo) parts.push(d.modo === 'queue' ? 'por cola' : 'envío directo');
    if (d.desde) parts.push(`desde ${d.desde}`);
    if (d.messageId) parts.push(`messageId ${d.messageId}`);
    if (d.detalle) parts.push(String(d.detalle));
    return parts.join(' · ').slice(0, 500) || null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isDashboardAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonWithCors(req, { error: 'Id inválido' }, { status: 400 });
  }

  const item = await prisma.mailLog.findUnique({
    where: { id },
    include: {
      mail_log_eventos: {
        orderBy: [{ fecha_evento: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          evento: true,
          fecha_evento: true,
          ip: true,
          user_agent: true,
          payload_raw: true,
        },
      },
    },
  });
  if (!item) {
    return jsonWithCors(req, { error: 'No encontrado' }, { status: 404 });
  }

  const { mail_log_eventos, ...rest } = item;
  const eventos = mail_log_eventos.map((e) => {
    const interno = INTERNAL_EVENTOS.has(e.evento);
    return {
      id: e.id,
      evento: e.evento,
      fechaEvento: e.fecha_evento,
      ip: e.ip,
      userAgent: e.user_agent,
      interno,
      detalle: interno ? internalDetail(e.payload_raw) : null,
    };
  });
  const tieneEntrega =
    rest.estadoActual === 'entregado' ||
    rest.estadoActual === 'abierto' ||
    eventos.some((e) => e.evento === 'entrega');
  const tieneApertura =
    rest.estadoActual === 'abierto' ||
    eventos.some((e) => e.evento === 'apertura');
  const rebotado =
    rest.estadoActual === 'rebotado' ||
    eventos.some((e) => e.evento === 'rebote');

  return jsonWithCors(req, {
    ...rest,
    eventos,
    llego: rebotado ? false : tieneEntrega,
    abrio: tieneApertura,
    rebotado,
    fechaEntrega:
      eventos.find((e) => e.evento === 'entrega')?.fechaEvento ?? null,
    fechaApertura:
      eventos.find((e) => e.evento === 'apertura')?.fechaEvento ?? null,
  });
}
