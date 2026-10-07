/** Scopes vigentes de Postmaster Tools (el viejo `postmaster.readonly` ya no figura). */
export const GOOGLE_SCOPE_LIST = [
  'https://www.googleapis.com/auth/postmaster.domain',
  'https://www.googleapis.com/auth/postmaster.traffic.readonly',
  'openid',
  'email',
] as const;

export const GOOGLE_SCOPES = GOOGLE_SCOPE_LIST.join(' ');

export const MENSAJE_SCOPE_POSTMASTER =
  'Google no dio el permiso de Postmaster. En Cloud Console, en la pantalla de consentimiento, agregá los scopes postmaster.domain y postmaster.traffic.readonly. Después desconectá la cuenta y volvé a conectar.';

export function tieneScopePostmaster(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).some(
    (s) =>
      s === 'https://www.googleapis.com/auth/postmaster' ||
      s.startsWith('https://www.googleapis.com/auth/postmaster.')
  );
}

export function esErrorScopePostmaster(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return /insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT|permiso de Postmaster/i.test(
    texto
  );
}

/** Traduce el 403 de Google. El resto de los textos se deja igual. */
export function mensajeErrorPostmaster(texto: string): string {
  return esErrorScopePostmaster(texto) ? MENSAJE_SCOPE_POSTMASTER : texto;
}
