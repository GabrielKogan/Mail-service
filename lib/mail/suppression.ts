import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { clasificacionDe } from '@/lib/mail/sistemas';

export const GLOBAL_SUPPRESSION_ORIGEN = '*';

type Db = Prisma.TransactionClient | typeof prisma;

export type SuppressionMotivo = 'rebote' | 'queja' | 'baja';

export type SuppressionMatch = {
  id: number;
  email: string;
  origen: string;
  motivo: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Un origen es crítico (no admite baja) si su sistema es transaccional. Para los
 * orígenes sin sistema registrado se usa `MAIL_ORIGENES_CRITICOS`.
 */
export async function isCriticalOrigin(origen: string | null | undefined): Promise<boolean> {
  const o = (origen ?? '').trim();
  if (!o) return false;
  return (await clasificacionDe(o)) === 'transactional';
}

export async function findActiveSuppression(
  email: string,
  origen: string | null | undefined
): Promise<SuppressionMatch | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const originKey = (origen ?? '').trim();

  const row = await prisma.mail_supresion.findFirst({
    where: {
      email: normalized,
      activo: true,
      OR: originKey
        ? [{ origen: GLOBAL_SUPPRESSION_ORIGEN }, { origen: originKey }]
        : [{ origen: GLOBAL_SUPPRESSION_ORIGEN }],
    },
    orderBy: { fecha: 'desc' },
    select: { id: true, email: true, origen: true, motivo: true },
  });

  return row;
}

export async function isSuppressed(
  email: string,
  origen: string | null | undefined
): Promise<boolean> {
  const match = await findActiveSuppression(email, origen);
  return match != null;
}

/** Quién originó un bloqueo o una reactivación. */
export type SuppressionOrigenAccion = 'ses' | 'vecino' | 'admin';

export async function upsertSuppression(input: {
  email: string;
  origen: string;
  motivo: SuppressionMotivo;
  mailLogId?: number | null;
  origenAccion: SuppressionOrigenAccion;
  nota?: string | null;
}, db: Db = prisma): Promise<number | null> {
  const email = normalizeEmail(input.email);
  const origen = input.origen.trim() || GLOBAL_SUPPRESSION_ORIGEN;
  if (!email) return null;

  const row = await db.mail_supresion.upsert({
    where: {
      email_origen: { email, origen },
    },
    create: {
      email,
      origen,
      motivo: input.motivo,
      mail_log_id: input.mailLogId ?? null,
      activo: true,
      fecha: new Date(),
    },
    update: {
      motivo: input.motivo,
      mail_log_id: input.mailLogId ?? null,
      activo: true,
      fecha: new Date(),
    },
    select: { id: true },
  });

  await db.mail_supresion_historial.create({
    data: {
      supresionId: row.id,
      accion: 'bloquear',
      motivo: input.motivo,
      origenAccion: input.origenAccion,
      nota: input.nota?.slice(0, 1000) ?? null,
    },
  });

  return row.id;
}

export const MIN_NOTA_REACTIVACION = 10;

export type ReactivationInput = {
  responsable?: unknown;
  nota?: unknown;
  confirmar?: unknown;
};

export type ReactivationDecision =
  | { ok: true; responsable: string; nota: string | null }
  | { ok: false; status: 400 | 409; error: string; requiereConfirmacion?: true };

/**
 * Reglas para cambiar el estado de una supresión desde el panel. Una baja la pidió
 * el vecino y se puede revertir a su pedido. Un rebote o una queja vienen del
 * proveedor: reactivarlos sin revisar vuelve a mandar a una dirección que no existe
 * o a alguien que se quejó, y eso daña la reputación del dominio.
 */
export function reactivationRule(
  motivo: string,
  input: ReactivationInput
): ReactivationDecision {
  const responsable =
    typeof input.responsable === 'string' ? input.responsable.trim().slice(0, 120) : '';
  const nota = typeof input.nota === 'string' ? input.nota.trim().slice(0, 1000) : '';

  if (!responsable) {
    return { ok: false, status: 400, error: 'Indicá quién es el responsable del cambio.' };
  }
  if (motivo !== 'rebote' && motivo !== 'queja') {
    return { ok: true, responsable, nota: nota || null };
  }
  if (input.confirmar !== true) {
    return {
      ok: false,
      status: 409,
      requiereConfirmacion: true,
      error:
        motivo === 'queja'
          ? 'La dirección se bloqueó por una queja de spam. Confirmá que el titular pidió volver a recibir correos.'
          : 'La dirección se bloqueó por un rebote permanente. Confirmá que se verificó que la dirección es correcta.',
    };
  }
  if (nota.length < MIN_NOTA_REACTIVACION) {
    return {
      ok: false,
      status: 400,
      error: `Dejá una nota de al menos ${MIN_NOTA_REACTIVACION} caracteres explicando qué se verificó.`,
    };
  }
  return { ok: true, responsable, nota };
}

export function suppressionErrorDetail(match: SuppressionMatch): string {
  if (match.origen === GLOBAL_SUPPRESSION_ORIGEN) {
    return `Destinatario suprimido (motivo: ${match.motivo}, todos los orígenes).`;
  }
  return `Destinatario suprimido para el origen "${match.origen}" (motivo: ${match.motivo}).`;
}
