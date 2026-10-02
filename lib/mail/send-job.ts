import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { getMailProvider } from './index';
import { isRetryableError, mailErrorMessage } from './errors';
import { TokenBucket } from './rate-limit';
import { clasificacionDe, findSistemaById } from './sistemas';
import { findActiveSuppression, suppressionErrorDetail } from './suppression';
import { recordInternalEvent } from './events';
import {
  listUnsubscribeHeaders,
  normalizeMessageId,
  withOpenPixel,
  withUnsubscribeFooter,
  withUnsubscribeFooterText,
} from './tracking';
import { feedbackId } from './feedback-id';

export const MAX_INTENTOS = 5;

/** Prefijo del messageId mientras el registro espera en la cola. */
export const QUEUED_PREFIX = 'queued-';

/** Registros con estos estados todavía no tienen un resultado del proveedor. */
export const PENDING_STATES = ['en_cola', 'enviando'] as const;

export type SendJobResult =
  | { status: 'sent'; messageId: string }
  | { status: 'skipped' }
  | { status: 'suppressed'; detalle: string }
  | { status: 'failed'; detalle: string };

/** Error reintentable con intentos disponibles: el registro volvió a `en_cola`. */
export class RetryableSendError extends Error {
  constructor(
    public readonly mailLogId: number,
    message: string
  ) {
    super(message);
    this.name = 'RetryableSendError';
  }
}

let bucket: TokenBucket | null = null;

function rateLimiter(): TokenBucket {
  bucket ??= new TokenBucket(config().sesMaxSendRate);
  return bucket;
}

export function resetRateLimiterForTests(b: TokenBucket | null = null): void {
  bucket = b;
}

/**
 * Envía un registro en `en_cola`. El paso a `enviando` es condicional, así que si
 * dos workers reciben el mismo mensaje solo uno envía.
 *
 * Con `allowRetry` (worker), un error reintentable con intentos disponibles vuelve
 * el registro a `en_cola` y lanza `RetryableSendError` para que SQS lo reintente.
 * Sin `allowRetry` (modo sync), cualquier error deja el registro en `error`.
 */
export async function processSendJob(
  mailLogId: number,
  opts: { allowRetry?: boolean } = {}
): Promise<SendJobResult> {
  const allowRetry = opts.allowRetry ?? true;

  const locked = await prisma.mailLog.updateMany({
    where: { id: mailLogId, estadoActual: 'en_cola' },
    data: { estadoActual: 'enviando', intentos: { increment: 1 }, fechaIntento: new Date() },
  });
  if (locked.count === 0) return { status: 'skipped' };

  const log = await prisma.mailLog.findUnique({
    where: { id: mailLogId },
    include: { adjuntos: { orderBy: { orden: 'asc' } } },
  });
  if (!log) return { status: 'skipped' };

  await recordInternalEvent(log.id, 'enviando', { intento: log.intentos });

  const suppressed = await findActiveSuppression(log.destinatario, log.origen);
  if (suppressed) {
    const detalle = suppressionErrorDetail(suppressed);
    await prisma.mailLog.update({
      where: { id: log.id },
      data: { estadoActual: 'suprimido', errorDetalle: detalle },
    });
    await recordInternalEvent(log.id, 'suprimido', { detalle });
    return { status: 'suppressed', detalle };
  }

  const sistema = await findSistemaById(log.sistemaId);
  const clasificacion = await clasificacionDe(log.origen, sistema);
  const esSuscripcion = clasificacion === 'subscription';
  const withPixel = withOpenPixel(log.cuerpo ?? '', log.id);
  const html = esSuscripcion ? withUnsubscribeFooter(withPixel, log.id) : withPixel;
  const text =
    log.texto != null
      ? esSuscripcion
        ? withUnsubscribeFooterText(log.texto, log.id)
        : log.texto
      : undefined;
  const headers: Record<string, string> = {
    'Feedback-ID': feedbackId({ tipo: log.tipo, origen: log.origen, clasificacion }),
    ...(esSuscripcion ? listUnsubscribeHeaders(log.id) : {}),
  };

  try {
    await rateLimiter().take();
    const { messageId } = await getMailProvider().send({
      to: log.destinatario,
      toName: log.nombreDest ?? '',
      subject: log.asunto,
      html,
      text,
      headers,
      tags: { mail_log_id: String(log.id) },
      attachments: log.adjuntos.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        contentBase64: Buffer.from(a.contenido).toString('base64'),
      })),
    });

    const finalId = normalizeMessageId(messageId);
    await prisma.mailLog.update({
      where: { id: log.id },
      data: { messageId: finalId, cuerpo: html, texto: text ?? null, errorDetalle: null },
    });
    // Condicional: un evento de SES (Delivery, Bounce...) pudo llegar antes y avanzar el estado.
    await prisma.mailLog.updateMany({
      where: { id: log.id, estadoActual: 'enviando' },
      data: { estadoActual: 'enviado' },
    });
    await recordInternalEvent(log.id, 'aceptado', { messageId: finalId });
    return { status: 'sent', messageId: finalId };
  } catch (err) {
    const detalle = mailErrorMessage(err);
    const retry = allowRetry && isRetryableError(err) && log.intentos < MAX_INTENTOS;

    await prisma.mailLog.updateMany({
      where: { id: log.id, estadoActual: 'enviando' },
      data: retry
        ? { estadoActual: 'en_cola', errorDetalle: `Intento ${log.intentos}: ${detalle}` }
        : { estadoActual: 'error', errorDetalle: detalle },
    });
    await recordInternalEvent(log.id, retry ? 'reintento' : 'fallo', {
      intento: log.intentos,
      detalle,
    });

    if (retry) throw new RetryableSendError(log.id, detalle);
    return { status: 'failed', detalle };
  }
}
