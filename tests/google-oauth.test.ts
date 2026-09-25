import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({
  value: {
    googleClientId: 'id.apps.googleusercontent.com',
    googleClientSecret: 'secret',
    googleTokenKey: 'k'.repeat(32),
    unsubscribeSecret: 'u'.repeat(32),
    appBaseUrl: 'https://mail.ejemplo.gob.ar',
  },
}));

vi.mock('@/lib/config', () => ({ config: () => cfg.value }));

const { decryptSecret, encryptSecret } = await import('@/lib/google/crypto');
const { oauthRedirectAllowed, signOAuthState, verifyOAuthState } = await import(
  '@/lib/google/oauth'
);

describe('oauth state', () => {
  const now = 1_700_000_000_000;

  it('acepta un state válido del mismo nonce', () => {
    const state = signOAuthState('abc', now);
    expect(verifyOAuthState(state, 'abc', now + 1000)).toEqual({ ok: true });
  });

  it('rechaza un state vencido', () => {
    const state = signOAuthState('abc', now);
    expect(verifyOAuthState(state, 'abc', now + 11 * 60_000).ok).toBe(false);
  });

  it('rechaza un state adulterado o de otro navegador', () => {
    const state = signOAuthState('abc', now);
    expect(verifyOAuthState(state + 'x', 'abc', now).ok).toBe(false);
    expect(verifyOAuthState(state, 'otro', now).ok).toBe(false);
  });
});

describe('encryptSecret', () => {
  beforeEach(() => {
    cfg.value.googleTokenKey = 'k'.repeat(32);
  });

  it('cifra y descifra', () => {
    const packed = encryptSecret('refresh-token');
    expect(packed.startsWith('v1.')).toBe(true);
    expect(decryptSecret(packed)).toBe('refresh-token');
  });

  it('falla con otra clave', () => {
    const packed = encryptSecret('refresh-token');
    cfg.value.googleTokenKey = 'x'.repeat(32);
    expect(() => decryptSecret(packed)).toThrow();
  });
});

describe('oauthRedirectAllowed', () => {
  it('exige https salvo localhost', () => {
    cfg.value.appBaseUrl = 'http://mail.ejemplo.gob.ar';
    expect(oauthRedirectAllowed().ok).toBe(false);
    cfg.value.appBaseUrl = 'http://localhost:3000';
    expect(oauthRedirectAllowed()).toEqual({ ok: true });
    cfg.value.appBaseUrl = 'https://mail.ejemplo.gob.ar';
    expect(oauthRedirectAllowed()).toEqual({ ok: true });
  });
});
