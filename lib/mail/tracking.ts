import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '@/lib/config';

const ESTADO_RANK: Record<string, number> = {
  error: 0,
  en_cola: 0,
  enviando: 0,
  revisar: 0,
  enviado: 1,
  entregado: 2,
  abierto: 3,
  rebotado: 10,
  queja: 10,
  rechazado: 10,
  suprimido: 10,
};

export function normalizeMessageId(id: string): string {
  return id.trim().replace(/^<|>$/g, '');
}

export function trackingSecret(): string {
  return config().unsubscribeSecret;
}

/** Secretos aceptados al verificar: el actual y, durante la transición, el anterior. */
function verificationSecrets(): string[] {
  const cfg = config();
  return cfg.unsubscribeSecretPrevious
    ? [cfg.unsubscribeSecret, cfg.unsubscribeSecretPrevious]
    : [cfg.unsubscribeSecret];
}

function signToken(secret: string, purpose: 'open' | 'unsub', mailLogId: number): string {
  return createHmac('sha256', secret)
    .update(`${purpose}:${mailLogId}`)
    .digest('hex')
    .slice(0, 32);
}

function verifyToken(purpose: 'open' | 'unsub', mailLogId: number, token: string): boolean {
  const provided = Buffer.from(token);
  return verificationSecrets().some((secret) => {
    const expected = Buffer.from(signToken(secret, purpose, mailLogId));
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

export function appBaseUrl(): string | null {
  const cfg = config();
  if (cfg.appBaseUrl) return cfg.appBaseUrl;
  // En desarrollo, si no hay URL pública, usamos localhost para poder probar
  // el píxel en la misma PC. Gmail en otro dispositivo no llega a localhost.
  if (!cfg.isProduction) {
    return `http://localhost:${cfg.port || '3000'}`;
  }
  return null;
}

export function isPublicTrackingUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host !== 'localhost' && host !== '127.0.0.1';
  } catch {
    return false;
  }
}

export function trackingConfig() {
  const baseUrl = appBaseUrl();
  return {
    enabled: Boolean(baseUrl),
    baseUrl,
    isPublic: isPublicTrackingUrl(baseUrl),
  };
}

export function signOpenToken(mailLogId: number): string {
  return signToken(trackingSecret(), 'open', mailLogId);
}

export function verifyOpenToken(mailLogId: number, token: string): boolean {
  return verifyToken('open', mailLogId, token);
}

export function openPixelUrl(mailLogId: number): string | null {
  const base = appBaseUrl();
  if (!base) return null;
  const token = signOpenToken(mailLogId);
  return `${base}/api/t/open/${mailLogId}?t=${token}`;
}

function appendBeforeBody(html: string, snippet: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snippet}</body>`);
  }
  return `${html}${snippet}`;
}

/** Inserta píxel de apertura si hay APP_BASE_URL. */
export function withOpenPixel(html: string, mailLogId: number): string {
  const url = openPixelUrl(mailLogId);
  if (!url) return html;
  const pixel = `<img src="${url}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
  return appendBeforeBody(html, pixel);
}

export function signUnsubToken(mailLogId: number): string {
  return signToken(trackingSecret(), 'unsub', mailLogId);
}

export function verifyUnsubToken(mailLogId: number, token: string): boolean {
  return verifyToken('unsub', mailLogId, token);
}

export function unsubPageUrl(mailLogId: number): string | null {
  const base = appBaseUrl();
  if (!base) return null;
  const token = signUnsubToken(mailLogId);
  return `${base}/baja/${mailLogId}?t=${token}`;
}

export function unsubApiUrl(mailLogId: number): string | null {
  const base = appBaseUrl();
  if (!base) return null;
  const token = signUnsubToken(mailLogId);
  return `${base}/api/t/unsub/${mailLogId}?t=${token}`;
}

export function listUnsubscribeHeaders(
  mailLogId: number
): Record<string, string> | undefined {
  const url = unsubApiUrl(mailLogId);
  if (!url) return undefined;
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** Footer de baja si hay APP_BASE_URL (todos los orígenes). */
export function withUnsubscribeFooter(html: string, mailLogId: number): string {
  const url = unsubPageUrl(mailLogId);
  if (!url) return html;
  const footer = `<p style="margin-top:2em;padding-top:1em;border-top:1px solid #ddd;font-size:12px;color:#555">Municipalidad de Luján de Cuyo<br>Si no querés recibir más avisos de este sistema, <a href="${url}">darse de baja</a>.</p>`;
  return appendBeforeBody(html, footer);
}

/** Pie de baja para la parte de texto plano. */
export function withUnsubscribeFooterText(text: string, mailLogId: number): string {
  const url = unsubPageUrl(mailLogId);
  if (!url) return text;
  return `${text}\n\nSi no querés recibir más avisos de este sistema, podés darte de baja en:\n${url}`;
}

export function mapSesEventToEstado(eventType: string): string | null {
  switch (eventType) {
    case 'Delivery':
      return 'entregado';
    case 'Open':
      return 'abierto';
    case 'Bounce':
      return 'rebotado';
    case 'Complaint':
      return 'queja';
    case 'Reject':
      return 'rechazado';
    case 'Send':
      return 'enviado';
    default:
      return null;
  }
}

export function mapSesEventToNombre(eventType: string): string {
  switch (eventType) {
    case 'Delivery':
      return 'entrega';
    case 'Open':
      return 'apertura';
    case 'Bounce':
      return 'rebote';
    case 'Complaint':
      return 'queja';
    case 'Reject':
      return 'rechazo';
    case 'Click':
      return 'click';
    case 'Send':
      return 'envio_ses';
    case 'DeliveryDelay':
      return 'demora';
    case 'Rendering Failure':
      return 'fallo_render';
    default:
      return eventType.toLowerCase().slice(0, 30);
  }
}

/** No baja el estado (salvo rebotado/queja/rechazado que tienen prioridad alta). */
export function shouldUpdateEstado(current: string, next: string): boolean {
  const cur = ESTADO_RANK[current] ?? 0;
  const nxt = ESTADO_RANK[next] ?? 0;
  if (nxt >= 10) return true;
  if (cur >= 10) return false;
  return nxt > cur;
}
