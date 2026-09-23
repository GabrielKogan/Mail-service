import { createHmac, timingSafeEqual } from 'crypto';

const ESTADO_RANK: Record<string, number> = {
  error: 0,
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
  return (
    process.env.TRACKING_SECRET?.trim() ||
    process.env.INTERNAL_API_TOKEN?.trim() ||
    'mail-service-dev-tracking'
  );
}

export function appBaseUrl(): string | null {
  const raw = process.env.APP_BASE_URL?.trim().replace(/\/$/, '');
  if (raw) return raw;
  // En desarrollo, si no hay URL pública, usamos localhost para poder probar
  // el píxel en la misma PC. Gmail en otro dispositivo no llega a localhost.
  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT?.trim() || '3000';
    return `http://localhost:${port}`;
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
  return createHmac('sha256', trackingSecret())
    .update(`open:${mailLogId}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyOpenToken(mailLogId: number, token: string): boolean {
  const expected = signOpenToken(mailLogId);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
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
  return createHmac('sha256', trackingSecret())
    .update(`unsub:${mailLogId}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyUnsubToken(mailLogId: number, token: string): boolean {
  const expected = signUnsubToken(mailLogId);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
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
