import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const conexion = {
    current: {
      id: 1,
      email: 'a@b.com',
      refreshTokenEnc: 'enc',
      estado: 'activa',
      ultimaSync: null as Date | null,
      ultimoError: null as string | null,
      alertadoVencida: null as Date | null,
    },
  };
  const send = vi.fn(async () => ({ messageId: '1' }));
  return { conexion, send };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mail_google_conexion: {
      findFirst: async () => ({ ...h.conexion.current }),
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(h.conexion.current, data),
      updateMany: async ({
        where,
        data,
      }: {
        where: { alertadoVencida?: null };
        data: Record<string, unknown>;
      }) => {
        if (where.alertadoVencida === null && h.conexion.current.alertadoVencida) return { count: 0 };
        Object.assign(h.conexion.current, data);
        return { count: 1 };
      },
    },
    mail_postmaster_diario: {
      findFirst: async () => null,
      create: async () => ({ id: 1 }),
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
  },
}));
vi.mock('@/lib/config', () => ({
  config: () => ({
    mailFromEmail: 'registro@lujandecuyo.gob.ar',
    alertasEmail: 'sistemas@x',
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
    refreshAccessToken: async () => {
      throw new actual.GoogleOAuthError('Token has been expired or revoked.', 'invalid_grant');
    },
  };
});
vi.mock('@/lib/mail', () => ({ getMailProvider: () => ({ send: h.send }) }));
vi.mock('@/lib/mail/from', () => ({ getMailFrom: () => ({ email: 'r@x', name: 'M' }) }));

const { resetGoogleAccessCache, syncPostmaster } = await import('@/lib/google/sync');

beforeEach(() => {
  resetGoogleAccessCache();
  h.send.mockClear();
  h.conexion.current.estado = 'activa';
  h.conexion.current.alertadoVencida = null;
  h.conexion.current.ultimoError = null;
});

describe('syncPostmaster invalid_grant', () => {
  it('marca vencida y alerta una sola vez', async () => {
    const a = await syncPostmaster();
    const b = await syncPostmaster();
    expect(a.motivo).toMatch(/vencido|revocado/);
    expect(h.conexion.current.estado).toBe('vencida');
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(b.ok).toBe(false);
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});
