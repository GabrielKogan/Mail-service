import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

type State = {
  logs: { id: number; messageId: string; destinatario: string; estadoActual: string }[];
  eventos: { mail_log_id: number; evento: string; origenEventoId: string | null }[];
  supresiones: Map<string, { id: number; motivo: string; activo: boolean }>;
  historial: { supresionId: number; accion: string; motivo: string; origenAccion: string; nota: string | null }[];
};

const db = vi.hoisted(() => {
  const state: { current: State; failNextEventInsert: boolean } = {
    current: { logs: [], eventos: [], supresiones: new Map(), historial: [] },
    failNextEventInsert: false,
  };

  const clone = (s: State): State => ({
    logs: s.logs.map((l) => ({ ...l })),
    eventos: s.eventos.map((e) => ({ ...e })),
    supresiones: new Map([...s.supresiones].map(([k, v]) => [k, { ...v }])),
    historial: s.historial.map((x) => ({ ...x })),
  });

  const client = {
    mailLog: {
      findUnique: async ({ where }: { where: { id?: number; messageId?: string } }) =>
        state.current.logs.find((l) =>
          where.id != null ? l.id === where.id : l.messageId === where.messageId
        ) ?? null,
      update: async ({ where, data }: { where: { id: number }; data: { estadoActual: string } }) => {
        const log = state.current.logs.find((l) => l.id === where.id)!;
        log.estadoActual = data.estadoActual;
        return log;
      },
    },
    mail_supresion: {
      upsert: async ({
        where,
        create,
      }: {
        where: { email_origen: { email: string; origen: string } };
        create: { motivo: string };
      }) => {
        const key = `${where.email_origen.email}|${where.email_origen.origen}`;
        const id = state.current.supresiones.get(key)?.id ?? state.current.supresiones.size + 1;
        state.current.supresiones.set(key, { id, motivo: create.motivo, activo: true });
        return { id };
      },
    },
    mail_supresion_historial: {
      create: async ({ data }: { data: State['historial'][number] }) => {
        state.current.historial.push({ ...data });
      },
    },
    mail_log_eventos: {
      create: async ({
        data,
      }: {
        data: { mail_log_id: number; evento: string; origenEventoId: string | null };
      }) => {
        if (state.failNextEventInsert) {
          state.failNextEventInsert = false;
          throw new Error('caída simulada');
        }
        if (
          data.origenEventoId &&
          state.current.eventos.some((e) => e.origenEventoId === data.origenEventoId)
        ) {
          throw new Prisma.PrismaClientKnownRequestError('duplicado', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        state.current.eventos.push({ ...data });
      },
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const snapshot = clone(state.current);
      try {
        return await fn(client);
      } catch (err) {
        state.current = snapshot;
        throw err;
      }
    },
  };

  return { state, client };
});

vi.mock('@/lib/prisma', () => ({ prisma: db.client }));

const { processSesNotification } = await import('@/lib/mail/ses-events');

const complaint = JSON.stringify({
  eventType: 'Complaint',
  mail: { messageId: 'ses-1', tags: { mail_log_id: ['1'] } },
  complaint: { timestamp: '2026-09-24T10:00:00.000Z' },
});

beforeEach(() => {
  db.state.current = {
    logs: [{ id: 1, messageId: 'ses-1', destinatario: 'vecino@example.com', estadoActual: 'entregado' }],
    eventos: [],
    supresiones: new Map(),
    historial: [],
  };
  db.state.failNextEventInsert = false;
});

describe('processSesNotification', () => {
  it('el mismo MessageId de SNS genera un solo evento y una sola supresión', async () => {
    expect(await processSesNotification('sns-1', complaint)).toBe('processed');
    expect(await processSesNotification('sns-1', complaint)).toBe('duplicate');
    expect(db.state.current.eventos).toHaveLength(1);
    expect(db.state.current.supresiones.size).toBe(1);
    expect(db.state.current.logs[0].estadoActual).toBe('queja');
    expect(db.state.current.historial).toEqual([
      { supresionId: 1, accion: 'bloquear', motivo: 'queja', origenAccion: 'ses', nota: null },
    ]);
  });

  it('un rebote OnAccountSuppressionList bloquea como rebote y lo anota en el historial', async () => {
    const bounce = JSON.stringify({
      eventType: 'Bounce',
      mail: { messageId: 'ses-1', tags: { mail_log_id: ['1'] } },
      bounce: {
        timestamp: '2026-09-24T10:00:00.000Z',
        bounceType: 'Permanent',
        bounceSubType: 'OnAccountSuppressionList',
      },
    });
    expect(await processSesNotification('sns-9', bounce)).toBe('processed');
    expect(db.state.current.supresiones.get('vecino@example.com|*')?.motivo).toBe('rebote');
    expect(db.state.current.historial[0].nota).toMatch(/lista de supresión de la cuenta/);
  });

  it('una caída entre la supresión y el evento no deja la supresión a medias', async () => {
    db.state.failNextEventInsert = true;
    await expect(processSesNotification('sns-2', complaint)).rejects.toThrow('caída simulada');
    expect(db.state.current.supresiones.size).toBe(0);
    expect(db.state.current.eventos).toHaveLength(0);
    expect(db.state.current.historial).toHaveLength(0);

    expect(await processSesNotification('sns-2', complaint)).toBe('processed');
    expect(db.state.current.supresiones.get('vecino@example.com|*')?.motivo).toBe('queja');
    expect(db.state.current.eventos).toHaveLength(1);
  });

  it('un evento sin MailLog se informa como unmatched', async () => {
    const other = JSON.stringify({ eventType: 'Delivery', mail: { messageId: 'otro' } });
    expect(await processSesNotification('sns-3', other)).toBe('unmatched');
  });
});
