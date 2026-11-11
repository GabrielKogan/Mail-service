import { describe, expect, it } from 'vitest';
import { htmlATexto } from '@/lib/mail/html-a-texto';

describe('htmlATexto', () => {
  it('deja el mensaje en texto y conserva saltos y enlaces', () => {
    const html = `<p>Hola Ana,</p><p>Tu turno es el <strong>25/09</strong>.</p><p><a href="https://turnos.ejemplo.gob.ar">Ver turno</a></p>`;
    expect(htmlATexto(html)).toBe(
      'Hola Ana,\nTu turno es el 25/09.\nVer turno (https://turnos.ejemplo.gob.ar)'
    );
  });

  it('decodifica entidades y descarta el píxel y los estilos', () => {
    const html = `<style>p{color:red}</style><p>Rentas &amp; tasas<br>Línea 2</p><img src="https://mail.ejemplo/t/open/1" width="1" height="1">`;
    expect(htmlATexto(html)).toBe('Rentas & tasas\nLínea 2');
  });
});
