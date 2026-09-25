import { describe, expect, it } from 'vitest';
import { FEEDBACK_SENDER_ID, feedbackId } from '@/lib/mail/feedback-id';

describe('feedbackId', () => {
  it('arma tipo:origen:clasificacion:mlc', () => {
    expect(
      feedbackId({ tipo: 'turno_confirmacion', origen: 'turnos', clasificacion: 'transactional' })
    ).toBe(`turno_confirmacion:turnos:transactional:${FEEDBACK_SENDER_ID}`);
  });

  it('usa html cuando no hay plantilla y sanitiza', () => {
    expect(feedbackId({ tipo: null, origen: 'Expediente 12!', clasificacion: 'subscription' })).toBe(
      'html:expediente_12:subscription:mlc'
    );
  });

  it('no incluye ids de mensaje', () => {
    const v = feedbackId({ tipo: 'novedad', origen: 'novedades', clasificacion: 'subscription' });
    expect(v.split(':')).toHaveLength(4);
    expect(v).not.toMatch(/\d{5,}/);
  });
});
