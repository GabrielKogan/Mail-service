/**
 * Los filtros del buzón (antivirus, proxy de enlaces) piden el píxel al recibir
 * el mail. Eso no es una persona abriendo el mensaje.
 *
 * Gmail y Yahoo cargan la imagen recién cuando alguien lo abre, y lo hacen
 * con un proxy reconocible: esos sí cuentan, aunque sea al toque.
 */
export const OPEN_FILTER_WINDOW_MS = 15_000;

const TRUSTED_IMAGE_PROXY = [/GoogleImageProxy/i, /ggpht\.com/i, /YahooMailProxy/i];

const AUTOMATED_UA = [
  /barracuda/i,
  /proofpoint/i,
  /mimecast/i,
  /forefront/i,
  /symantec/i,
  /trend\s*micro/i,
  /fireeye/i,
  /phishtank/i,
  /headless/i,
  /phantomjs/i,
  /python-requests/i,
  /curl\//i,
  /wget\//i,
  /go-http-client/i,
  /java\/\d/i,
  /libwww/i,
  /okhttp/i,
  /axios\//i,
  /scrapy/i,
  /spider/i,
  /\bbot\b/i,
  /crawler/i,
  /SkypeUriPreview/i,
  /Microsoft Office Existence/i,
  /SafeLinks/i,
];

export function isTrustedImageProxy(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim() ?? '';
  return TRUSTED_IMAGE_PROXY.some((re) => re.test(ua));
}

export function isAutomatedUserAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim() ?? '';
  if (!ua) return true;
  return AUTOMATED_UA.some((re) => re.test(ua));
}

/**
 * `true` si este hit no debe pasar el mail a `abierto`.
 * `deliveredAt` es la entrega al buzón; si todavía no llegó, se usa `sentAt`.
 */
export function isLikelyPrefetch(opts: {
  userAgent?: string | null;
  openedAt: Date;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
}): boolean {
  if (isTrustedImageProxy(opts.userAgent)) return false;
  if (isAutomatedUserAgent(opts.userAgent)) return true;
  const anchor = opts.deliveredAt ?? opts.sentAt;
  if (!anchor) return false;
  return opts.openedAt.getTime() - anchor.getTime() < OPEN_FILTER_WINDOW_MS;
}
