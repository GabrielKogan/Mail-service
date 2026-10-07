import { describe, expect, it } from 'vitest';
import {
  esErrorScopePostmaster,
  mensajeErrorPostmaster,
  tieneScopePostmaster,
} from '@/lib/google/scopes';

describe('scopes de Postmaster', () => {
  it('reconoce los scopes vigentes y el viejo', () => {
    expect(tieneScopePostmaster('openid email')).toBe(false);
    expect(
      tieneScopePostmaster(
        'openid https://www.googleapis.com/auth/postmaster.traffic.readonly email'
      )
    ).toBe(true);
    expect(tieneScopePostmaster('https://www.googleapis.com/auth/postmaster.domain')).toBe(true);
    expect(tieneScopePostmaster('https://www.googleapis.com/auth/postmaster.readonly')).toBe(true);
    expect(tieneScopePostmaster('https://www.googleapis.com/auth/postmaster')).toBe(true);
  });

  it('traduce el 403 de scopes insuficientes', () => {
    const raw = 'Request had insufficient authentication scopes.';
    expect(esErrorScopePostmaster(raw)).toBe(true);
    expect(mensajeErrorPostmaster(raw)).toMatch(/permiso de Postmaster/);
    expect(mensajeErrorPostmaster('otra cosa')).toBe('otra cosa');
  });
});
