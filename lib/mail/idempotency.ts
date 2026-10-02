import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Adjuntos = { filename: string; contentType: string; contentBase64: string }[];

export type HashableRequest =
  | { email: string; asunto: string; cuerpo: string; adjuntos: Adjuntos }
  | { email: string; tipo: string; data: unknown; nombre?: string; adjuntos: Adjuntos };

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** JSON con las claves ordenadas: el mismo `data` da el mismo hash en cualquier orden. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 del contenido normalizado: mismo mail aunque cambie el orden de las claves del JSON. */
export function computeRequestHash(req: HashableRequest): string {
  const contenido =
    'tipo' in req
      ? { tipo: req.tipo, data: stableJson(req.data ?? {}), nombre: req.nombre ?? '' }
      : { asunto: req.asunto, cuerpo: req.cuerpo };
  const normalized = {
    email: req.email.trim().toLowerCase(),
    ...contenido,
    adjuntos: req.adjuntos.map((a) => ({
      filename: a.filename,
      contentType: a.contentType.toLowerCase(),
      sha256: sha256(Buffer.from(a.contentBase64, 'base64')),
    })),
  };
  return sha256(JSON.stringify(normalized));
}

export type IdempotentRecord = {
  id: number;
  estadoActual: string;
  messageId: string;
  errorDetalle: string | null;
  requestHash: string | null;
};

const recordSelect = {
  id: true,
  estadoActual: true,
  messageId: true,
  errorDetalle: true,
  requestHash: true,
} as const;

export async function findByIdempotencyKey(
  sistemaId: number,
  key: string
): Promise<IdempotentRecord | null> {
  return prisma.mailLog.findFirst({
    where: { sistemaId, idempotencyKey: key },
    select: recordSelect,
  });
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export type IdempotentReply = { status: number; body: Record<string, unknown> };

/** Respuesta para una clave ya usada: la misma que tuvo el original, o 409 si cambió el contenido. */
export function replyForExisting(existing: IdempotentRecord, requestHash: string): IdempotentReply {
  if ((existing.requestHash ?? '').trim() !== requestHash) {
    return {
      status: 409,
      body: {
        error: 'Clave de idempotencia reutilizada con otro contenido',
        id: existing.id,
      },
    };
  }

  if (existing.estadoActual === 'suprimido') {
    return {
      status: 422,
      body: {
        error: 'Destinatario en lista de supresión',
        detalle: existing.errorDetalle,
        id: existing.id,
        duplicado: true,
      },
    };
  }

  const provisional = /^(pending|suppressed|error|queued)-/.test(existing.messageId);
  const pendiente = existing.estadoActual === 'en_cola' || existing.estadoActual === 'enviando';
  return {
    status: pendiente ? 202 : 200,
    body: {
      ok: true,
      id: existing.id,
      estado: existing.estadoActual,
      messageId: provisional ? null : existing.messageId,
      duplicado: true,
    },
  };
}
