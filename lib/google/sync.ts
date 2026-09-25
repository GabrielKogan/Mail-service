import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { isUniqueViolation } from '@/lib/mail/idempotency';
import { getMailProvider } from '@/lib/mail';
import { decryptSecret } from './crypto';
import { GoogleOAuthError, refreshAccessToken } from './oauth';
import { fechaDeStat, listDomains, listTrafficStats, type TrafficStat } from './postmaster-api';

const SPAM_ALERT = 0.003;
const AUTH_ALERT = 0.95;
const LOOKBACK_DAYS = 14;

let cachedAccess: { token: string; exp: number } | null = null;

export function resetGoogleAccessCache(): void {
  cachedAccess = null;
}

export type SyncResult = {
  ok: boolean;
  motivo?: string;
  dias: number;
  dominio?: string;
  alertas: string[];
};

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function dominioFromMail(email: string | undefined): string | null {
  const d = email?.split('@')[1]?.toLowerCase();
  return d || null;
}

function domainName(raw: string | undefined): string {
  return (raw ?? '').replace(/^domains\//, '');
}

async function accessToken(): Promise<string> {
  if (cachedAccess && cachedAccess.exp - 60_000 > Date.now()) return cachedAccess.token;
  const row = await prisma.mail_google_conexion.findFirst({ orderBy: { id: 'asc' } });
  if (!row || row.estado !== 'activa') throw new GoogleOAuthError('Sin conexión activa', 'config');
  const refreshed = await refreshAccessToken(decryptSecret(row.refreshTokenEnc));
  cachedAccess = { token: refreshed.accessToken, exp: Date.now() + refreshed.expiresIn * 1000 };
  return cachedAccess.token;
}

async function sendAlerta(asunto: string, texto: string): Promise<void> {
  const to = config().alertasEmail;
  if (!to) {
    console.warn('[postmaster] ALERTAS_EMAIL no está configurado; no se mandó:', asunto);
    return;
  }
  await getMailProvider().send({
    to,
    toName: '',
    subject: asunto.replace(/[\r\n]+/g, ' ').slice(0, 200),
    html: `<p>${texto.replace(/</g, '&lt;')}</p><p>Municipalidad de Luján de Cuyo · Mail Service</p>`,
    text: `${texto}\n\nMunicipalidad de Luján de Cuyo · Mail Service`,
  });
}

async function markExpired(detalle: string): Promise<void> {
  const row = await prisma.mail_google_conexion.findFirst({ orderBy: { id: 'asc' } });
  if (!row) return;
  const claimed = await prisma.mail_google_conexion.updateMany({
    where: { id: row.id, alertadoVencida: null },
    data: { estado: 'vencida', ultimoError: detalle.slice(0, 1000), alertadoVencida: new Date() },
  });
  await prisma.mail_google_conexion.updateMany({
    where: { id: row.id, alertadoVencida: { not: null } },
    data: { estado: 'vencida', ultimoError: detalle.slice(0, 1000) },
  });
  if (claimed.count > 0) {
    await sendAlerta(
      'Mail Service: se venció la conexión con Google Postmaster',
      `Google rechazó el token (${detalle}). Reconectá desde /sistemas.`
    ).catch((err) => console.error('[postmaster] no se pudo alertar el token vencido', err));
  }
}

function pickDomain(domains: { name?: string }[], prefer: string | null): string | null {
  if (!domains.length) return null;
  if (prefer) {
    const hit = domains.find((d) => domainName(d.name) === prefer);
    if (hit) return domainName(hit.name);
  }
  return domainName(domains[0].name) || null;
}

async function upsertDay(dominio: string, fecha: string, stat: TrafficStat): Promise<number> {
  const data = {
    spamRate: stat.userReportedSpamRatio ?? null,
    reputacionDominio: stat.domainReputation ?? null,
    spfOk: stat.spfSuccessRatio ?? null,
    dkimOk: stat.dkimSuccessRatio ?? null,
    dmarcOk: stat.dmarcSuccessRatio ?? null,
    tlsOk: stat.inboundEncryptionRatio ?? null,
    erroresEntrega: stat.deliveryErrors ? JSON.stringify(stat.deliveryErrors) : null,
    raw: JSON.stringify(stat),
  };
  const day = new Date(`${fecha}T00:00:00.000Z`);
  const existing = await prisma.mail_postmaster_diario.findFirst({
    where: { dominio, fecha: day },
    select: { id: true },
  });
  if (existing) {
    await prisma.mail_postmaster_diario.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  try {
    const created = await prisma.mail_postmaster_diario.create({
      data: { dominio, fecha: day, ...data },
    });
    return created.id;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await prisma.mail_postmaster_diario.findFirst({
      where: { dominio, fecha: day },
      select: { id: true },
    });
    if (!raced) throw err;
    await prisma.mail_postmaster_diario.update({ where: { id: raced.id }, data });
    return raced.id;
  }
}

async function maybeAlert(id: number, dominio: string, fecha: string, stat: TrafficStat, alertas: string[]) {
  const spam = stat.userReportedSpamRatio ?? 0;
  if (spam >= SPAM_ALERT) {
    const claimed = await prisma.mail_postmaster_diario.updateMany({
      where: { id, alertadoEn: null },
      data: { alertadoEn: new Date() },
    });
    if (claimed.count > 0) {
      const pct = (spam * 100).toFixed(2);
      alertas.push(`spam ${pct}%`);
      await sendAlerta(
        `Mail Service: tasa de spam ${pct}% en Gmail (${dominio})`,
        `El ${fecha} la tasa de spam reportada por usuarios en Gmail fue ${pct}% (umbral 0,3 %). Revisá /dashboard y Google Postmaster Tools.`
      );
    }
  }
  const rep = (stat.domainReputation ?? '').toUpperCase();
  if (rep === 'LOW' || rep === 'BAD') {
    const claimed = await prisma.mail_postmaster_diario.updateMany({
      where: { id, alertadoReputacion: null },
      data: { alertadoReputacion: new Date() },
    });
    if (claimed.count > 0) {
      alertas.push(`reputación ${rep}`);
      await sendAlerta(
        `Mail Service: reputación ${rep} en Gmail (${dominio})`,
        `El ${fecha} Google calificó el dominio como ${rep}.`
      );
    }
  }
  const dkim = stat.dkimSuccessRatio;
  const dmarc = stat.dmarcSuccessRatio;
  if ((dkim != null && dkim < AUTH_ALERT) || (dmarc != null && dmarc < AUTH_ALERT)) {
    const claimed = await prisma.mail_postmaster_diario.updateMany({
      where: { id, alertadoAuth: null },
      data: { alertadoAuth: new Date() },
    });
    if (claimed.count > 0) {
      alertas.push('DKIM/DMARC bajo');
      await sendAlerta(
        `Mail Service: DKIM o DMARC por debajo del 95% (${dominio})`,
        `El ${fecha} DKIM=${dkim ?? '—'} DMARC=${dmarc ?? '—'}.`
      );
    }
  }
}

async function alertSyncDown(): Promise<void> {
  const row = await prisma.mail_google_conexion.findFirst({ orderBy: { id: 'asc' } });
  if (!row || row.estado !== 'activa') return;
  const last = row.ultimaSync;
  if (last && Date.now() - last.getTime() < 24 * 60 * 60 * 1000) return;
  if (row.alertadoVencida && last && row.alertadoVencida > last) return;
  const claimed = await prisma.mail_google_conexion.updateMany({
    where: { id: row.id, estado: 'activa', alertadoVencida: last ? { lte: last } : null },
    data: { alertadoVencida: new Date(), ultimoError: 'Sin sincronizar hace más de 24 h' },
  });
  if (claimed.count > 0) {
    await sendAlerta(
      'Mail Service: Postmaster sin sincronizar hace más de 24 h',
      'El worker o /sistemas → Sincronizar ahora no pudieron actualizar las métricas de Gmail.'
    ).catch((err) => console.error('[postmaster] alerta de sync caída', err));
  }
}

export async function syncPostmaster(): Promise<SyncResult> {
  const row = await prisma.mail_google_conexion.findFirst({ orderBy: { id: 'asc' } });
  if (!row) return { ok: false, motivo: 'Sin conexión con Google', dias: 0, alertas: [] };
  if (row.estado === 'vencida') {
    return { ok: false, motivo: 'La conexión con Google está vencida', dias: 0, alertas: [] };
  }

  let token: string;
  try {
    token = await accessToken();
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.code === 'invalid_grant') {
      await markExpired(err.message);
      return { ok: false, motivo: 'Token de Google vencido o revocado', dias: 0, alertas: ['token_vencido'] };
    }
    const detalle = err instanceof Error ? err.message : String(err);
    await prisma.mail_google_conexion.update({
      where: { id: row.id },
      data: { ultimoError: detalle.slice(0, 1000) },
    });
    await alertSyncDown();
    return { ok: false, motivo: detalle, dias: 0, alertas: [] };
  }

  try {
    const prefer = dominioFromMail(config().mailFromEmail);
    const domains = await listDomains(token);
    const dominio = pickDomain(domains, prefer);
    if (!dominio) {
      await prisma.mail_google_conexion.update({
        where: { id: row.id },
        data: {
          ultimaSync: new Date(),
          ultimoError: 'La cuenta no tiene dominios verificados en Postmaster Tools',
        },
      });
      return { ok: false, motivo: 'Sin dominios verificados en Postmaster Tools', dias: 0, alertas: [] };
    }

    const end = new Date();
    const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const stats = await listTrafficStats(token, dominio, ymd(start), ymd(end));
    const alertas: string[] = [];
    let dias = 0;
    for (const stat of stats) {
      const fecha = fechaDeStat(stat);
      if (!fecha) continue;
      const id = await upsertDay(dominio, fecha, stat);
      await maybeAlert(id, dominio, fecha, stat, alertas);
      dias++;
    }
    await prisma.mail_google_conexion.update({
      where: { id: row.id },
      data: { ultimaSync: new Date(), ultimoError: null, alertadoVencida: null },
    });
    return { ok: true, dias, dominio, alertas };
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.code === 'invalid_grant') {
      await markExpired(err.message);
      return { ok: false, motivo: 'Token de Google vencido o revocado', dias: 0, alertas: ['token_vencido'] };
    }
    const detalle = err instanceof Error ? err.message : String(err);
    await prisma.mail_google_conexion.update({
      where: { id: row.id },
      data: { ultimoError: detalle.slice(0, 1000) },
    });
    await alertSyncDown();
    return { ok: false, motivo: detalle, dias: 0, alertas: [] };
  }
}

export async function googleConnectionStatus() {
  const row = await prisma.mail_google_conexion.findFirst({ orderBy: { id: 'asc' } });
  if (!row) return { conectado: false as const };
  return {
    conectado: true as const,
    email: row.email,
    estado: row.estado,
    ultimaSync: row.ultimaSync,
    ultimoError: row.ultimoError,
    conectadoEn: row.conectadoEn,
  };
}
