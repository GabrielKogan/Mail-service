import { describe, expect, it, vi } from 'vitest';
import { MailProviderError } from '@/lib/mail/errors';
import { buildRawMessage, isRetryableSesError, isSesAvailabilityError, SesApiProvider } from '@/lib/mail/providers/ses-api';
import { SesWithBrevoFallback } from '@/lib/mail/providers/ses-brevo';
import { isRetryableSmtpError } from '@/lib/mail/smtp-send';
import { BrevoProvider } from '@/lib/mail/providers/brevo';
import { getMailProvider } from '@/lib/mail';
import type { MailMessage, MailProvider } from '@/lib/mail/types';

describe('clasificación de errores', () => {
  it('SES: límite de tasa y 5xx se reintentan; rechazos no', () => {
    expect(isRetryableSesError({ name: 'TooManyRequestsException' })).toBe(true);
    expect(isRetryableSesError({ name: 'X', $metadata: { httpStatusCode: 503 } })).toBe(true);
    expect(isRetryableSesError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableSesError({ name: 'MessageRejected', $metadata: { httpStatusCode: 400 } })).toBe(false);
    expect(
      isRetryableSesError({ name: 'MailFromDomainNotVerifiedException', $metadata: { httpStatusCode: 400 } })
    ).toBe(false);
  });

  it('SES: 5xx y red pasan a Brevo; un límite de tasa o un rechazo no', () => {
    const outage = new MailProviderError('SES ServiceUnavailable: down', {
      retryable: true,
      cause: { name: 'ServiceUnavailable', $metadata: { httpStatusCode: 503 } },
    });
    const throttle = new MailProviderError('SES TooManyRequestsException: slow', {
      retryable: true,
      cause: { name: 'TooManyRequestsException', $metadata: { httpStatusCode: 429 } },
    });
    const rejected = new MailProviderError('SES MessageRejected: no', {
      retryable: false,
      cause: { name: 'MessageRejected', $metadata: { httpStatusCode: 400 } },
    });
    expect(isSesAvailabilityError(outage)).toBe(true);
    expect(isSesAvailabilityError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isSesAvailabilityError(throttle)).toBe(false);
    expect(isSesAvailabilityError(rejected)).toBe(false);
  });

  it('SMTP: 4xx y red se reintentan; 5xx no', () => {
    expect(isRetryableSmtpError({ responseCode: 454 })).toBe(true);
    expect(isRetryableSmtpError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableSmtpError({ responseCode: 554 })).toBe(false);
  });
});

describe('buildRawMessage', () => {
  it('arma el MIME con cabeceras y adjuntos', async () => {
    const raw = (
      await buildRawMessage({
        to: 'vecino@example.com',
        toName: 'Vecino',
        subject: 'Prueba',
        html: '<p>Hola</p>',
        text: 'Hola',
        headers: { 'List-Unsubscribe': '<https://x/u>' },
        attachments: [{ filename: 'a.pdf', contentType: 'application/pdf', contentBase64: 'JVBERi0x' }],
      })
    ).toString('utf8');
    expect(raw).toContain('List-Unsubscribe: <https://x/u>');
    expect(raw).toContain('Hola');
    expect(raw).toContain('filename=a.pdf');
    expect(raw).toMatch(/To: Vecino <vecino@example.com>/);
  });
});

const message: MailMessage = {
  to: 'a@b.com',
  toName: '',
  subject: 'S',
  html: '<p>x</p>',
};

function provider(send: MailProvider['send']): MailProvider {
  return { send };
}

describe('SesWithBrevoFallback', () => {
  it('si SES acepta, no llama a Brevo', async () => {
    const brevo = vi.fn(async () => ({ messageId: 'brv-1' }));
    const result = await new SesWithBrevoFallback(
      provider(async () => ({ messageId: 'ses-1' })),
      provider(brevo)
    ).send(message);
    expect(result).toEqual({ messageId: 'ses-1' });
    expect(brevo).not.toHaveBeenCalled();
  });

  it('si SES cae, el mismo mensaje sale por Brevo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const brevo = vi.fn(async () => ({ messageId: 'brv-1' }));
    try {
      const result = await new SesWithBrevoFallback(
        provider(async () => {
          throw new MailProviderError('SES ServiceUnavailable: down', {
            retryable: true,
            cause: { name: 'ServiceUnavailable', $metadata: { httpStatusCode: 503 } },
          });
        }),
        provider(brevo)
      ).send(message);
      expect(result).toEqual({ messageId: 'brv-1', proveedor: 'brevo' });
      expect(brevo).toHaveBeenCalledWith(message);
    } finally {
      warn.mockRestore();
    }
  });

  it('un rechazo de SES no cambia de proveedor', async () => {
    const brevo = vi.fn(async () => ({ messageId: 'brv-1' }));
    await expect(
      new SesWithBrevoFallback(
        provider(async () => {
          throw new MailProviderError('SES MessageRejected: no', { retryable: false });
        }),
        provider(brevo)
      ).send(message)
    ).rejects.toThrow('MessageRejected');
    expect(brevo).not.toHaveBeenCalled();
  });

  it('si Brevo también falla, el error queda reintentable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(
        new SesWithBrevoFallback(
          provider(async () => {
            throw new MailProviderError('SES TimeoutError: timeout', {
              retryable: true,
              cause: { name: 'TimeoutError' },
            });
          }),
          provider(async () => {
            throw new MailProviderError('Brevo 503', { retryable: true });
          })
        ).send(message)
      ).rejects.toMatchObject({ retryable: true, message: expect.stringContaining('Brevo: Brevo 503') });
    } finally {
      warn.mockRestore();
    }
  });
});

describe('getMailProvider', () => {
  it('ses-api con BREVO_API_KEY deja a Brevo detrás de SES', () => {
    const prevProvider = process.env.MAIL_PROVIDER;
    const prevKey = process.env.BREVO_API_KEY;
    process.env.MAIL_PROVIDER = 'ses-api';
    process.env.BREVO_API_KEY = 'key';
    try {
      expect(getMailProvider()).toBeInstanceOf(SesWithBrevoFallback);
    } finally {
      process.env.MAIL_PROVIDER = prevProvider;
      if (prevKey === undefined) delete process.env.BREVO_API_KEY;
      else process.env.BREVO_API_KEY = prevKey;
    }
  });

  it('sin clave, ses-api sigue solo con SES', () => {
    const prevProvider = process.env.MAIL_PROVIDER;
    const prevKey = process.env.BREVO_API_KEY;
    process.env.MAIL_PROVIDER = 'ses-api';
    delete process.env.BREVO_API_KEY;
    try {
      expect(getMailProvider()).toBeInstanceOf(SesApiProvider);
    } finally {
      process.env.MAIL_PROVIDER = prevProvider;
      if (prevKey === undefined) delete process.env.BREVO_API_KEY;
      else process.env.BREVO_API_KEY = prevKey;
    }
  });
});

describe('BrevoProvider', () => {
  it('manda headers y textContent', async () => {
    process.env.BREVO_API_KEY = 'key';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ messageId: 'brv-1' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await new BrevoProvider().send({
        to: 'a@b.com',
        toName: '',
        subject: 'S',
        html: '<p>x</p>',
        text: 'x',
        headers: { 'Feedback-ID': 'html:panel:transactional:mlc' },
      });
      const calls = fetchMock.mock.calls as unknown as Array<[string, { body: string }]>;
      expect(calls[0]).toBeDefined();
      const body = JSON.parse(calls[0][1].body);
      expect(body.textContent).toBe('x');
      expect(body.headers['Feedback-ID']).toBe('html:panel:transactional:mlc');
    } finally {
      vi.unstubAllGlobals();
      delete process.env.BREVO_API_KEY;
    }
  });
});
