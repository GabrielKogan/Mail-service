import { GoogleOAuthError } from './oauth';

/**
 * API v1 vigente: https://gmailpostmastertools.googleapis.com/v1
 * `domains.trafficStats`. No hay endpoint público de Feedback Loop por Feedback-ID.
 */
const BASE = 'https://gmailpostmastertools.googleapis.com/v1';

export type TrafficStat = {
  name?: string;
  userReportedSpamRatio?: number;
  domainReputation?: string;
  ipReputations?: { reputation?: string; ipCount?: string; sampleIps?: string[] }[];
  spfSuccessRatio?: number;
  dkimSuccessRatio?: number;
  dmarcSuccessRatio?: number;
  inboundEncryptionRatio?: number;
  deliveryErrors?: { errorClass?: string; errorType?: string; errorRatio?: number }[];
};

export type DomainInfo = { name?: string; permission?: string; createTime?: string };

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new GoogleOAuthError(json.error?.message || `Postmaster HTTP ${res.status}`, 'http');
  }
  return json;
}

export async function listDomains(accessToken: string): Promise<DomainInfo[]> {
  const out: DomainInfo[] = [];
  let pageToken = '';
  for (let i = 0; i < 10; i++) {
    const q = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
    const page = await gmailGet<{ domains?: DomainInfo[]; nextPageToken?: string }>(
      accessToken,
      `/domains${q}`
    );
    out.push(...(page.domains ?? []));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return out;
}

/** `start` y `end` en YYYYMMDD (hora del Pacífico, como las da Google). */
export async function listTrafficStats(
  accessToken: string,
  domain: string,
  start: string,
  end: string
): Promise<TrafficStat[]> {
  const encoded = encodeURIComponent(domain);
  const out: TrafficStat[] = [];
  let pageToken = '';
  for (let i = 0; i < 20; i++) {
    const params = new URLSearchParams({
      'startDate.year': start.slice(0, 4),
      'startDate.month': String(Number(start.slice(4, 6))),
      'startDate.day': String(Number(start.slice(6, 8))),
      'endDate.year': end.slice(0, 4),
      'endDate.month': String(Number(end.slice(4, 6))),
      'endDate.day': String(Number(end.slice(6, 8))),
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await gmailGet<{ trafficStats?: TrafficStat[]; nextPageToken?: string }>(
      accessToken,
      `/domains/${encoded}/trafficStats?${params}`
    );
    out.push(...(page.trafficStats ?? []));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return out;
}

/** Extrae YYYY-MM-DD del name `domains/{d}/trafficStats/YYYYMMDD`. */
export function fechaDeStat(stat: TrafficStat): string | null {
  const m = (stat.name ?? '').match(/trafficStats\/(\d{8})$/);
  if (!m) return null;
  const raw = m[1];
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}
