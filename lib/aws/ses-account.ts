import {
  DeleteSuppressedDestinationCommand,
  GetAccountCommand,
  GetConfigurationSetCommand,
  GetEmailIdentityCommand,
  GetSuppressedDestinationCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';
import { config } from '@/lib/config';

const CACHE_MS = 5 * 60 * 1000;

let client: SESv2Client | null = null;

export function sesClient(): SESv2Client {
  client ??= new SESv2Client({ region: config().awsRegion });
  return client;
}

export function setSesClientForTests(c: SESv2Client | null): void {
  client = c;
  accountCache = null;
  domainCache = null;
}

/** Solo se habla con SES si es el proveedor configurado y hay región. */
export function sesAvailable(): boolean {
  const c = config();
  return (c.mailProvider === 'ses' || c.mailProvider === 'ses-api') && Boolean(c.awsRegion);
}

function errorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  const msg = err instanceof Error ? err.message : String(err);
  return name && !msg.startsWith(name) ? `${name}: ${msg}` : msg;
}

function isNotFound(err: unknown): boolean {
  return (err as { name?: string })?.name === 'NotFoundException';
}

export type SesAccountStatus = {
  productionAccess: boolean | null;
  sendingEnabled: boolean | null;
  maxSendRate: number | null;
  max24HourSend: number | null;
  sentLast24Hours: number | null;
  /** Motivos de la lista de supresión a nivel de cuenta (BOUNCE, COMPLAINT). */
  accountSuppressedReasons: string[];
  /** `null` si el configuration set no redefine la supresión (usa la de la cuenta). */
  configurationSetSuppressedReasons: string[] | null;
  /** Motivos que realmente aplican a los envíos de este servicio. */
  effectiveSuppressedReasons: string[];
  tlsPolicy: string | null;
  configurationSet: string | null;
  configurationSetError: string | null;
};

let accountCache: { at: number; value: SesAccountStatus } | null = null;

export async function getSesAccountStatus(now = Date.now()): Promise<SesAccountStatus> {
  if (accountCache && now - accountCache.at < CACHE_MS) return accountCache.value;

  const ses = sesClient();
  const account = await ses.send(new GetAccountCommand({}));
  const accountReasons = account.SuppressionAttributes?.SuppressedReasons ?? [];

  const configurationSet = config().sesConfigurationSet ?? null;
  let setReasons: string[] | null = null;
  let tlsPolicy: string | null = null;
  let configurationSetError: string | null = null;
  if (configurationSet) {
    try {
      const set = await ses.send(
        new GetConfigurationSetCommand({ ConfigurationSetName: configurationSet })
      );
      setReasons = set.SuppressionOptions ? set.SuppressionOptions.SuppressedReasons ?? [] : null;
      tlsPolicy = set.DeliveryOptions?.TlsPolicy ?? 'OPTIONAL';
    } catch (err) {
      configurationSetError = errorMessage(err);
    }
  }

  const value: SesAccountStatus = {
    productionAccess: account.ProductionAccessEnabled ?? null,
    sendingEnabled: account.SendingEnabled ?? null,
    maxSendRate: account.SendQuota?.MaxSendRate ?? null,
    max24HourSend: account.SendQuota?.Max24HourSend ?? null,
    sentLast24Hours: account.SendQuota?.SentLast24Hours ?? null,
    accountSuppressedReasons: accountReasons,
    configurationSetSuppressedReasons: setReasons,
    effectiveSuppressedReasons: setReasons ?? accountReasons,
    tlsPolicy,
    configurationSet,
    configurationSetError,
  };
  accountCache = { at: now, value };
  return value;
}

export type SesSuppressionEntry = { email: string; reason: string | null; since: Date | null };

export async function getSesSuppression(email: string): Promise<SesSuppressionEntry | null> {
  try {
    const res = await sesClient().send(
      new GetSuppressedDestinationCommand({ EmailAddress: email })
    );
    const d = res.SuppressedDestination;
    if (!d) return null;
    return {
      email: d.EmailAddress ?? email,
      reason: d.Reason ?? null,
      since: d.LastUpdateTime ?? null,
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export type SesRemovalResult =
  | { resultado: 'eliminada' | 'no_estaba' | 'no_aplica' }
  | { resultado: 'error'; detalle: string };

/**
 * Quita la dirección de la lista de supresión de la cuenta de SES. Sin esto, una
 * reactivación local no alcanza: SES descarta el envío y responde con un rebote
 * `OnAccountSuppressionList`, que vuelve a bloquear la dirección.
 */
export async function removeFromSesSuppression(email: string): Promise<SesRemovalResult> {
  if (!sesAvailable()) return { resultado: 'no_aplica' };
  try {
    await sesClient().send(new DeleteSuppressedDestinationCommand({ EmailAddress: email }));
    return { resultado: 'eliminada' };
  } catch (err) {
    if (isNotFound(err)) return { resultado: 'no_estaba' };
    return { resultado: 'error', detalle: errorMessage(err) };
  }
}

export type SesIdentityStatus = {
  identity: string;
  type: 'domain' | 'email';
  verifiedForSending: boolean;
  dkimStatus: string | null;
  dkimSigningEnabled: boolean | null;
  dkimKeyLength: string | null;
  dkimOrigin: string | null;
  mailFromDomain: string | null;
  mailFromStatus: string | null;
  mailFromBehaviorOnMxFailure: string | null;
};

export type SesDomainStatus = {
  fromEmail: string | null;
  identity: SesIdentityStatus | null;
  identityError: string | null;
  account: SesAccountStatus | null;
  accountError: string | null;
  problemas: string[];
  consultado: string;
};

let domainCache: { at: number; value: SesDomainStatus } | null = null;

async function getIdentity(name: string, type: 'domain' | 'email'): Promise<SesIdentityStatus> {
  const res = await sesClient().send(new GetEmailIdentityCommand({ EmailIdentity: name }));
  return {
    identity: name,
    type,
    verifiedForSending: Boolean(res.VerifiedForSendingStatus),
    dkimStatus: res.DkimAttributes?.Status ?? null,
    dkimSigningEnabled: res.DkimAttributes?.SigningEnabled ?? null,
    dkimKeyLength: res.DkimAttributes?.CurrentSigningKeyLength ?? null,
    dkimOrigin: res.DkimAttributes?.SigningAttributesOrigin ?? null,
    mailFromDomain: res.MailFromAttributes?.MailFromDomain ?? null,
    mailFromStatus: res.MailFromAttributes?.MailFromDomainStatus ?? null,
    mailFromBehaviorOnMxFailure: res.MailFromAttributes?.BehaviorOnMxFailure ?? null,
  };
}

/**
 * Estado de autenticación del dominio remitente y de la cuenta. Busca primero la
 * identidad de dominio y, si no existe, la de la dirección: una identidad solo de
 * dirección no permite DKIM propio ni MAIL FROM personalizado.
 */
export async function getSesDomainStatus(now = Date.now()): Promise<SesDomainStatus> {
  if (domainCache && now - domainCache.at < CACHE_MS) return domainCache.value;

  const fromEmail = config().mailFromEmail ?? null;
  const domain = fromEmail?.split('@')[1]?.toLowerCase() ?? null;
  const problemas: string[] = [];

  let identity: SesIdentityStatus | null = null;
  let identityError: string | null = null;
  if (!fromEmail || !domain) {
    identityError = 'MAIL_FROM_EMAIL no está configurado';
  } else {
    try {
      identity = await getIdentity(domain, 'domain');
    } catch (err) {
      if (!isNotFound(err)) {
        identityError = errorMessage(err);
      } else {
        try {
          identity = await getIdentity(fromEmail, 'email');
        } catch (err2) {
          identityError = isNotFound(err2)
            ? `Ni ${domain} ni ${fromEmail} están verificados en SES`
            : errorMessage(err2);
        }
      }
    }
  }

  if (identity) {
    if (identity.type === 'email') {
      problemas.push(
        `Solo está verificada la dirección ${identity.identity}: verificá el dominio ${domain} para tener DKIM propio y MAIL FROM.`
      );
    }
    if (!identity.verifiedForSending) problemas.push('La identidad no está habilitada para enviar.');
    if (identity.dkimStatus !== 'SUCCESS') {
      problemas.push(`DKIM no está listo (estado: ${identity.dkimStatus ?? 'sin configurar'}).`);
    }
    if (identity.type === 'domain' && identity.dkimKeyLength && identity.dkimKeyLength !== 'RSA_2048_BIT') {
      problemas.push(`La clave DKIM es ${identity.dkimKeyLength}; conviene RSA_2048_BIT.`);
    }
    if (identity.type === 'domain' && !identity.mailFromDomain) {
      problemas.push('No hay MAIL FROM personalizado: SPF no queda alineado con el dominio.');
    } else if (identity.mailFromDomain && identity.mailFromStatus !== 'SUCCESS') {
      problemas.push(`MAIL FROM ${identity.mailFromDomain} no está listo (estado: ${identity.mailFromStatus}).`);
    }
  } else if (identityError) {
    problemas.push(identityError);
  }

  let account: SesAccountStatus | null = null;
  let accountError: string | null = null;
  try {
    account = await getSesAccountStatus(now);
    if (account.productionAccess === false) {
      problemas.push('La cuenta de SES sigue en sandbox: solo puede enviar a direcciones verificadas.');
    }
    if (account.sendingEnabled === false) problemas.push('El envío está deshabilitado en la cuenta de SES.');
    if (account.configurationSetError) {
      problemas.push(`No se pudo leer el configuration set: ${account.configurationSetError}`);
    } else if (account.configurationSet && account.tlsPolicy !== 'REQUIRE') {
      problemas.push('El configuration set no exige TLS (TlsPolicy=REQUIRE).');
    } else if (!account.configurationSet) {
      problemas.push('SES_CONFIGURATION_SET no está configurado: no llegan eventos de rebote ni de queja.');
    }
  } catch (err) {
    accountError = errorMessage(err);
    problemas.push(`No se pudo consultar la cuenta: ${accountError}`);
  }

  const value: SesDomainStatus = {
    fromEmail,
    identity,
    identityError,
    account,
    accountError,
    problemas,
    consultado: new Date(now).toISOString(),
  };
  domainCache = { at: now, value };
  return value;
}
