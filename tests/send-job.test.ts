import { beforeEach, describe, expect, it, vi } from 'vitest';

type Log = {
  id: number;
  estadoActual: string;
  intentos: number;
  messageId: string;
  destinatario: string;
  nombreDest: string | null;
  asunto: string;
  cuerpo: string | null;
  texto: string | null;
  tipo: string | null;
  origen: string | null;
  sistemaId: number | null;
  errorDetalle: string | null;
  fechaIntento: Date | null;
};

const h = vi.hoisted(() => {
  const state = {
    logs: new Map<number, Record<string, unknown>>(),
    eventos: [] as { evento: string; detalle: Record<string, unknown> | null }[],
  };
  const send = {
    fn: async (_msg?: unknown): Promise<{ messageId: string }> => ({ messageId: 'ses-1' }),
    calls: 0,
    last: null as unknown,
  };

  const matches = (log: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => log[k] === v);

  const prisma = {
    mailLog: {
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        const log = state.logs.get(where.id as number);
        if (!log || !matches(log, where)) return { count: 0 };
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in v) {
            log[k] = (log[k] as number) + (v as { increment: number }).increment;
          } else {
            log[k] = v;
          }
        }
        return { count: 1 };
      },
      async findUnique({ where }: { where: { id: number } }) {
        const log = state.logs.get(where.id);
        return log ? { ...log, adjuntos: [] } : null;
      },
      async update({ where, data }: { where: { id: number }; data: Record<string, unknown> }) {
        Object.assign(state.logs.get(where.id)!, data);
      },
    },
    mail_log_eventos: {
      async create({ data }: { data: { evento: string; payload_raw: string | null } }) {
        state.eventos.push({
          evento: data.evento,
          detalle: data.payload_raw ? JSON.parse(data.payload_raw) : null,
        });
      },
    },
  };
  return { state, send, prisma };
});

vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/mail/sistemas', () => ({
  findSistemaById: async () => null,
  clasificacionDe: async () => 'subscription',
}));
vi.mock('@/lib/mail/suppression', () => ({
  findActiveSuppression: async () => null,
  suppressionErrorDetail: () => '',
}));
vi.mock('@/lib/mail/index', () => ({
  getMailProvider: () => ({
    send: async (msg: unknown) => {
      h.send.calls++;
      h.send.last = msg;
      return h.send.fn(msg);
    },
  }),
}));

const { MailProviderError } = await import('@/lib/mail/errors');
const { processSendJob, RetryableSendError, resetRateLimiterForTests } = await import(
  '@/lib/mail/send-job'
);
const { TokenBucket } = await import('@/lib/mail/rate-limit');

function seed(partial: Partial<Log> = {}): Log {
  const log: Log = {
    id: 1,
    estadoActual: 'en_cola',
    intentos: 0,
    messageId: 'queued-1',
    destinatario: 'vecino@example.com',
    nombreDest: null,
    asunto: 'Turno',
    cuerpo: '<p>Hola</p>',
    texto: 'Hola',
    tipo: 'novedad',
    origen: 'turnos',
    sistemaId: 1,
    errorDetalle: null,
    fechaIntento: null,
    ...partial,
  };
  h.state.logs.set(log.id, log as unknown as Record<string, unknown>);
  return log;
}

beforeEach(() => {
  h.state.logs.clear();
  h.state.eventos.length = 0;
  h.send.calls = 0;
  h.send.fn = async () => ({ messageId: 'ses-1' });
  resetRateLimiterForTests(new TokenBucket(1000));
});

describe('processSendJob', () => {
  it('dos workers con el mismo mailLogId producen un solo envío', async () => {
    const log = seed();
    const results = await Promise.all([processSendJob(1), processSendJob(1)]);
    expect(h.send.calls).toBe(1);
    expect(results.map((r) => r.status).sort()).toEqual(['sent', 'skipped']);
    expect(log.estadoActual).toBe('enviado');
    expect(log.messageId).toBe('ses-1');
    expect(log.intentos).toBe(1);
  });

  it('un error reintentable vuelve el registro a en_cola', async () => {
    const log = seed();
    h.send.fn = async () => {
      throw new MailProviderError('Throttling', { retryable: true });
    };
    await expect(processSendJob(1)).rejects.toBeInstanceOf(RetryableSendError);
    expect(log.estadoActual).toBe('en_cola');
    expect(h.state.eventos).toEqual([
      { evento: 'enviando', detalle: { intento: 1 } },
      { evento: 'reintento', detalle: { intento: 1, detalle: expect.stringContaining('Throttling') } },
    ]);
  });

  it('manda Feedback-ID y el pie de baja en texto', async () => {
    seed();
    await processSendJob(1);
    const msg = h.send.last as { headers?: Record<string, string>; text?: string };
    expect(msg.headers?.['Feedback-ID']).toBe('novedad:turnos:subscription:mlc');
    expect(typeof msg.text).toBe('string');
  });

  it('un envío exitoso registra enviando y aceptado', async () => {
    seed();
    await processSendJob(1);
    expect(h.state.eventos).toEqual([
      { evento: 'enviando', detalle: { intento: 1 } },
      { evento: 'aceptado', detalle: { messageId: 'ses-1' } },
    ]);
  });

  it('si no se puede guardar un evento, el envío sigue', async () => {
    const log = seed();
    const original = h.prisma.mail_log_eventos.create;
    h.prisma.mail_log_eventos.create = async () => {
      throw new Error('base caída');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect((await processSendJob(1)).status).toBe('sent');
      expect(log.estadoActual).toBe('enviado');
    } finally {
      h.prisma.mail_log_eventos.create = original;
      spy.mockRestore();
    }
  });

  it('un error definitivo deja el registro en error', async () => {
    const log = seed();
    h.send.fn = async () => {
      throw new MailProviderError('MessageRejected', { retryable: false });
    };
    expect((await processSendJob(1)).status).toBe('failed');
    expect(log.estadoActual).toBe('error');
    expect(h.state.eventos.map((e) => e.evento)).toEqual(['enviando', 'fallo']);
  });

  it('agotados los intentos, un error reintentable también termina en error', async () => {
    const log = seed({ intentos: 4 });
    h.send.fn = async () => {
      throw new MailProviderError('Throttling', { retryable: true });
    };
    expect((await processSendJob(1)).status).toBe('failed');
    expect(log.estadoActual).toBe('error');
  });

  it('en modo sync no reintenta', async () => {
    const log = seed();
    h.send.fn = async () => {
      throw new MailProviderError('Throttling', { retryable: true });
    };
    expect((await processSendJob(1, { allowRetry: false })).status).toBe('failed');
    expect(log.estadoActual).toBe('error');
  });

  it('no pisa un estado que un evento de SES ya avanzó', async () => {
    const log = seed();
    h.send.fn = async () => {
      log.estadoActual = 'entregado';
      return { messageId: 'ses-2' };
    };
    await processSendJob(1);
    expect(log.estadoActual).toBe('entregado');
    expect(log.messageId).toBe('ses-2');
  });
});

describe('TokenBucket', () => {
  it('espera cuando se agotan los tokens', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const bucket = new TokenBucket(
      2,
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    );
    await bucket.take();
    await bucket.take();
    await bucket.take();
    expect(sleeps).toEqual([500]);
  });
});
