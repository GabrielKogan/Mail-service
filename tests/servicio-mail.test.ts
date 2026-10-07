import { describe, expect, it } from 'vitest';
import { contarPorServicio, servicioDeDestinatario } from '@/lib/mail/servicio';

describe('servicio de correo del destinatario', () => {
  it('clasifica Gmail, Hotmail, Yahoo y deja el resto en Otros', () => {
    expect(servicioDeDestinatario('Ana@Gmail.com')).toBe('Gmail');
    expect(servicioDeDestinatario('a@googlemail.com')).toBe('Gmail');
    expect(servicioDeDestinatario('a@hotmail.com')).toBe('Hotmail');
    expect(servicioDeDestinatario('a@outlook.com')).toBe('Hotmail');
    expect(servicioDeDestinatario('a@live.com.ar')).toBe('Hotmail');
    expect(servicioDeDestinatario('a@yahoo.com.ar')).toBe('Yahoo');
    expect(servicioDeDestinatario('a@ymail.com')).toBe('Yahoo');
    expect(servicioDeDestinatario('vecino@lujandecuyo.gob.ar')).toBe('Otros');
    expect(servicioDeDestinatario('sin-arroba')).toBe('Otros');
  });

  it('arma los porcentajes y omite servicios en cero', () => {
    const rows = contarPorServicio([
      'a@gmail.com',
      'b@gmail.com',
      'c@hotmail.com',
      'd@municipio.gob.ar',
    ]);
    expect(rows.map((r) => r.servicio)).toEqual(['Gmail', 'Hotmail', 'Otros']);
    expect(rows.find((r) => r.servicio === 'Gmail')?.porcentaje).toBe(50);
  });
});
