import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  syncPostmaster: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mail_google_conexion: {
      findFirst: (...args: unknown[]) => h.findFirst(...args),
    },
  },
}));

vi.mock('@/lib/google/sync', () => ({
  syncPostmaster: (...args: unknown[]) => h.syncPostmaster(...args),
}));

const { isPostmasterSyncDue, POSTMASTER_SYNC_INTERVAL_MS, syncPostmasterIfDue } = await import(
  '@/lib/google/schedule'
);

describe('isPostmasterSyncDue', () => {
  const now = Date.parse('2026-10-07T12:00:00.000Z');

  it('pide sync si nunca se sincronizó', () => {
    expect(isPostmasterSyncDue(null, now)).toBe(true);
    expect(isPostmasterSyncDue(undefined, now)).toBe(true);
  });

  it('espera 6 h después de una pasada exitosa', () => {
    const reciente = new Date(now - POSTMASTER_SYNC_INTERVAL_MS + 1);
    const vencida = new Date(now - POSTMASTER_SYNC_INTERVAL_MS);
    expect(isPostmasterSyncDue(reciente, now)).toBe(false);
    expect(isPostmasterSyncDue(vencida, now)).toBe(true);
  });
});

describe('syncPostmasterIfDue', () => {
  beforeEach(() => {
    h.findFirst.mockReset();
    h.syncPostmaster.mockReset();
    h.syncPostmaster.mockResolvedValue({ ok: true, dias: 2, alertas: [] });
  });

  it('no llama a Google si no hay cuenta', async () => {
    h.findFirst.mockResolvedValue(null);
    const result = await syncPostmasterIfDue();
    expect(result.omitido).toBe(true);
    expect(h.syncPostmaster).not.toHaveBeenCalled();
  });

  it('no llama a Google si la conexión está vencida', async () => {
    h.findFirst.mockResolvedValue({ estado: 'vencida', ultimaSync: null });
    const result = await syncPostmasterIfDue();
    expect(result.omitido).toBe(true);
    expect(h.syncPostmaster).not.toHaveBeenCalled();
  });

  it('no llama a Google si la última sync todavía es fresca', async () => {
    h.findFirst.mockResolvedValue({ estado: 'activa', ultimaSync: new Date() });
    const result = await syncPostmasterIfDue();
    expect(result).toMatchObject({ ok: true, omitido: true, dias: 0 });
    expect(h.syncPostmaster).not.toHaveBeenCalled();
  });

  it('no reintenta sola si el token no tiene el permiso de Postmaster', async () => {
    h.findFirst.mockResolvedValue({
      estado: 'activa',
      ultimaSync: null,
      ultimoError: 'Request had insufficient authentication scopes.',
    });
    const result = await syncPostmasterIfDue();
    expect(result.omitido).toBe(true);
    expect(h.syncPostmaster).not.toHaveBeenCalled();
  });

  it('sincroniza si está activa y nunca corrió, o si ya pasaron 6 h', async () => {
    h.findFirst.mockResolvedValueOnce({ estado: 'activa', ultimaSync: null });
    await syncPostmasterIfDue();
    h.findFirst.mockResolvedValueOnce({
      estado: 'activa',
      ultimaSync: new Date(Date.now() - POSTMASTER_SYNC_INTERVAL_MS),
    });
    await syncPostmasterIfDue();
    expect(h.syncPostmaster).toHaveBeenCalledTimes(2);
  });
});
