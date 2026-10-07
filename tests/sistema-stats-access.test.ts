import { describe, expect, it } from 'vitest';
import { statsAccess } from '@/lib/mail/stats';

describe('statsAccess', () => {
  it('deja pasar al sistema cuando el id es el suyo', () => {
    expect(statsAccess({ kind: 'system', sistemaId: 1 }, 1)).toEqual({ ok: true });
  });

  it('rechaza la clave de otro sistema', () => {
    const r = statsAccess({ kind: 'system', sistemaId: 1 }, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.codigo).toBe('sistema_no_coincide');
      expect(r.log).toContain('sistema 1');
      expect(r.log).toContain('sistema 2');
    }
  });

  it('deja pasar al administrador', () => {
    expect(statsAccess({ kind: 'admin' }, 4)).toEqual({ ok: true });
  });

  it('pide clave si no hay caller', () => {
    const r = statsAccess(null, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });
});
