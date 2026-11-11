function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (raw, n) => {
      const code = Number(n);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : raw;
    })
    .replace(/&#x([0-9a-f]+);/gi, (raw, h) => {
      const code = parseInt(h, 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : raw;
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/** HTML del cuerpo guardado, como texto legible: sin etiquetas, con saltos de línea. */
export function htmlATexto(html: string): string {
  const sinCabeza = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');

  const conEnlaces = sinCabeza.replace(
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, h1: string, h2: string, h3: string, inner: string) => {
      const href = (h1 || h2 || h3 || '').trim();
      const texto = inner.replace(/<[^>]+>/g, '').trim();
      if (!href || /^(javascript|data|vbscript):/i.test(href) || href === texto) return texto;
      return texto ? `${texto} (${href})` : href;
    }
  );

  const conCortes = conEnlaces
    .replace(/<img\b[^>]*alt\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi, (_m, a: string, b: string) =>
      a || b ? `${a || b} ` : ''
    )
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|tr|h[1-6]|li|table|blockquote|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decodeEntities(conCortes)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
