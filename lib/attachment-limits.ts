/** Límite por archivo (bytes). SES recomienda no superar ~10 MB el mensaje completo. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024;

const ALLOWED_BY_EXT: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/jpg'],
  jpeg: ['image/jpeg', 'image/jpg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
};

export const ALLOWED_ATTACHMENT_EXTENSIONS = Object.keys(ALLOWED_BY_EXT);

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
