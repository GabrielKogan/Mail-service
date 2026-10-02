import { createHmac } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '@/lib/config';
import { signUnsubToken, verifyOpenToken, verifyUnsubToken } from '@/lib/mail/tracking';

const CURRENT = 'c'.repeat(40);
const PREVIOUS = 'p'.repeat(40);

function legacyToken(secret: string, purpose: string, id: number) {
  return createHmac('sha256', secret).update(`${purpose}:${id}`).digest('hex').slice(0, 32);
}

function withEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetConfigForTests();
}

describe('tokens de baja y apertura', () => {
  afterEach(() => {
    withEnv({ UNSUBSCRIBE_HMAC_SECRET: undefined, UNSUBSCRIBE_HMAC_SECRET_PREVIOUS: undefined });
  });

  it('firma con el secreto actual y lo verifica', () => {
    withEnv({ UNSUBSCRIBE_HMAC_SECRET: CURRENT });
    const token = signUnsubToken(42);
    expect(token).toBe(legacyToken(CURRENT, 'unsub', 42));
    expect(verifyUnsubToken(42, token)).toBe(true);
    expect(verifyUnsubToken(43, token)).toBe(false);
  });

  it('acepta links firmados con el secreto anterior durante la transición', () => {
    withEnv({ UNSUBSCRIBE_HMAC_SECRET: CURRENT, UNSUBSCRIBE_HMAC_SECRET_PREVIOUS: PREVIOUS });
    expect(verifyUnsubToken(7, legacyToken(PREVIOUS, 'unsub', 7))).toBe(true);
    expect(verifyOpenToken(7, legacyToken(PREVIOUS, 'open', 7))).toBe(true);
  });

  it('rechaza links firmados con otro secreto o con otro propósito', () => {
    withEnv({ UNSUBSCRIBE_HMAC_SECRET: CURRENT });
    expect(verifyUnsubToken(7, legacyToken(PREVIOUS, 'unsub', 7))).toBe(false);
    expect(verifyUnsubToken(7, legacyToken(CURRENT, 'open', 7))).toBe(false);
    expect(verifyUnsubToken(7, '')).toBe(false);
  });
});
