import { describe, expect, it } from 'vitest';
import {
  formatRemitente,
  getMailFrom,
  parseRemitente,
  remitenteEnHash,
  resolveMailFrom,
} from '@/lib/mail/from';
import { computeRequestHash } from '@/lib/mail/idempotency';
import { buildRawMessage } from '@/lib/mail/providers/ses-api';

function dominio(): string {
  return getMailFrom().email.split('@')[1].toLowerCase();
}

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
