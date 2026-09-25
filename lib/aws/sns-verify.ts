import { createVerify } from 'crypto';

export type SnsEnvelope = {
  Type?: string;
  MessageId?: string;
  Token?: string;
  TopicArn?: string;
  Subject?: string;
  Message?: string;
  SubscribeURL?: string;
  Timestamp?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
};

export type SnsVerifyResult = { ok: true } | { ok: false; reason: string };

export type CertFetcher = (url: string) => Promise<string>;

const NOTIFICATION_FIELDS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const;
const SUBSCRIPTION_FIELDS = [
  'Message',
  'MessageId',
  'SubscribeURL',
  'Timestamp',
  'Token',
  'TopicArn',
  'Type',
] as const;

/** Región del tópico: arn:aws:sns:<region>:<cuenta>:<nombre>. */
export function topicRegion(topicArn: string | undefined): string | null {
  const match = /^arn:aws(?:-[a-z]+)?:sns:([a-z0-9-]+):\d{12}:[\w-]+$/.exec(topicArn ?? '');
  return match?.[1] ?? null;
}

function snsHostFor(region: string): string {
  return `sns.${region}.amazonaws.com`;
}

/** URLs de SNS (certificado de firma y confirmación de suscripción) de la región del tópico. */
export function isSnsUrl(raw: string | undefined, region: string, pathSuffix?: string): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    if (url.hostname !== snsHostFor(region)) return false;
    if (url.username || url.password || url.port) return false;
    if (pathSuffix && !url.pathname.endsWith(pathSuffix)) return false;
    return true;
  } catch {
    return false;
  }
}

export function stringToSign(envelope: SnsEnvelope): string | null {
  const fields =
    envelope.Type === 'Notification'
      ? NOTIFICATION_FIELDS
      : envelope.Type === 'SubscriptionConfirmation' || envelope.Type === 'UnsubscribeConfirmation'
        ? SUBSCRIPTION_FIELDS
        : null;
  if (!fields) return null;

  let out = '';
  for (const key of fields) {
    const value = envelope[key];
    if (value === undefined) {
      if (key === 'Subject') continue;
      return null;
    }
    out += `${key}\n${value}\n`;
  }
  return out;
}

const certCache = new Map<string, string>();

const defaultFetcher: CertFetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`No se pudo descargar el certificado SNS (${res.status})`);
  return res.text();
};

async function getCert(url: string, fetcher: CertFetcher): Promise<string> {
  const cached = certCache.get(url);
  if (cached) return cached;
  const pem = await fetcher(url);
  if (!pem.includes('-----BEGIN')) throw new Error('Certificado SNS inválido');
  certCache.set(url, pem);
  return pem;
}

export function clearSnsCertCache(): void {
  certCache.clear();
}

/**
 * Verifica que el mensaje venga de SNS y del tópico permitido.
 * Ver https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 */
export async function verifySnsMessage(
  envelope: SnsEnvelope,
  allowedTopicArn: string | undefined,
  fetcher: CertFetcher = defaultFetcher
): Promise<SnsVerifyResult> {
  if (!allowedTopicArn) {
    return { ok: false, reason: 'SES_SNS_TOPIC_ARN no está configurado' };
  }
  if (envelope.TopicArn !== allowedTopicArn) {
    return { ok: false, reason: 'TopicArn no permitido' };
  }

  const region = topicRegion(envelope.TopicArn);
  if (!region) return { ok: false, reason: 'TopicArn inválido' };

  if (!isSnsUrl(envelope.SigningCertURL, region, '.pem')) {
    return { ok: false, reason: 'SigningCertURL no pertenece a SNS' };
  }

  const algorithm =
    envelope.SignatureVersion === '1'
      ? 'RSA-SHA1'
      : envelope.SignatureVersion === '2'
        ? 'RSA-SHA256'
        : null;
  if (!algorithm) return { ok: false, reason: 'SignatureVersion no soportada' };
  if (!envelope.Signature) return { ok: false, reason: 'Falta la firma' };

  const payload = stringToSign(envelope);
  if (!payload) return { ok: false, reason: 'Mensaje SNS incompleto' };

  let cert: string;
  try {
    cert = await getCert(envelope.SigningCertURL as string, fetcher);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Error de certificado' };
  }

  try {
    const verifier = createVerify(algorithm);
    verifier.update(payload, 'utf8');
    if (!verifier.verify(cert, envelope.Signature, 'base64')) {
      return { ok: false, reason: 'Firma inválida' };
    }
  } catch {
    return { ok: false, reason: 'Firma inválida' };
  }

  if (
    (envelope.Type === 'SubscriptionConfirmation' || envelope.Type === 'UnsubscribeConfirmation') &&
    !isSnsUrl(envelope.SubscribeURL, region)
  ) {
    return { ok: false, reason: 'SubscribeURL no pertenece a SNS' };
  }

  return { ok: true };
}
