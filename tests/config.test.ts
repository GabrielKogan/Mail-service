import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '@/lib/config';

const strong = (c: string) => c.repeat(40);

function prodEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    AWS_REGION: 'eu-central-1',
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
    expect(cfg.mailProvider).toBe('ses-api');
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

  it('acepta Fráncfort como principal e Irlanda como respaldo', () => {
    const cfg = parseConfig(
      prodEnv({
        AWS_REGION: 'eu-central-1',
        AWS_REGION_SECONDARY: 'eu-west-1',
        MAIL_PROVIDER: 'ses-api',
        SES_ENDPOINT_ID: 'abcd12.g3h',
        MAIL_SEND_MODE: 'queue',
        SES_SNS_TOPIC_ARN: 'arn:aws:sns:eu-central-1:123456789012:mail-events',
        SES_SNS_TOPIC_ARN_SECONDARY: 'arn:aws:sns:eu-west-1:123456789012:mail-events',
        SQS_SEND_QUEUE_URL: 'https://sqs.eu-central-1.amazonaws.com/123456789012/mail-send',
        SQS_SEND_QUEUE_URL_SECONDARY: 'https://sqs.eu-west-1.amazonaws.com/123456789012/mail-send',
        SQS_EVENTS_QUEUE_URL: 'https://sqs.eu-central-1.amazonaws.com/123456789012/mail-events',
        SQS_EVENTS_QUEUE_URL_SECONDARY: 'https://sqs.eu-west-1.amazonaws.com/123456789012/mail-events',
      })
    );
    expect(cfg.sesEndpointId).toBe('abcd12.g3h');
    expect(cfg.sesSnsTopicArns).toEqual([
      'arn:aws:sns:eu-central-1:123456789012:mail-events',
      'arn:aws:sns:eu-west-1:123456789012:mail-events',
    ]);
  });

  it('rechaza una cola en una región distinta de la declarada', () => {
    const issues = issuesOf(
      prodEnv({
        AWS_REGION: 'eu-central-1',
        MAIL_SEND_MODE: 'queue',
        SQS_SEND_QUEUE_URL: 'https://sqs.eu-west-1.amazonaws.com/123456789012/mail-send',
      })
    );
    expect(issues.some((i) => i.includes('eu-west-1') && i.includes('eu-central-1'))).toBe(true);
  });

  it('exige el tópico de respaldo si hay cola de eventos secundaria', () => {
    const issues = issuesOf(
      prodEnv({
        AWS_REGION: 'eu-central-1',
        AWS_REGION_SECONDARY: 'eu-west-1',
        SQS_EVENTS_QUEUE_URL_SECONDARY: 'https://sqs.eu-west-1.amazonaws.com/123456789012/mail-events',
      })
    );
    expect(issues).toContain('SQS_EVENTS_QUEUE_URL_SECONDARY requiere SES_SNS_TOPIC_ARN_SECONDARY');
  });

  it('rechaza SES_ENDPOINT_ID si el envío no es por la API', () => {
    const issues = issuesOf(
      prodEnv({ AWS_REGION: 'eu-central-1', MAIL_PROVIDER: 'ses', SES_ENDPOINT_ID: 'abcd12.g3h' })
    );
    expect(issues).toContain('SES_ENDPOINT_ID requiere MAIL_PROVIDER=ses-api');
  });

  it('fuera de producción genera un secreto temporal si falta', () => {
    const cfg = parseConfig({ NODE_ENV: 'test', AWS_REGION: 'eu-central-1' } as NodeJS.ProcessEnv);
    expect(cfg.unsubscribeSecret).toHaveLength(64);
  });
});
