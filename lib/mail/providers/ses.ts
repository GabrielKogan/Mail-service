import { config } from '@/lib/config';
import { MailProviderError } from '../errors';
import { parseSmtpPort, sendViaSmtp } from '../smtp-send';
import type { MailMessage, MailProvider, MailSendResult } from '../types';

function unwrapEnv(value: string | undefined): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

function isPlaceholderSmtpCredential(user: string, pass: string): boolean {
  const blob = `${user} ${pass}`.toLowerCase();
  return (
    user.includes('...') ||
    /ses-smtp-test/.test(blob) ||
    /contraseña|changeme|your-smtp|smtp-de-ses|smtp_pass/.test(blob)
  );
}

/** SES SMTP username is the IAM Access Key ID, not the IAM user name. */
function isSesSmtpUsername(user: string): boolean {
  return /^(AKIA|ASIA)[A-Z0-9]{16}$/i.test(user);
}

/** Por SMTP, SES recibe el configuration set y las etiquetas como headers `X-SES-*`. */
function withSesHeaders(message: MailMessage): MailMessage {
  const headers: Record<string, string> = { ...message.headers };
  const tags = Object.entries(message.tags ?? {});
  if (tags.length) {
    headers['X-SES-MESSAGE-TAGS'] = tags.map(([k, v]) => `${k}=${v}`).join(', ');
  }
  const configSet = config().sesConfigurationSet;
  if (configSet) headers['X-SES-CONFIGURATION-SET'] = configSet;
  return { ...message, headers };
}

export class SesSmtpProvider implements MailProvider {
  async send(message: MailMessage): Promise<MailSendResult> {
    const region = unwrapEnv(process.env.AWS_REGION);
    const host =
      unwrapEnv(process.env.SMTP_HOST) ||
      (region ? `email-smtp.${region}.amazonaws.com` : '');
    const user = unwrapEnv(process.env.SMTP_USER);
    const pass = unwrapEnv(process.env.SMTP_PASS);

    if (!host) {
      throw new MailProviderError(
        'Falta AWS_REGION (o SMTP_HOST) para Amazon SES'
      );
    }
    if (!user || !pass) {
      throw new MailProviderError(
        'Faltan SMTP_USER o SMTP_PASS (credenciales SMTP de SES)'
      );
    }
    if (isPlaceholderSmtpCredential(user, pass)) {
      throw new MailProviderError(
        'SMTP_USER/SMTP_PASS del .env son placeholders. En SES → SMTP settings → Create SMTP credentials (misma región que AWS_REGION). SMTP_USER es el Access Key ID (AKIA...); SMTP_PASS es la contraseña SMTP. Reiniciá el servidor después de guardar.'
      );
    }
    if (!isSesSmtpUsername(user)) {
      throw new MailProviderError(
        `SMTP_USER debe ser el SMTP Username (Access Key ID que empieza con AKIA), no el nombre del usuario IAM "${user}". En IAM → Users → ese usuario → Security credentials copiá el Access Key ID. Reiniciá pnpm dev después de cambiar el .env.`
      );
    }

    try {
      return await sendViaSmtp(withSesHeaders(message), {
        host,
        user,
        pass,
        port: parseSmtpPort(process.env.SMTP_PORT),
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (/535|credentials invalid/i.test(raw)) {
        throw new MailProviderError(
          `SES rechazó el login SMTP (535). Revisá SMTP_USER/SMTP_PASS de la consola de SES, en la región ${region || 'configurada'}. El SMTP password no es el Secret Access Key de IAM.`
        );
      }
      throw err;
    }
  }
}
