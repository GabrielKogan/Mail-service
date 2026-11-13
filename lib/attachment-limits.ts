/**
 * Tope por archivo y del conjunto. SES acepta 40 MB el mensaje MIME ya
 * codificado: 28 MB decodificados quedan cerca de 38 MB con el base64.
 */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 15;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 28 * 1024 * 1024;

const ALLOWED_BY_EXT: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  xls: [
    'application/vnd.ms-excel',
    'application/excel',
    'application/x-excel',
    'application/x-msexcel',
  ],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  sql: ['application/sql', 'application/x-sql', 'text/plain', 'text/x-sql', 'text/sql'],
  db: ['application/vnd.sqlite3', 'application/x-sqlite3'],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  jpeg: ['image/jpeg', 'image/jpg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
};

export const ALLOWED_ATTACHMENT_EXTENSIONS = Object.keys(ALLOWED_BY_EXT);

/** Lista para mensajes al cliente. JPG y JPEG cuentan como el mismo tipo. */
export const ALLOWED_ATTACHMENT_LABEL =
  'PDF, DOC, DOCX, XLS, XLSX, SQL, DB, PNG, JPG, GIF o WEBP';

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  if (i < 0) return '';
  return filename.slice(i + 1).toLowerCase();
}

export function isAllowedAttachment(
  filename: string,
  contentType: string
): boolean {
  const ext = extensionOf(filename);
  const allowed = ALLOWED_BY_EXT[ext];
  if (!allowed) return false;
  const ct = contentType.toLowerCase().split(';')[0].trim();
  return allowed.includes(ct) || ct === 'application/octet-stream';
}

/** Tamaño aproximado en bytes de un string base64. */
export function base64ByteLength(b64: string): number {
  const cleaned = b64.replace(/\s/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}
