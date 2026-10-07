import type { ZodError, ZodIssue } from 'zod';
import { MAX_ATTACHMENTS } from '@/lib/attachment-limits';

/** Prioridad del `codigo` cuando un request trae varios problemas de adjuntos. */
export const ATTACHMENT_CODE_PRIORITY = [
  'tipo_adjunto_no_permitido',
  'nombre_archivo_invalido',
  'adjunto_vacio',
  'adjunto_demasiado_grande',
  'demasiados_adjuntos',
  'adjuntos_total_excedido',
] as const;

export type AttachmentCode = (typeof ATTACHMENT_CODE_PRIORITY)[number];

export type AttachmentDetail = {
  codigo: AttachmentCode;
  mensaje: string;
  archivo?: string;
  bytes?: number;
  maxBytes?: number;
  max?: number;
};

export type ValidationClientBody = {
  ok: false;
  codigo: string;
  error: string;
  detalle: unknown;
  log: string;
};

function isAttachmentCode(value: unknown): value is AttachmentCode {
  return (
    typeof value === 'string' &&
    (ATTACHMENT_CODE_PRIORITY as readonly string[]).includes(value)
  );
}

function customParams(issue: ZodIssue): Record<string, unknown> {
  if (issue.code !== 'custom' || !issue.params || typeof issue.params !== 'object') return {};
  return issue.params as Record<string, unknown>;
}

export function attachmentCodeOf(issue: ZodIssue): AttachmentCode | null {
  const codigo = customParams(issue).codigo;
  if (isAttachmentCode(codigo)) return codigo;
  if (issue.code === 'too_big' && issue.path.length === 1 && issue.path[0] === 'adjuntos') {
    return 'demasiados_adjuntos';
  }
  const field = issue.path[issue.path.length - 1];
  if (field === 'filename' && (issue.code === 'too_small' || issue.code === 'too_big')) {
    return 'nombre_archivo_invalido';
  }
  if (field === 'contentBase64' && issue.code === 'too_small') {
    return 'adjunto_vacio';
  }
  return null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** MB con un decimal, sin ".0". */
export function formatMb(bytes: number): string {
  const rounded = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function detailFrom(issue: ZodIssue, codigo: AttachmentCode): AttachmentDetail {
  const params = customParams(issue);
  const detail: AttachmentDetail = { codigo, mensaje: issue.message };
  const archivo = asString(params.archivo);
  if (archivo) detail.archivo = archivo;
  const bytes = asNumber(params.bytes);
  if (bytes !== undefined) detail.bytes = bytes;
  const maxBytes = asNumber(params.maxBytes);
  if (maxBytes !== undefined) detail.maxBytes = maxBytes;
  if (codigo === 'demasiados_adjuntos') detail.max = MAX_ATTACHMENTS;
  return detail;
}

function logLine(detail: AttachmentDetail): string {
  switch (detail.codigo) {
    case 'tipo_adjunto_no_permitido':
      return `"${detail.archivo ?? 'archivo'}" no es un tipo permitido (PDF, DOC, DOCX, PNG, JPG, GIF o WEBP)`;
    case 'nombre_archivo_invalido':
      return detail.archivo
        ? `el nombre "${detail.archivo}" no es válido`
        : 'un nombre de archivo no es válido';
    case 'adjunto_vacio':
      return detail.archivo ? `"${detail.archivo}" está vacío` : 'un adjunto está vacío';
    case 'adjunto_demasiado_grande':
      return `"${detail.archivo ?? 'archivo'}" pesa ${formatMb(detail.bytes ?? 0)} MB (máximo ${formatMb(detail.maxBytes ?? 0)} MB)`;
    case 'demasiados_adjuntos':
      return `hay más de ${detail.max ?? MAX_ATTACHMENTS} archivos`;
    case 'adjuntos_total_excedido':
      return `el total pesa ${formatMb(detail.bytes ?? 0)} MB (máximo ${formatMb(detail.maxBytes ?? 0)} MB)`;
  }
}

function rank(codigo: AttachmentCode): number {
  return ATTACHMENT_CODE_PRIORITY.indexOf(codigo);
}

/** 400 de validación: código estable y una frase sin el base64 ni el cuerpo. */
export function formatValidationFailure(error: ZodError): ValidationClientBody {
  const tagged = error.issues.flatMap((issue) => {
    const codigo = attachmentCodeOf(issue);
    return codigo ? [{ issue, codigo, detail: detailFrom(issue, codigo) }] : [];
  });

  if (!tagged.length) {
    const messages = [...new Set(error.issues.map((issue) => issue.message.replace(/\.+$/, '')))].slice(0, 8);
    return {
      ok: false,
      codigo: 'datos_invalidos',
      error: 'Datos inválidos',
      detalle: error.flatten(),
      log: `Rechazado: ${messages.join('. ')}.`,
    };
  }

  const sorted = [...tagged].sort((a, b) => rank(a.codigo) - rank(b.codigo));
  const otros = [
    ...new Set(
      error.issues
        .filter((issue) => !attachmentCodeOf(issue))
        .map((issue) => issue.message.replace(/\.+$/, ''))
    ),
  ];
  const extra = otros.length ? `. ${otros.join('. ')}` : '';
  return {
    ok: false,
    codigo: sorted[0].codigo,
    error: sorted[0].issue.message,
    detalle: sorted.map((item) => item.detail),
    log: `Rechazado: ${sorted.map((item) => logLine(item.detail)).join('. ')}${extra}.`,
  };
}

function listaAdjuntos(nombres: string[]): string {
  return nombres.length ? ` Adjuntos: ${nombres.join(', ')}.` : '';
}

export function logEnviado(opts: {
  id: number;
  email: string;
  messageId: string;
  adjuntos: string[];
}): string {
  return `Mail enviado (id ${opts.id}) a ${opts.email}. messageId ${opts.messageId}.${listaAdjuntos(opts.adjuntos)}`;
}

export function logEncolado(opts: { id: number; email: string; adjuntos: string[] }): string {
  return `Mail registrado en cola (id ${opts.id}) para ${opts.email}. El worker lo envía.${listaAdjuntos(opts.adjuntos)}`;
}

export function logDuplicado(id: number, estado: string): string {
  return `No se reenvió: la clave ya corresponde al envío ${id} (estado ${estado}).`;
}

export function logIdempotenciaConflicto(id: number): string {
  return `Rechazado: la clave de idempotencia ya se usó en el envío ${id} con otro contenido.`;
}

export function logSuprimido(opts: {
  email?: string;
  id?: number;
  motivo?: string;
  detalle?: string | null;
}): string {
  const quien = opts.email ? `${opts.email} está` : `El envío ${opts.id ?? ''} está`;
  let motivo = '';
  if (opts.motivo) motivo = ` (motivo ${opts.motivo})`;
  else if (opts.detalle) motivo = ` (${opts.detalle})`;
  const id = opts.id != null && opts.email ? `, id ${opts.id}` : '';
  return `Rechazado: ${quien} en la lista de supresión${motivo}${id}. No se reenvía.`;
}
