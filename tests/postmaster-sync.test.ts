import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const rows: {
    id: number;
    dominio: string;
    fecha: Date;
    spamRate: number | null;
    reputacionDominio: string | null;
    dkimOk: number | null;
    dmarcOk: number | null;
    alertadoEn: Date | null;
    alertadoReputacion: Date | null;
    alertadoAuth: Date | null;
  }[] = [];
  const conexion = {
    current: {
      id: 1,
      email: 'admin@lujandecuyo.gob.ar',
      refreshTokenEnc: 'v1.aa.bb.cc',
      estado: 'activa',
      ultimaSync: null as Date | null,
      ultimoError: null as string | null,
      alertadoVencida: null as Date | null,
    },
  };
  const send = vi.fn(async () => ({ messageId: 'alerta-1' }));
  const spamRate = { current: 0.004 };
  return { rows, conexion, send, spamRate };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mail_google_conexion: {
      findFirst: async () => ({ ...h.conexion.current }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(h.conexion.current, data);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const row = h.conexion.current;
        if (where.id != null && where.id !== row.id) return { count: 0 };
        if (where.estado && where.estado !== row.estado) return { count: 0 };
        if ('alertadoVencida' in where && where.alertadoVencida === null && row.alertadoVencida) {
          return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    mail_postmaster_diario: {
      findFirst: async ({ where }: { where: { dominio: string; fecha: Date } }) =>
        h.rows.find(
          (r) => r.dominio === where.dominio && r.fecha.getTime() === where.fecha.getTime()
        ) ?? null,
      create: async ({ data }: { data: (typeof h.rows)[number] }) => {
        const dup = h.rows.find(
          (r) => r.dominio === data.dominio && r.fecha.getTime() === data.fecha.getTime()
        );
        if (dup) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '5.22.0',
          });
        }
        const row = { ...data, id: h.rows.length + 1 };
        h.rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        const row = h.rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; alertadoEn?: null; alertadoReputacion?: null; alertadoAuth?: null };
        data: Record<string, unknown>;
      }) => {
        const row = h.rows.find((r) => r.id === where.id);
        if (!row) return { count: 0 };
        if ('alertadoEn' in where && where.alertadoEn === null && row.alertadoEn) return { count: 0 };
        if ('alertadoReputacion' in where && where.alertadoReputacion === null && row.alertadoReputacion) {
          return { count: 0 };
        }
        if ('alertadoAuth' in where && where.alertadoAuth === null && row.alertadoAuth) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  },
}));

vi.mock('@/lib/config', () => ({
  config: () => ({
    mailFromEmail: 'registro@lujandecuyo.gob.ar',
    alertasEmail: 'sistemas@lujandecuyo.gob.ar',
    googleTokenKey: 'k'.repeat(32),
    googleClientId: 'id',
    googleClientSecret: 'sec',
  }),
}));

vi.mock('@/lib/google/crypto', () => ({ decryptSecret: () => 'refresh' }));
vi.mock('@/lib/google/oauth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/oauth')>('@/lib/google/oauth');
  return {
    ...actual,
    refreshAccessToken: async () => ({ accessToken: 'access', expiresIn: 3600 }),
  };
});
vi.mock('@/lib/google/postmaster-api', () => ({
  listDomains: async () => [{ name: 'domains/lujandecuyo.gob.ar' }],
  listTrafficStats: async () => [
    {
      name: 'domains/lujandecuyo.gob.ar/trafficStats/20260920',
      userReportedSpamRatio: h.spamRate.current,
      domainReputation: 'MEDIUM',
      dkimSuccessRatio: 0.99,
      dmarcSuccessRatio: 0.99,
    },
  ],
  fechaDeStat: (s: { name?: string }) => {
    const m = (s.name ?? '').match(/(\d{8})$/);
    if (!m) return null;
    return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
  },
}));
vi.mock('@/lib/mail', () => ({ getMailProvider: () => ({ send: h.send }) }));
vi.mock('@/lib/mail/from', () => ({ getMailFrom: () => ({ email: 'registro@x', name: 'Muni' }) }));

const { resetGoogleAccessCache, syncPostmaster } = await import('@/lib/google/sync');

beforeEach(() => {
  h.rows.length = 0;
  h.send.mockClear();
  h.spamRate.current = 0.004;
  resetGoogleAccessCache();
  h.conexion.current = {
    id: 1,
    email: 'admin@lujandecuyo.gob.ar',
    refreshTokenEnc: 'v1.aa.bb.cc',
    estado: 'activa',
    ultimaSync: null,
    ultimoError: null,
    alertadoVencida: null,
  };
});

describe('syncPostmaster', () => {
  it('guarda el día y alerta una sola vez con spam ≥ 0,3 %', async () => {
    const a = await syncPostmaster();
    const b = await syncPostmaster();
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].spamRate).toBe(0.004);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('dos corridas en paralelo tampoco mandan dos alertas', async () => {
    await Promise.all([syncPostmaster(), syncPostmaster()]);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(1);
  });

  it('no alerta por debajo de 0,3 %', async () => {
    h.spamRate.current = 0.002;
    await syncPostmaster();
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].spamRate).toBe(0.002);
    expect(h.send).not.toHaveBeenCalled();
  });
});
