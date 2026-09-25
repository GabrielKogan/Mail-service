import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  mapSesEventToEstado,
  mapSesEventToNombre,
  shouldUpdateEstado,
} from './tracking';

type Db = Prisma.TransactionClient | typeof prisma;

export type MailEventInput = {
  mailLogId: number;
  evento: string;
  fechaEvento?: Date;
  ip?: string | null;
  userAgent?: string | null;
  payloadRaw?: string | null;
  /** Id del evento en el origen (MessageId de SNS). Si se repite, la inserción falla con P2002. */
  origenEventoId?: string | null;
  /** Si se pasa, actualiza estadoActual según reglas de prioridad. */
  nuevoEstado?: string | null;
};

export async function recordMailEvent(input: MailEventInput, db: Db = prisma): Promise<void> {
  const fecha = input.fechaEvento ?? new Date();

  await db.mail_log_eventos.create({
    data: {
      mail_log_id: input.mailLogId,
      evento: input.evento.slice(0, 30),
      fecha_evento: fecha,
      ip: input.ip?.slice(0, 45) ?? null,
      user_agent: input.userAgent?.slice(0, 500) ?? null,
      payload_raw: input.payloadRaw ?? null,
      origenEventoId: input.origenEventoId?.slice(0, 100) ?? null,
    },
  });

  if (!input.nuevoEstado) return;

  const log = await db.mailLog.findUnique({
    where: { id: input.mailLogId },
    select: { estadoActual: true },
  });
  if (!log) return;
  if (!shouldUpdateEstado(log.estadoActual, input.nuevoEstado)) return;

  await db.mailLog.update({
    where: { id: input.mailLogId },
    data: { estadoActual: input.nuevoEstado },
  });
}

/** Eventos que genera el propio servicio (no vienen de SES). No cambian el estado. */
export type InternalEvento =
  | 'creado'
  | 'encolado'
  | 'enviando'
  | 'aceptado'
  | 'reintento'
  | 'fallo'
  | 'suprimido'
  | 'revisar'
  | 'agotado'
  | 'reencolado_auto'
  | 'reencolado';

export function internalEventData(
  mailLogId: number,
  evento: InternalEvento,
  detalle?: Record<string, unknown>
) {
  return {
    mail_log_id: mailLogId,
    evento,
    fecha_evento: new Date(),
    payload_raw: detalle ? JSON.stringify(detalle) : null,
  };
}

/**
 * Registra un evento interno. Es trazabilidad: si falla, se loguea y el envío sigue.
 */
export async function recordInternalEvent(
  mailLogId: number,
  evento: InternalEvento,
  detalle?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.mail_log_eventos.create({ data: internalEventData(mailLogId, evento, detalle) });
  } catch (err) {
    console.error(`[eventos] no se pudo registrar "${evento}" del mail ${mailLogId}:`, err);
  }
}

export async function recordSesEvent(
  opts: {
    mailLogId: number;
    eventType: string;
    timestamp?: string;
    ip?: string | null;
    userAgent?: string | null;
    payloadRaw: string;
    origenEventoId?: string | null;
  },
  db: Db = prisma
): Promise<void> {
  await recordMailEvent(
    {
      mailLogId: opts.mailLogId,
      evento: mapSesEventToNombre(opts.eventType),
      fechaEvento: opts.timestamp ? new Date(opts.timestamp) : new Date(),
      ip: opts.ip,
      userAgent: opts.userAgent,
      payloadRaw: opts.payloadRaw,
      origenEventoId: opts.origenEventoId,
      nuevoEstado: mapSesEventToEstado(opts.eventType),
    },
    db
  );
}
