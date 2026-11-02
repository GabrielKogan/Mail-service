import { describe, expect, it } from 'vitest';
import { buzonDeNombre } from '@/lib/mail/buzon-nombre';

describe('buzonDeNombre', () => {
  it('junta el nombre del sistema en un buzón', () => {
    expect(buzonDeNombre('licencia de conducir')).toBe('licenciadeconducir');
    expect(buzonDeNombre('Licencia de Conducir')).toBe('licenciadeconducir');
  });

  it('saca acentos y signos', () => {
    expect(buzonDeNombre('Atención al vecino')).toBe('atencionalvecino');
    expect(buzonDeNombre('  Rentas  ')).toBe('rentas');
    expect(buzonDeNombre('---')).toBe('');
  });
});
