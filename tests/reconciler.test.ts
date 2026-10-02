import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => {
  const rows: Row[] = [];
  const eventos: { mail_log_id: number; evento: string }[] = [];

  const cmp = (value: unknown, cond: unknown): boolean => {
    if (cond === null) return value === null || value === undefined;
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (cond && typeof cond === 'object') {
      const c = cond as Record<string, unknown>;
      if ('gte' in c && !((value as number) >= (c.gte as number))) return false;
      if ('lt' in c) {
        if (value == null) return false;
        const v = value instanceof Date ? value.getTime() : (value as number);
        const l = c.lt instanceof Date ? c.lt.getTime() : (c.lt as number);
        if (!(v < l)) return false;
      }
      return true;
    }
    return value === cond;
  };

  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, cond]) =>
      k === 'OR'
        ? (cond as Record<string, unknown>[]).some((w) => matches(row, w))
        : k === 'AND'
          ? (cond as Record<string, unknown>[]).every((w) => matches(row, w))
          : cmp(row[k], cond)
    );

  const prisma = {
    mailLog: {
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Row }) {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
      },
    },
    mail_adjunto: { deleteMany: async () => ({ count: 0 }) },
    mail_log_eventos: {
      async createMany({ data }: { data: { mail_log_id: number; evento: string }[] }) {
        eventos.push(...data.map((d) => ({ mail_log_id: d.mail_log_id, evento: d.evento })));
        return { count: data.length };
      },
    },
  };
  return { rows, eventos, prisma };
});

vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/config', () => ({
  config: () => ({ sqsSendQueueUrl: 'https://sqs.test/mail-send', sesMaxSendRate: 10 }),
}));

const { reconcileOnce } = await import('../worker/reconciler');

const now = new Date('2026-09-24T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

beforeEach(() => {
  h.rows.length = 0;
  h.eventos.length = 0;
});

describe('reconcileOnce', () => {
  it('con intentos >= 5 marca error y no reencola', async () => {
    h.rows.push({ id: 1, estadoActual: 'en_cola', intentos: 5, fechaEncolado: minutesAgo(60) });
    const enqueue = vi.fn(async () => undefined);
    const r = await reconcileOnce(now, { enqueue });
    expect(r.agotados).toBe(1);
    expect(enqueue).not.toHaveBeenCalled();
    expect(h.rows[0].estadoActual).toBe('error');
    expect(h.eventos).toEqual([{ mail_log_id: 1, evento: 'agotado' }]);
  });

  it('reencola solo los que llevan más de 15 minutos en cola', async () => {
    h.rows.push(
      { id: 1, estadoActual: 'en_cola', intentos: 1, fechaEncolado: minutesAgo(20) },
      { id: 2, estadoActual: 'en_cola', intentos: 0, fechaEncolado: minutesAgo(5) }
    );
    const enqueue = vi.fn(async () => undefined);
    const r = await reconcileOnce(now, { enqueue });
    expect(r.reencolados).toBe(1);
    expect(enqueue).toHaveBeenCalledWith(1);
    expect((h.rows[0].fechaEncolado as Date).getTime()).toBe(now.getTime());
    expect(h.eventos).toEqual([{ mail_log_id: 1, evento: 'reencolado_auto' }]);
  });

  it('pasa a revisar lo que quedó más de 10 minutos en enviando', async () => {
    h.rows.push(
      { id: 1, estadoActual: 'enviando', intentos: 1, fechaIntento: minutesAgo(11) },
      { id: 2, estadoActual: 'enviando', intentos: 1, fechaIntento: minutesAgo(2) }
    );
    const r = await reconcileOnce(now, { enqueue: vi.fn(async () => undefined) });
    expect(r.aRevisar).toBe(1);
    expect(h.rows.map((x) => x.estadoActual)).toEqual(['revisar', 'enviando']);
    expect(h.eventos).toEqual([{ mail_log_id: 1, evento: 'revisar' }]);
  });
});
