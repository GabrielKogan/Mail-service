import { describe, expect, it } from 'vitest';
import { trackingListWhere } from '@/lib/dashboard-query';

describe('trackingListWhere', () => {
  it('no agrega filtro si no hay flags', () => {
    expect(trackingListWhere({})).toBeNull();
  });

  it('llegó incluye entregados y abiertos, y excluye rebotes', () => {
    const where = trackingListWhere({ llego: true });
    expect(where).toMatchObject({
      AND: [
        {
          OR: [
            { estadoActual: { in: ['entregado', 'abierto'] } },
            { mail_log_eventos: { some: { evento: 'entrega' } } },
          ],
        },
        {
          NOT: {
            OR: [
              { estadoActual: 'rebotado' },
              { mail_log_eventos: { some: { evento: 'rebote' } } },
            ],
          },
        },
      ],
    });
  });

  it('abiertos mira el estado y el evento de apertura', () => {
    expect(trackingListWhere({ abrio: true })).toEqual({
      OR: [
        { estadoActual: 'abierto' },
        { mail_log_eventos: { some: { evento: 'apertura' } } },
      ],
    });
  });
});
