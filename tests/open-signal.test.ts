import { describe, expect, it } from 'vitest';
import { isLikelyPrefetch } from '@/lib/mail/open-signal';

const enviado = new Date('2026-11-03T15:00:00.000Z');
const entregado = new Date('2026-11-03T15:00:05.000Z');

describe('isLikelyPrefetch', () => {
  it('un filtro conocido no cuenta como apertura', () => {
    expect(
      isLikelyPrefetch({
        userAgent: 'Barracuda Sentinel',
        openedAt: new Date('2026-11-03T15:05:00.000Z'),
        sentAt: enviado,
        deliveredAt: entregado,
      })
    ).toBe(true);
    expect(
      isLikelyPrefetch({
        userAgent: '',
        openedAt: new Date('2026-11-03T15:05:00.000Z'),
        deliveredAt: entregado,
      })
    ).toBe(true);
  });

  it('Gmail cuenta aunque la imagen se pida enseguida', () => {
    expect(
      isLikelyPrefetch({
        userAgent: 'Mozilla/5.0 (via ggpht.com GoogleImageProxy)',
        openedAt: new Date('2026-11-03T15:00:06.000Z'),
        sentAt: enviado,
        deliveredAt: entregado,
      })
    ).toBe(false);
  });

  it('un cliente común en los primeros segundos después de la entrega no cuenta', () => {
    expect(
      isLikelyPrefetch({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        openedAt: new Date('2026-11-03T15:00:08.000Z'),
        sentAt: enviado,
        deliveredAt: entregado,
      })
    ).toBe(true);
  });

  it('el mismo cliente, después de la ventana, cuenta como apertura', () => {
    expect(
      isLikelyPrefetch({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        openedAt: new Date('2026-11-03T15:01:00.000Z'),
        sentAt: enviado,
        deliveredAt: entregado,
      })
    ).toBe(false);
  });
});
