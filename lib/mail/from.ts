import { config } from '@/lib/config';

const DEFAULT_FROM_EMAIL = 'no-reply@lujandecuyo.gob.ar';
const DEFAULT_FROM_NAME = 'Municipalidad de Lujan de Cuyo';

export type MailIdentity = { email: string; name: string };

export type MailFromResult =
  | { ok: true; identity: MailIdentity }
  | { ok: false; error: string; detalle: string };

export function getMailFrom(): MailIdentity {
  const cfg = config();
  return {
    email: cfg.mailFromEmail || DEFAULT_FROM_EMAIL,
    name: cfg.mailFromName || DEFAULT_FROM_NAME,
  };
}

function dominioDe(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  if (email.indexOf('@') !== at) return null;
  return email.slice(at + 1).toLowerCase();
}

/** Parte local de un buzón del dominio verificado: `turnos`, no `turnos@otro.com`. Acepta `_` porque el origen del sistema puede traerlo. */
function localValido(local: string): boolean {
  if (local.length < 1 || local.length > 64) return false;
  if (!/^[a-z0-9][a-z0-9._+\-]*$/.test(local)) return false;
  if (local.endsWith('.') || local.includes('..')) return false;
  return true;
}

function nombreVisibleValido(name: string): boolean {
  return name.length > 0 && name.length <= 120 && !/[\u0000-\u001f<>"\\]/.test(name);
}

/**
 * Buzón del sistema: el campo `origen`. El nombre visible es el del sistema.
 * `origen: turnos`, `nombre: Turnos` → `turnos` y `Turnos`.
 * Null si el origen no es un buzón válido: el envío sigue con el remitente configurado.
 */
export function remitenteDeSistema(sistema: {
  origen: string;
  nombre?: string | null;
}): { desde: string; nombre: string } | null {
  const desde = sistema.origen.trim().toLowerCase();
  if (!localValido(desde)) return null;
  const nombre = (sistema.nombre ?? '').trim();
  return { desde, nombre: nombreVisibleValido(nombre) ? nombre : desde };
}

/**
 * Lo que pidió el cliente, o el origen del sistema si no pidió buzón ni nombre.
 * Un `desde` o un `nombre` explícito no se reemplazan.
 */
export function remitentePorDefecto(input: {
  desde?: string;
  nombre?: string;
  sistema?: { origen: string; nombre?: string | null } | null;
}): { desde?: string; nombre?: string } {
  if (input.desde?.trim() || input.nombre?.trim()) {
    return { desde: input.desde, nombre: input.nombre };
  }
  if (!input.sistema) return {};
  const propio = remitenteDeSistema(input.sistema);
  return propio ? { desde: propio.desde, nombre: propio.nombre } : {};
}

/**
 * Elige el buzón y el nombre visible de un envío.
 * `desde` es `turnos` o `turnos@dominio`. El dominio tiene que ser el de `MAIL_FROM_EMAIL`.
 * `nombre` reemplaza el nombre visible (`MAIL_FROM_NAME` si no se manda).
 */
export function resolveMailFrom(input: { desde?: string; nombre?: string } = {}): MailFromResult {
  const base = getMailFrom();
  const domain = dominioDe(base.email);
  if (!domain) {
    return {
      ok: false,
      error: 'Remitente no configurado',
      detalle: 'MAIL_FROM_EMAIL no es una dirección válida.',
    };
  }

  let email = base.email;
  const rawDesde = input.desde?.trim() ?? '';
  if (rawDesde) {
    if (/[\r\n]/.test(rawDesde)) {
      return {
        ok: false,
        error: 'Remitente inválido',
        detalle: 'El buzón no puede tener saltos de línea.',
      };
    }
    const candidate = rawDesde.toLowerCase();
    const full = candidate.includes('@') ? candidate : `${candidate}@${domain}`;
    const local = full.slice(0, full.lastIndexOf('@'));
    const host = dominioDe(full);
    if (host !== domain || !localValido(local)) {
      return {
        ok: false,
        error: 'Remitente inválido',
        detalle: `Usá un buzón de ${domain}, por ejemplo turnos o turnos@${domain}.`,
      };
    }
    email = `${local}@${domain}`;
  }

  let name = base.name;
  const rawNombre = input.nombre?.trim() ?? '';
  if (rawNombre) {
    if (!nombreVisibleValido(rawNombre)) {
      return {
        ok: false,
        error: 'Nombre de remitente inválido',
        detalle: 'El nombre visible no puede tener saltos de línea ni los caracteres < > " \\.',
      };
    }
    name = rawNombre;
  }

  return { ok: true, identity: { email, name } };
}

/** Texto que se guarda en `mail_log.remitente` para que el worker use el mismo From. */
export function formatRemitente(identity: MailIdentity): string {
  const base = getMailFrom();
  const mismoMail = identity.email.toLowerCase() === base.email.toLowerCase();
  const mismoNombre = identity.name === base.name;
  if (mismoMail && mismoNombre) return base.email;
  return `"${identity.name}" <${identity.email.toLowerCase()}>`;
}

const REMITENTE_QUOTED = /^"([^"]*)"\s*<([^>\s]+)>$/;
const REMITENTE_EMAIL = /^[^\s<>"]+@[^\s<>"]+$/;

/** Recupera el From guardado. Un mail viejo (solo la dirección) usa el nombre configurado. */
export function parseRemitente(stored: string | null | undefined): MailIdentity {
  const base = getMailFrom();
  const raw = (stored ?? '').trim();
  const quoted = REMITENTE_QUOTED.exec(raw);
  if (quoted && nombreVisibleValido(quoted[1]) && REMITENTE_EMAIL.test(quoted[2])) {
    return { name: quoted[1], email: quoted[2].toLowerCase() };
  }
  if (REMITENTE_EMAIL.test(raw)) {
    return { email: raw.toLowerCase(), name: base.name };
  }
  return { email: base.email, name: base.name };
}

/** Campos que entran al hash de idempotencia solo cuando el remitente no es el de siempre. */
export function remitenteEnHash(identity: MailIdentity): { desde?: string; nombreRemitente?: string } {
  const base = getMailFrom();
  const out: { desde?: string; nombreRemitente?: string } = {};
  if (identity.email.toLowerCase() !== base.email.toLowerCase()) out.desde = identity.email.toLowerCase();
  if (identity.name !== base.name) out.nombreRemitente = identity.name;
  return out;
}
