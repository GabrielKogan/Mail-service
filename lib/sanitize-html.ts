const BLOCKED_TAGS = /<(script|iframe|object|embed|svg|math|style|link|meta|base|form|button|input|textarea)[\s\S]*?(?:>|$)|<\/(script|iframe|object|embed|svg|math|style|link|meta|base|form|button|input|textarea)>/gi;

export function sanitizeHtml(input: string): string {
  if (!input) return '';

  let safe = String(input)
    .replace(BLOCKED_TAGS, '')
    .replace(/\s+on[a-zA-Z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*(?:"\s*(?:javascript|vbscript):[^\"]*"|'\s*(?:javascript|vbscript):[^']*'|(?:javascript|vbscript):[^\s>]+)/gi, '')
    .replace(/src\s*=\s*(?:"\s*(?:javascript|vbscript):[^\"]*"|'\s*(?:javascript|vbscript):[^']*'|(?:javascript|vbscript):[^\s>]+)/gi, '');

  safe = safe.replace(/<\s*(?:script|iframe|object|embed|svg|math|style|link|meta|base|form|button|input|textarea)\b[^>]*>/gi, '');
  safe = safe.replace(/<\s*\/\s*(?:script|iframe|object|embed|svg|math|style|link|meta|base|form|button|input|textarea)\s*>/gi, '');

  return safe;
}
