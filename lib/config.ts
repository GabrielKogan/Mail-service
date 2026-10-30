import { randomBytes } from 'crypto';
import { z } from 'zod';
import { topicRegion } from '@/lib/aws/sns-verify';
import { regionFromQueueUrl } from '@/lib/aws/queue-url';

const MIN_SECRET_LENGTH = 32;

/** Valores que aparecieron en ejemplos o documentación: nunca válidos en producción. */
const KNOWN_EXAMPLE_SECRETS = new Set([
  'mail_service_token_1234567890',
  'mail-service-dev-tracking',
  'changeme',
]);

const optionalString = z
  .string()
  .optional()
  .transform((v) => {
    const trimmed = v?.trim().replace(/^['"]|['"]$/g, '');
    return trimmed ? trimmed : undefined;
  });

const booleanFlag = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const raw = v?.trim().toLowerCase();
      if (!raw) return defaultValue;
      return raw === 'true' || raw === '1' || raw === 'yes';
    });

const positiveInt = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return defaultValue;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Debe ser un número positivo' });
        return z.NEVER;
      }
      return n;
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: optionalString,

  MAIL_PROVIDER: z
    .string()
    .optional()
    .transform((v) => (v?.trim().toLowerCase() || 'ses-api'))
    .pipe(z.enum(['ses', 'ses-api', 'brevo', 'smtp'])),
  MAIL_FROM_EMAIL: optionalString,
  MAIL_FROM_NAME: optionalString,
  AWS_REGION: optionalString,
  AWS_REGION_SECONDARY: optionalString,
  APP_BASE_URL: optionalString,
  PORT: optionalString,

  INTERNAL_API_TOKEN: optionalString,
  LEGACY_TOKEN_ENABLED: booleanFlag(true),
  DASHBOARD_LEGACY_TOKEN: booleanFlag(false),
  ADMIN_TOKEN: optionalString,
  UNSUBSCRIBE_HMAC_SECRET: optionalString,
  UNSUBSCRIBE_HMAC_SECRET_PREVIOUS: optionalString,

  SES_CONFIGURATION_SET: optionalString,
  SES_ENDPOINT_ID: optionalString,
  SES_SNS_TOPIC_ARN: optionalString,
  SES_SNS_TOPIC_ARN_SECONDARY: optionalString,
  SES_MAX_SEND_RATE: positiveInt(10),
  SES_WEBHOOK_ENABLED: booleanFlag(true),

  MAIL_SEND_MODE: z
    .string()
    .optional()
    .transform((v) => (v?.trim().toLowerCase() || 'sync'))
    .pipe(z.enum(['sync', 'queue'])),
  SQS_SEND_QUEUE_URL: optionalString,
  SQS_SEND_QUEUE_URL_SECONDARY: optionalString,
  SQS_SEND_DLQ_URL: optionalString,
  SQS_SEND_DLQ_URL_SECONDARY: optionalString,
  SQS_EVENTS_QUEUE_URL: optionalString,
  SQS_EVENTS_QUEUE_URL_SECONDARY: optionalString,
  WORKER_CONCURRENCY: positiveInt(5),
  WORKER_NAME: optionalString,

  CORS_ORIGINS: optionalString,
  MAIL_ORIGENES_CRITICOS: z.string().optional(),

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_TOKEN_KEY: optionalString,
  ALERTAS_EMAIL: optionalString,
});

export type AppConfig = {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  databaseUrl?: string;
  mailProvider: 'ses' | 'ses-api' | 'brevo' | 'smtp';
  mailFromEmail?: string;
  mailFromName?: string;
  awsRegion?: string;
  awsRegionSecondary?: string;
  appBaseUrl?: string;
  port?: string;
  internalApiToken?: string;
  legacyTokenEnabled: boolean;
  dashboardLegacyToken: boolean;
  adminToken?: string;
  unsubscribeSecret: string;
  unsubscribeSecretPrevious?: string;
  sesConfigurationSet?: string;
  /** Id del global endpoint de SES. El envío por API se reparte entre las dos regiones. */
  sesEndpointId?: string;
  sesSnsTopicArn?: string;
  sesSnsTopicArnSecondary?: string;
  /** Tópicos SNS aceptados (principal y, si existe, el de respaldo). */
  sesSnsTopicArns: string[];
  sesMaxSendRate: number;
  sesWebhookEnabled: boolean;
  mailSendMode: 'sync' | 'queue';
  sqsSendQueueUrl?: string;
  sqsSendQueueUrlSecondary?: string;
  sqsSendDlqUrl?: string;
  sqsSendDlqUrlSecondary?: string;
  sqsEventsQueueUrl?: string;
  sqsEventsQueueUrlSecondary?: string;
  workerConcurrency: number;
  workerName?: string;
  corsOrigins?: string;
  /** `undefined` = variable ausente (se aplica el default); `''` = ninguno crítico. */
  mailOrigenesCriticos?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleTokenKey?: string;
  alertasEmail?: string;
};

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Configuración inválida:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

function validateSecrets(env: z.infer<typeof envSchema>, issues: string[]): void {
  const secrets: Array<[string, string | undefined, boolean]> = [
    ['UNSUBSCRIBE_HMAC_SECRET', env.UNSUBSCRIBE_HMAC_SECRET, true],
    ['ADMIN_TOKEN', env.ADMIN_TOKEN, true],
    ['INTERNAL_API_TOKEN', env.LEGACY_TOKEN_ENABLED ? env.INTERNAL_API_TOKEN : undefined, false],
    ['GOOGLE_TOKEN_KEY', env.GOOGLE_CLIENT_ID ? env.GOOGLE_TOKEN_KEY : undefined, Boolean(env.GOOGLE_CLIENT_ID)],
    ['GOOGLE_CLIENT_SECRET', env.GOOGLE_CLIENT_ID ? env.GOOGLE_CLIENT_SECRET : undefined, Boolean(env.GOOGLE_CLIENT_ID)],
  ];

  for (const [name, value, required] of secrets) {
    if (!value) {
      if (required) issues.push(`${name} es obligatorio en producción`);
      continue;
    }
    if (KNOWN_EXAMPLE_SECRETS.has(value)) {
      issues.push(`${name} usa un valor de ejemplo; generá uno nuevo`);
    }
    if (required && value.length < MIN_SECRET_LENGTH) {
      issues.push(`${name} debe tener al menos ${MIN_SECRET_LENGTH} caracteres`);
    }
  }

  const present = secrets.filter(([, v]) => Boolean(v)) as Array<[string, string, boolean]>;
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      if (present[i][1] === present[j][1]) {
        issues.push(`${present[i][0]} y ${present[j][0]} no pueden tener el mismo valor`);
      }
    }
  }

  if (
    env.UNSUBSCRIBE_HMAC_SECRET_PREVIOUS &&
    env.UNSUBSCRIBE_HMAC_SECRET_PREVIOUS === env.UNSUBSCRIBE_HMAC_SECRET
  ) {
    issues.push('UNSUBSCRIBE_HMAC_SECRET_PREVIOUS no puede ser igual a UNSUBSCRIBE_HMAC_SECRET');
  }
}

function checkQueueRegion(
  issues: string[],
  name: string,
  url: string | undefined,
  region: string | undefined,
  regionVar: string
): void {
  if (!url) return;
  if (!region) {
    issues.push(`${name} requiere ${regionVar}`);
    return;
  }
  const actual = regionFromQueueUrl(url);
  if (!actual) {
    issues.push(`${name} no es una URL de SQS válida`);
    return;
  }
  if (actual !== region) {
    issues.push(`${name} está en ${actual}; tiene que estar en ${region}`);
  }
}

function checkTopicRegion(
  issues: string[],
  name: string,
  arn: string | undefined,
  region: string | undefined,
  regionVar: string
): void {
  if (!arn) return;
  if (!region) {
    issues.push(`${name} requiere ${regionVar}`);
    return;
  }
  const actual = topicRegion(arn);
  if (!actual) {
    issues.push(`${name} no es un ARN de SNS válido`);
    return;
  }
  if (actual !== region) {
    issues.push(`${name} está en ${actual}; tiene que estar en ${region}`);
  }
}

function validateQueue(env: z.infer<typeof envSchema>, issues: string[]): void {
  const usesSqs = Boolean(
    env.SQS_SEND_QUEUE_URL ||
      env.SQS_SEND_QUEUE_URL_SECONDARY ||
      env.SQS_EVENTS_QUEUE_URL ||
      env.SQS_EVENTS_QUEUE_URL_SECONDARY
  );
  if (env.MAIL_SEND_MODE === 'queue' && !env.SQS_SEND_QUEUE_URL) {
    issues.push('MAIL_SEND_MODE=queue requiere SQS_SEND_QUEUE_URL');
  }
  if ((usesSqs || env.MAIL_PROVIDER === 'ses-api' || env.SES_ENDPOINT_ID) && !env.AWS_REGION) {
    issues.push('AWS_REGION es obligatorio para usar SQS o MAIL_PROVIDER=ses-api');
  }
  if (env.AWS_REGION && env.AWS_REGION_SECONDARY && env.AWS_REGION === env.AWS_REGION_SECONDARY) {
    issues.push('AWS_REGION_SECONDARY tiene que ser distinta de AWS_REGION');
  }
  if (env.SES_ENDPOINT_ID && env.MAIL_PROVIDER !== 'ses-api') {
    issues.push('SES_ENDPOINT_ID requiere MAIL_PROVIDER=ses-api');
  }
  if (env.SQS_SEND_QUEUE_URL_SECONDARY && !env.SQS_SEND_QUEUE_URL) {
    issues.push('SQS_SEND_QUEUE_URL_SECONDARY requiere SQS_SEND_QUEUE_URL');
  }
  if (env.SQS_SEND_DLQ_URL_SECONDARY && !env.SQS_SEND_QUEUE_URL_SECONDARY) {
    issues.push('SQS_SEND_DLQ_URL_SECONDARY requiere SQS_SEND_QUEUE_URL_SECONDARY');
  }
  if (env.SQS_EVENTS_QUEUE_URL_SECONDARY && !env.SES_SNS_TOPIC_ARN_SECONDARY) {
    issues.push('SQS_EVENTS_QUEUE_URL_SECONDARY requiere SES_SNS_TOPIC_ARN_SECONDARY');
  }

  checkQueueRegion(issues, 'SQS_SEND_QUEUE_URL', env.SQS_SEND_QUEUE_URL, env.AWS_REGION, 'AWS_REGION');
  checkQueueRegion(issues, 'SQS_SEND_DLQ_URL', env.SQS_SEND_DLQ_URL, env.AWS_REGION, 'AWS_REGION');
  checkQueueRegion(issues, 'SQS_EVENTS_QUEUE_URL', env.SQS_EVENTS_QUEUE_URL, env.AWS_REGION, 'AWS_REGION');
  checkTopicRegion(issues, 'SES_SNS_TOPIC_ARN', env.SES_SNS_TOPIC_ARN, env.AWS_REGION, 'AWS_REGION');

  checkQueueRegion(
    issues,
    'SQS_SEND_QUEUE_URL_SECONDARY',
    env.SQS_SEND_QUEUE_URL_SECONDARY,
    env.AWS_REGION_SECONDARY,
    'AWS_REGION_SECONDARY'
  );
  checkQueueRegion(
    issues,
    'SQS_SEND_DLQ_URL_SECONDARY',
    env.SQS_SEND_DLQ_URL_SECONDARY,
    env.AWS_REGION_SECONDARY,
    'AWS_REGION_SECONDARY'
  );
  checkQueueRegion(
    issues,
    'SQS_EVENTS_QUEUE_URL_SECONDARY',
    env.SQS_EVENTS_QUEUE_URL_SECONDARY,
    env.AWS_REGION_SECONDARY,
    'AWS_REGION_SECONDARY'
  );
  checkTopicRegion(
    issues,
    'SES_SNS_TOPIC_ARN_SECONDARY',
    env.SES_SNS_TOPIC_ARN_SECONDARY,
    env.AWS_REGION_SECONDARY,
    'AWS_REGION_SECONDARY'
  );
}

let devUnsubscribeSecret: string | null = null;

export function parseConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    );
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  const issues: string[] = [];

  if (isProduction) validateSecrets(env, issues);
  validateQueue(env, issues);

  if (issues.length) throw new ConfigError(issues);

  let unsubscribeSecret = env.UNSUBSCRIBE_HMAC_SECRET;
  if (!unsubscribeSecret) {
    // Solo fuera de producción (en producción es obligatorio): secreto efímero
    // por proceso, los links de baja dejan de validar al reiniciar.
    devUnsubscribeSecret ??= randomBytes(32).toString('hex');
    unsubscribeSecret = devUnsubscribeSecret;
    if (env.NODE_ENV === 'development') {
      console.warn(
        '[config] UNSUBSCRIBE_HMAC_SECRET no está definido: se usa un secreto temporal.'
      );
    }
  }

  return {
    nodeEnv: env.NODE_ENV,
    isProduction,
    databaseUrl: env.DATABASE_URL,
    mailProvider: env.MAIL_PROVIDER,
    mailFromEmail: env.MAIL_FROM_EMAIL,
    mailFromName: env.MAIL_FROM_NAME,
    awsRegion: env.AWS_REGION,
    awsRegionSecondary: env.AWS_REGION_SECONDARY,
    appBaseUrl: env.APP_BASE_URL?.replace(/\/$/, ''),
    port: env.PORT,
    internalApiToken: env.INTERNAL_API_TOKEN,
    legacyTokenEnabled: env.LEGACY_TOKEN_ENABLED,
    dashboardLegacyToken: env.DASHBOARD_LEGACY_TOKEN,
    adminToken: env.ADMIN_TOKEN,
    unsubscribeSecret,
    unsubscribeSecretPrevious: env.UNSUBSCRIBE_HMAC_SECRET_PREVIOUS,
    sesConfigurationSet: env.SES_CONFIGURATION_SET,
    sesEndpointId: env.SES_ENDPOINT_ID,
    sesSnsTopicArn: env.SES_SNS_TOPIC_ARN,
    sesSnsTopicArnSecondary: env.SES_SNS_TOPIC_ARN_SECONDARY,
    sesSnsTopicArns: [env.SES_SNS_TOPIC_ARN, env.SES_SNS_TOPIC_ARN_SECONDARY].filter(
      (topic): topic is string => Boolean(topic)
    ),
    sesMaxSendRate: env.SES_MAX_SEND_RATE,
    sesWebhookEnabled: env.SES_WEBHOOK_ENABLED,
    mailSendMode: env.MAIL_SEND_MODE,
    sqsSendQueueUrl: env.SQS_SEND_QUEUE_URL,
    sqsSendQueueUrlSecondary: env.SQS_SEND_QUEUE_URL_SECONDARY,
    sqsSendDlqUrl: env.SQS_SEND_DLQ_URL,
    sqsSendDlqUrlSecondary: env.SQS_SEND_DLQ_URL_SECONDARY,
    sqsEventsQueueUrl: env.SQS_EVENTS_QUEUE_URL,
    sqsEventsQueueUrlSecondary: env.SQS_EVENTS_QUEUE_URL_SECONDARY,
    workerConcurrency: env.WORKER_CONCURRENCY,
    workerName: env.WORKER_NAME,
    corsOrigins: env.CORS_ORIGINS,
    mailOrigenesCriticos: env.MAIL_ORIGENES_CRITICOS,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    googleTokenKey: env.GOOGLE_TOKEN_KEY,
    alertasEmail: env.ALERTAS_EMAIL,
  };
}

let cached: AppConfig | null = null;

/** Carga diferida: se valida en el primer uso, no al importar (no rompe `next build`). */
export function loadConfig(): AppConfig {
  cached ??= parseConfig(process.env);
  return cached;
}

export function config(): AppConfig {
  return loadConfig();
}

export function resetConfigForTests(): void {
  cached = null;
  devUnsubscribeSecret = null;
}
