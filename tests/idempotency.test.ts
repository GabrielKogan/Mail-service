import { describe, expect, it } from 'vitest';
import { computeRequestHash, replyForExisting } from '@/lib/mail/idempotency';

const base = {
  email: 'Vecino@Example.com ',
  asunto: 'Turno confirmado',
  cuerpo: '<p>Hola</p>',
  adjuntos: [{ filename: 'a.pdf', contentType: 'application/pdf', contentBase64: 'JVBERi0x' }],
};

describe('computeRequestHash', () => {
  it('normaliza el email', () => {
    expect(computeRequestHash(base)).toBe(
      computeRequestHash({ ...base, email: 'vecino@example.com' })
    );
  });

  it('cambia si cambia data de una plantilla', () => {
    const a = {
      email: 'a@b.com',
      tipo: 'novedad',
      data: { titulo: 'A', texto: 'B' },
      adjuntos: [] as typeof base.adjuntos,
    };
    const ha = computeRequestHash(a);
    expect(computeRequestHash({ ...a, data: { texto: 'B', titulo: 'A' } })).toBe(ha);
    expect(computeRequestHash({ ...a, data: { titulo: 'A', texto: 'C' } })).not.toBe(ha);
  });

  it('cambia si cambia el contenido o un adjunto', () => {
    const h = computeRequestHash(base);
    expect(computeRequestHash({ ...base, cuerpo: '<p>Chau</p>' })).not.toBe(h);
    expect(
      computeRequestHash({
        ...base,
        adjuntos: [{ ...base.adjuntos[0], contentBase64: 'JVBERi0y' }],
      })
    ).not.toBe(h);
  });
});

describe('replyForExisting', () => {
  const hash = computeRequestHash(base);
  const record = {
    id: 7,
    estadoActual: 'entregado',
    messageId: 'abc@email.amazonses.com',
    errorDetalle: null,
    requestHash: hash,
  };

  it('devuelve el original marcado como duplicado', () => {
    const r = replyForExisting(record, hash);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 7, duplicado: true, messageId: record.messageId });
  });

  it('responde 409 si el contenido es otro', () => {
    expect(replyForExisting(record, 'f'.repeat(64)).status).toBe(409);
  });

  it('repite el 422 si el original fue suprimido', () => {
    const r = replyForExisting(
      { ...record, estadoActual: 'suprimido', messageId: 'suppressed-x', errorDetalle: 'rebote' },
      hash
    );
    expect(r.status).toBe(422);
  });

  it('no expone messageId provisorios', () => {
    const r = replyForExisting({ ...record, estadoActual: 'en_cola', messageId: 'queued-1' }, hash);
    expect(r.body.messageId).toBeNull();
  });
});
