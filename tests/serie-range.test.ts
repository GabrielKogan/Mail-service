import { describe, expect, it } from 'vitest';
import { defaultSerieRange, rangoSerieInicial, SERIE_DIAS } from '@/lib/mail/serie-range';

function diasInclusive(desde: Date, hasta: Date): number {
  const start = new Date(desde);
  start.setHours(0, 0, 0, 0);
  const end = new Date(hasta);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

describe('rango de la serie diaria', () => {
  const now = new Date(2026, 9, 7, 15, 30, 0);

  it('sin fechas toma 15 días inclusive hasta hoy', () => {
    const rango = defaultSerieRange(null, null, now);
    expect(rango.esDefault15d).toBe(true);
    expect(rango.desde && rango.hasta && diasInclusive(rango.desde, rango.hasta)).toBe(SERIE_DIAS);
    expect(rangoSerieInicial(now)).toEqual({ desde: '2026-09-23', hasta: '2026-10-07' });
  });

  it('un rango elegido no usa el default', () => {
    const rango = defaultSerieRange('2026-10-01', '2026-10-05', now);
    expect(rango.esDefault15d).toBe(false);
    expect(rango.desde?.getDate()).toBe(1);
    expect(rango.hasta?.getDate()).toBe(5);
    expect(rango.hasta?.getHours()).toBe(23);
  });
});
