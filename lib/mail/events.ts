import { prisma } from '@/lib/prisma';
import {
  mapSesEventToEstado,
  mapSesEventToNombre,
  shouldUpdateEstado,
} from './tracking';

export type MailEventInput = {
  mailLogId: number;
  evento: string;
  fechaEvento?: Date;
  ip?: string | null;
  userAgent?: string | null;
  payloadRaw?: string | null;
  /** Si se pasa, actualiza estadoActual según reglas de prioridad. */
  nuevoEstado?: string | null;
};

export async function recordMailEvent(input: MailEventInput): Promise<void> {
  const fecha = input.fechaEvento ?? new Date();

  await prisma.mail_log_eventos.create({
    data: {
      mail_log_id: input.mailLogId,
      evento: input.evento.slice(0, 30),
      fecha_evento: fecha,
      ip: input.ip?.slice(0, 45) ?? null,
      user_agent: input.userAgent?.slice(0, 500) ?? null,
      payload_raw: input.payloadRaw ?? null,
    },
  });

  if (!input.nuevoEstado) return;

  const log = await prisma.mailLog.findUnique({
    where: { id: input.mailLogId },
    select: { estadoActual: true },
  });
  if (!log) return;
  if (!shouldUpdateEstado(log.estadoActual, input.nuevoEstado)) return;

  await prisma.mailLog.update({
    where: { id: input.mailLogId },
    data: { estadoActual: input.nuevoEstado },
  });
}

export async function recordSesEvent(opts: {
  mailLogId: number;
  eventType: string;
  timestamp?: string;
  ip?: string | null;
  userAgent?: string | null;
  payloadRaw: string;
}): Promise<void> {
  await recordMailEvent({
    mailLogId: opts.mailLogId,
    evento: mapSesEventToNombre(opts.eventType),
    fechaEvento: opts.timestamp ? new Date(opts.timestamp) : new Date(),
    ip: opts.ip,
    userAgent: opts.userAgent,
    payloadRaw: opts.payloadRaw,
    nuevoEstado: mapSesEventToEstado(opts.eventType),
  });
}
