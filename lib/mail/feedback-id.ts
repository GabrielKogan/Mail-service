/** Identificador fijo del remitente (cuarto campo del Feedback-ID). */
export const FEEDBACK_SENDER_ID = 'mlc';

function campo(value: string | null | undefined, fallback: string): string {
  const v = (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return v || fallback;
}

/**
 * `Feedback-ID: <tipo>:<origen>:<clasificacion>:mlc`. Gmail agrupa la tasa de spam
 * de Postmaster por estos campos, así que ninguno puede ser único por mensaje.
 */
export function feedbackId(opts: {
  tipo: string | null | undefined;
  origen: string | null | undefined;
  clasificacion: string;
}): string {
  return [
    campo(opts.tipo, 'html'),
    campo(opts.origen, 'sin_origen'),
    campo(opts.clasificacion, 'transactional'),
    FEEDBACK_SENDER_ID,
  ].join(':');
}
