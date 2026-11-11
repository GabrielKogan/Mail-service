import { describe, expect, it } from 'vitest';
import {
  formatRemitente,
  getMailFrom,
  parseRemitente,
  remitenteDeSistema,
  remitenteEnHash,
  remitentePorDefecto,
  resolveMailFrom,
} from '@/lib/mail/from';
import { computeRequestHash } from '@/lib/mail/idempotency';
import { buildRawMessage } from '@/lib/mail/providers/ses-api';

function dominio(): string {
  return getMailFrom().email.split('@')[1].toLowerCase();
}

const licencia = { origen: 'licencia', nombre: 'Licencia de conducir' };

describe('remitente del sistema', () => {
  it('usa el origen como buzón y el nombre del sistema como visible', () => {
    expect(remitenteDeSistema(licencia)).toEqual({
      desde: 'licencia',
      nombre: 'Licencia de conducir',
    });
    expect(remitenteDeSistema({ origen: '  Turnos  ', nombre: 'Turnos' })).toEqual({
      desde: 'turnos',
      nombre: 'Turnos',
    });
    expect(remitenteDeSistema({ origen: 'atencion_vecino', nombre: 'Atención al vecino' })).toEqual({
      desde: 'atencion_vecino',
      nombre: 'Atención al vecino',
    });
    expect(remitenteDeSistema({ origen: 'mesa-entrada', nombre: 'Mesa de entrada' })).toEqual({
      desde: 'mesa-entrada',
      nombre: 'Mesa de entrada',
    });
    expect(remitenteDeSistema({ origen: 'mesa-entrada', nombre: 'Mesa de entrada' })).toEqual({
      desde: 'mesa-entrada',
      nombre: 'Mesa de entrada',
    });
  });

  it('no inventa un buzón si el origen no sirve', () => {
    expect(remitenteDeSistema({ origen: '---', nombre: 'Roto' })).toBeNull();
    expect(remitenteDeSistema({ origen: '.turnos', nombre: 'Turnos' })).toBeNull();
    expect(remitenteDeSistema({ origen: 'a'.repeat(65), nombre: 'Largo' })).toBeNull();
  });

  it('si el nombre visible no sirve, el buzón sigue siendo el origen', () => {
    expect(remitenteDeSistema({ origen: 'turnos', nombre: 'Turnos <interno>' })).toEqual({
      desde: 'turnos',
      nombre: 'turnos',
    });
  });

  it('si el sistema no pidió remitente, usa su origen', () => {
    const domain = dominio();
    const pedido = remitentePorDefecto({ sistema: licencia });
    expect(resolveMailFrom(pedido)).toEqual({
      ok: true,
      identity: {
        email: `licencia@${domain}`,
        name: 'Licencia de conducir',
      },
    });
  });

  it('un desde o un nombre explícito no se pisan, y sin sistema queda el de siempre', () => {
    const base = getMailFrom();
    expect(remitentePorDefecto({})).toEqual({});
    expect(remitentePorDefecto({ sistema: { origen: '---', nombre: 'Roto' } })).toEqual({});
    expect(resolveMailFrom(remitentePorDefecto({ sistema: null }))).toEqual({
      ok: true,
      identity: base,
    });
    expect(remitentePorDefecto({ desde: 'registro', sistema: licencia })).toEqual({
      desde: 'registro',
      nombre: undefined,
    });
    expect(remitentePorDefecto({ nombre: 'Registro Civil', sistema: licencia })).toEqual({
      desde: undefined,
      nombre: 'Registro Civil',
    });
  });
});

describe('resolveMailFrom', () => {
  it('sin datos usa el remitente configurado', () => {
    const base = getMailFrom();
    expect(resolveMailFrom()).toEqual({ ok: true, identity: base });
    expect(resolveMailFrom({ desde: '  ', nombre: '  ' })).toEqual({ ok: true, identity: base });
  });

  it('acepta el buzón corto y la dirección completa', () => {
    const domain = dominio();
    expect(resolveMailFrom({ desde: 'turnos', nombre: 'Turnos' })).toEqual({
      ok: true,
      identity: { email: `turnos@${domain}`, name: 'Turnos' },
    });
    expect(resolveMailFrom({ desde: `Rentas@${domain}` })).toEqual({
      ok: true,
      identity: { email: `rentas@${domain}`, name: getMailFrom().name },
    });
  });

  it('rechaza otro dominio, un buzón roto y saltos de línea', () => {
    expect(resolveMailFrom({ desde: 'alcalde@gmail.com' }).ok).toBe(false);
    expect(resolveMailFrom({ desde: 'turnos@mail.' + dominio() }).ok).toBe(false);
    expect(resolveMailFrom({ desde: '.turnos' }).ok).toBe(false);
    expect(resolveMailFrom({ desde: 'turnos\r\nBcc: x@y.com' }).ok).toBe(false);
    expect(resolveMailFrom({ nombre: 'Turnos <interno>' }).ok).toBe(false);
    const salto = resolveMailFrom({ nombre: 'Hola\nBcc: x@y.com' });
    expect(salto.ok).toBe(false);
  });
});

describe('remitente guardado', () => {
  it('el de siempre queda como dirección suelta y el elegido se recupera', () => {
    const base = getMailFrom();
    expect(formatRemitente(base)).toBe(base.email);
    expect(parseRemitente(base.email)).toEqual({
      email: base.email.toLowerCase(),
      name: base.name,
    });
    expect(parseRemitente(null)).toEqual({ email: base.email, name: base.name });

    const elegido = resolveMailFrom({ desde: 'turnos', nombre: 'Turnos' });
    if (!elegido.ok) throw new Error('se esperaba un remitente válido');
    expect(parseRemitente(formatRemitente(elegido.identity))).toEqual(elegido.identity);
    expect(remitenteEnHash(base)).toEqual({});
    expect(remitenteEnHash(elegido.identity)).toEqual({
      desde: elegido.identity.email,
      nombreRemitente: 'Turnos',
    });
  });

  it('un mail viejo, solo con la dirección, sigue enviándose', () => {
    const parsed = parseRemitente('registro@lujandecuyo.gob.ar');
    expect(parsed.email).toBe('registro@lujandecuyo.gob.ar');
    expect(parsed.name).toBe(getMailFrom().name);
  });
});

describe('hash e idempotencia del remitente', () => {
  const base = {
    email: 'vecino@example.com',
    asunto: 'Aviso',
    cuerpo: '<p>Hola</p>',
    adjuntos: [] as { filename: string; contentType: string; contentBase64: string }[],
  };

  it('no cambia el hash si el remitente es el de siempre', () => {
    const h = computeRequestHash(base);
    expect(computeRequestHash({ ...base, desde: undefined, nombreRemitente: undefined })).toBe(h);
    expect(computeRequestHash({ ...base, desde: `turnos@${dominio()}` })).not.toBe(h);
    expect(computeRequestHash({ ...base, nombreRemitente: 'Turnos' })).not.toBe(h);
  });
});

describe('MIME', () => {
  it('arma el From con el buzón elegido', async () => {
    const raw = (
      await buildRawMessage({
        from: { name: 'Turnos', email: 'turnos@lujandecuyo.gob.ar' },
        to: 'vecino@example.com',
        toName: '',
        subject: 'Aviso',
        html: '<p>Hola</p>',
      })
    ).toString('utf8');
    expect(raw).toContain('turnos@lujandecuyo.gob.ar');
    expect(raw).toContain('Turnos');
  });
});
