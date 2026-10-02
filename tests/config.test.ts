import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '@/lib/config';

const strong = (c: string) => c.repeat(40);

function prodEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    ADMIN_TOKEN: strong('a'),
    UNSUBSCRIBE_HMAC_SECRET: strong('u'),
    INTERNAL_API_TOKEN: strong('i'),
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function issuesOf(env: NodeJS.ProcessEnv): string[] {
  try {
    parseConfig(env);
    return [];
  } catch (err) {
    if (err instanceof ConfigError) return err.issues;
    throw err;
  }
}

describe('parseConfig', () => {
  it('acepta una configuración de producción válida', () => {
    const cfg = parseConfig(prodEnv());
    expect(cfg.isProduction).toBe(true);
    expect(cfg.unsubscribeSecret).toBe(strong('u'));
    expect(cfg.mailSendMode).toBe('sync');
  });

  it('exige los secretos nuevos en producción', () => {
    const issues = issuesOf(prodEnv({ ADMIN_TOKEN: undefined, UNSUBSCRIBE_HMAC_SECRET: undefined }));
    expect(issues).toContain('ADMIN_TOKEN es obligatorio en producción');
    expect(issues).toContain('UNSUBSCRIBE_HMAC_SECRET es obligatorio en producción');
  });

  it('rechaza secretos cortos', () => {
    const issues = issuesOf(prodEnv({ ADMIN_TOKEN: 'corto' }));
    expect(issues.some((i) => i.startsWith('ADMIN_TOKEN debe tener al menos'))).toBe(true);
  });

  it('rechaza secretos repetidos', () => {
    const issues = issuesOf(prodEnv({ ADMIN_TOKEN: strong('u') }));
    expect(issues).toContain('UNSUBSCRIBE_HMAC_SECRET y ADMIN_TOKEN no pueden tener el mismo valor');
  });

  it('rechaza el token de ejemplo aunque sea el legacy', () => {
    const issues = issuesOf(prodEnv({ INTERNAL_API_TOKEN: 'mail_service_token_1234567890' }));
    expect(issues).toContain('INTERNAL_API_TOKEN usa un valor de ejemplo; generá uno nuevo');
  });

  it('exige GOOGLE_TOKEN_KEY si hay client id', () => {
    const issues = issuesOf(prodEnv({ GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com' }));
    expect(issues.some((i) => i.includes('GOOGLE_TOKEN_KEY'))).toBe(true);
  });

  it('exige la URL de la cola en modo queue', () => {
    const issues = issuesOf(prodEnv({ MAIL_SEND_MODE: 'queue', AWS_REGION: 'eu-central-1' }));
    expect(issues).toContain('MAIL_SEND_MODE=queue requiere SQS_SEND_QUEUE_URL');
  });

  it('fuera de producción genera un secreto temporal si falta', () => {
    const cfg = parseConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    expect(cfg.unsubscribeSecret).toHaveLength(64);
  });
});
