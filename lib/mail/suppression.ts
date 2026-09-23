import { prisma } from '@/lib/prisma';

export const GLOBAL_SUPPRESSION_ORIGEN = '*';

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

export function criticalOrigins(): Set<string> {
  const raw = process.env.MAIL_ORIGENES_CRITICOS;
  const source = raw === undefined ? 'turnos,expediente' : raw;
  return new Set(
    source
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isCriticalOrigin(origen: string | null | undefined): boolean {
  const o = (origen ?? '').trim().toLowerCase();
  if (!o) return false;
  return criticalOrigins().has(o);
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

export async function upsertSuppression(input: {
  email: string;
  origen: string;
  motivo: SuppressionMotivo;
  mailLogId?: number | null;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  const origen = input.origen.trim() || GLOBAL_SUPPRESSION_ORIGEN;
  if (!email) return;

  await prisma.mail_supresion.upsert({
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
  });
}

export function suppressionErrorDetail(match: SuppressionMatch): string {
  if (match.origen === GLOBAL_SUPPRESSION_ORIGEN) {
    return `Destinatario suprimido (motivo: ${match.motivo}, todos los orígenes).`;
  }
  return `Destinatario suprimido para el origen "${match.origen}" (motivo: ${match.motivo}).`;
}
