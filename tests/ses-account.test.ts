import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SESv2Client } from '@aws-sdk/client-sesv2';

const cfg = vi.hoisted(() => ({
  value: {
    mailProvider: 'ses' as string,
    awsRegion: 'eu-central-1' as string | undefined,
    sesConfigurationSet: 'mail-set' as string | undefined,
    mailFromEmail: 'registro@lujandecuyo.gob.ar',
  },
}));

vi.mock('@/lib/config', () => ({ config: () => cfg.value }));

const { removeFromSesSuppression, getSesAccountStatus, setSesClientForTests } = await import(
  '@/lib/aws/ses-account'
);

function fakeClient(handler: (command: { constructor: { name: string }; input: unknown }) => unknown) {
  const send = vi.fn(async (command: { constructor: { name: string }; input: unknown }) => handler(command));
  setSesClientForTests({ send } as unknown as SESv2Client);
  return send;
}

function awsError(name: string): Error {
  const err = new Error(`${name} simulado`);
  err.name = name;
  return err;
}

beforeEach(() => {
  cfg.value = {
    mailProvider: 'ses',
    awsRegion: 'eu-central-1',
    sesConfigurationSet: 'mail-set',
    mailFromEmail: 'registro@lujandecuyo.gob.ar',
  };
  setSesClientForTests(null);
});

describe('removeFromSesSuppression', () => {
  it('eliminada cuando SES la borra', async () => {
    const send = fakeClient(() => ({}));
    expect(await removeFromSesSuppression('vecino@example.com')).toEqual({ resultado: 'eliminada' });
    expect(send.mock.calls[0][0].constructor.name).toBe('DeleteSuppressedDestinationCommand');
    expect(send.mock.calls[0][0].input).toEqual({ EmailAddress: 'vecino@example.com' });
  });

  it('no_estaba cuando SES responde NotFoundException', async () => {
    fakeClient(() => {
      throw awsError('NotFoundException');
    });
    expect(await removeFromSesSuppression('vecino@example.com')).toEqual({ resultado: 'no_estaba' });
  });

  it('error con el detalle ante cualquier otra falla', async () => {
    fakeClient(() => {
      throw awsError('AccessDeniedException');
    });
    const r = await removeFromSesSuppression('vecino@example.com');
    expect(r.resultado).toBe('error');
    expect('detalle' in r && r.detalle).toContain('AccessDeniedException');
  });

  it.each([
    ['brevo', 'eu-central-1'],
    ['ses', undefined],
  ])('no_aplica con proveedor %s y región %s', async (mailProvider, awsRegion) => {
    cfg.value = { ...cfg.value, mailProvider, awsRegion };
    const send = fakeClient(() => ({}));
    expect(await removeFromSesSuppression('vecino@example.com')).toEqual({ resultado: 'no_aplica' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('getSesAccountStatus', () => {
  it('la supresión del configuration set reemplaza a la de la cuenta', async () => {
    fakeClient((c) =>
      c.constructor.name === 'GetAccountCommand'
        ? {
            ProductionAccessEnabled: true,
            SuppressionAttributes: { SuppressedReasons: ['BOUNCE', 'COMPLAINT'] },
          }
        : { SuppressionOptions: { SuppressedReasons: [] }, DeliveryOptions: { TlsPolicy: 'REQUIRE' } }
    );
    const s = await getSesAccountStatus(1_000);
    expect(s.accountSuppressedReasons).toEqual(['BOUNCE', 'COMPLAINT']);
    expect(s.effectiveSuppressedReasons).toEqual([]);
    expect(s.tlsPolicy).toBe('REQUIRE');
  });

  it('sin SuppressionOptions en el configuration set rige la de la cuenta, y se cachea', async () => {
    const send = fakeClient((c) =>
      c.constructor.name === 'GetAccountCommand'
        ? { SuppressionAttributes: { SuppressedReasons: ['COMPLAINT'] } }
        : {}
    );
    const s = await getSesAccountStatus(1_000);
    expect(s.effectiveSuppressedReasons).toEqual(['COMPLAINT']);
    expect(s.tlsPolicy).toBe('OPTIONAL');
    await getSesAccountStatus(1_000 + 60_000);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
