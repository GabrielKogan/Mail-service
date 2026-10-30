import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({
  value: {
    awsRegion: 'eu-central-1',
    sesConfigurationSet: 'mail-set' as string | undefined,
    sesEndpointId: 'abcd12.g3h' as string | undefined,
  },
}));

const send = vi.hoisted(() =>
  vi.fn(async (_cmd: { input: { EndpointId?: string } }) => ({ MessageId: 'ses-1' }))
);

vi.mock('@/lib/config', () => ({ config: () => cfg.value }));
vi.mock('@/lib/mail/from', () => ({
  getMailFrom: () => ({ name: 'Municipio', email: 'no-reply@lujandecuyo.gob.ar' }),
}));
vi.mock('@/lib/aws/ses-account', () => ({ sesClient: () => ({ send }) }));

const { SesApiProvider } = await import('@/lib/mail/providers/ses-api');

beforeEach(() => {
  send.mockClear();
  cfg.value.sesEndpointId = 'abcd12.g3h';
});

describe('SesApiProvider', () => {
  it('manda el EndpointId del global endpoint', async () => {
    await new SesApiProvider().send({
      to: 'vecino@example.com',
      toName: '',
      subject: 'Aviso',
      html: '<p>Hola</p>',
    });
    expect(send.mock.calls[0]?.[0].input.EndpointId).toBe('abcd12.g3h');
  });

  it('omite el EndpointId si no hay región de respaldo', async () => {
    cfg.value.sesEndpointId = undefined;
    await new SesApiProvider().send({
      to: 'vecino@example.com',
      toName: '',
      subject: 'Aviso',
      html: '<p>Hola</p>',
    });
    expect(send.mock.calls[0]?.[0].input.EndpointId).toBeUndefined();
  });
});
