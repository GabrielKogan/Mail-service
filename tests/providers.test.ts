import { describe, expect, it, vi } from 'vitest';
import { buildRawMessage, isRetryableSesError } from '@/lib/mail/providers/ses-api';
import { isRetryableSmtpError } from '@/lib/mail/smtp-send';
import { BrevoProvider } from '@/lib/mail/providers/brevo';

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
