import { createHmac, timingSafeEqual } from 'crypto';

const ESTADO_RANK: Record<string, number> = {
  error: 0,
  enviado: 1,
  entregado: 2,
  abierto: 3,
  rebotado: 10,
  queja: 10,
  rechazado: 10,
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
  return raw || null;
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

/** Inserta píxel de apertura si hay APP_BASE_URL. */
export function withOpenPixel(html: string, mailLogId: number): string {
  const url = openPixelUrl(mailLogId);
  if (!url) return html;
  const pixel = `<img src="${url}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${html}${pixel}`;
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
