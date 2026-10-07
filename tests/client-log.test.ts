import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENTS_TOTAL_BYTES,
} from '@/lib/attachment-limits';
import { formatMb, formatValidationFailure } from '@/lib/mail/client-log';
import { enviarMailSchema } from '@/lib/validation';

const pdf = { filename: 'a.pdf', contentType: 'application/pdf', contentBase64: 'JVBERi0x' };

function base64ForBytes(bytes: number): string {
  return 'A'.repeat(Math.ceil(bytes / 3) * 4);
}

function failureOf(body: unknown) {
  const parsed = enviarMailSchema.safeParse(body);
  expect(parsed.success).toBe(false);
  if (parsed.success) throw new Error('se esperaba un rechazo');
  return formatValidationFailure(parsed.error);
}

describe('formatMb', () => {
  it('redondea a un decimal', () => {
    expect(formatMb(20 * 1024 * 1024)).toBe('20');
    expect(formatMb(23_000_000)).toBe('21.9');
  });
});

describe('límites de adjuntos', () => {
  it('rechaza un tipo no permitido', () => {
    const body = failureOf({
      email: 'a@b.com',
      asunto: 'A',
      cuerpo: '<p>x</p>',
      adjuntos: [{ filename: 'virus.exe', contentType: 'application/octet-stream', contentBase64: 'YQ==' }],
    });
    expect(body.codigo).toBe('tipo_adjunto_no_permitido');
    expect(body.log).toContain('virus.exe');
    expect(JSON.stringify(body)).not.toContain('YQ==');
  });

  it('rechaza un archivo de más de 20 MB', () => {
    const contentBase64 = base64ForBytes(21 * 1024 * 1024);
    const body = failureOf({
      email: 'a@b.com',
      asunto: 'A',
      cuerpo: '<p>x</p>',
      adjuntos: [{ filename: 'plano.pdf', contentType: 'application/pdf', contentBase64 }],
    });
    expect(body.codigo).toBe('adjunto_demasiado_grande');
    expect(body.error).toBe('Cada archivo puede pesar hasta 20 MB');
    expect(body.detalle).toEqual([
      expect.objectContaining({
        codigo: 'adjunto_demasiado_grande',
        archivo: 'plano.pdf',
        maxBytes: MAX_ATTACHMENT_BYTES,
      }),
    ]);
    expect(body.log).toContain('"plano.pdf" pesa 21 MB (máximo 20 MB)');
    expect(body.log).not.toContain(contentBase64.slice(0, 40));
  });

  it('rechaza más de 15 archivos', () => {
    const adjuntos = Array.from({ length: MAX_ATTACHMENTS + 1 }, () => pdf);
    const body = failureOf({
      email: 'a@b.com',
      asunto: 'A',
      cuerpo: '<p>x</p>',
      adjuntos,
    });
    expect(body.codigo).toBe('demasiados_adjuntos');
    expect(body.log).toContain('más de 15 archivos');
  });

  it('rechaza un total por encima de 28 MB', () => {
    const mitad = base64ForBytes(15 * 1024 * 1024);
    const body = failureOf({
      email: 'a@b.com',
      asunto: 'A',
      cuerpo: '<p>x</p>',
      adjuntos: [
        { filename: 'uno.pdf', contentType: 'application/pdf', contentBase64: mitad },
        { filename: 'dos.pdf', contentType: 'application/pdf', contentBase64: mitad },
      ],
    });
    expect(body.codigo).toBe('adjuntos_total_excedido');
    expect(body.log).toContain('máximo 28 MB');
    const detalle = body.detalle as { bytes: number; maxBytes: number }[];
    expect(detalle[0].bytes).toBeGreaterThan(MAX_ATTACHMENTS_TOTAL_BYTES);
    expect(detalle[0].maxBytes).toBe(MAX_ATTACHMENTS_TOTAL_BYTES);
    expect(JSON.stringify(body)).not.toContain(mitad.slice(0, 40));
  });

  it('prioriza el tipo y nombra los dos fallos', () => {
    const adjuntos = [
      { filename: 'virus.exe', contentType: 'application/octet-stream', contentBase64: 'YQ==' },
      ...Array.from({ length: MAX_ATTACHMENTS }, () => pdf),
    ];
    const body = failureOf({
      email: 'a@b.com',
      asunto: 'A',
      cuerpo: '<p>x</p>',
      adjuntos,
    });
    expect(body.codigo).toBe('tipo_adjunto_no_permitido');
    expect(body.log).toContain('virus.exe');
    expect(body.log).toContain('más de 15 archivos');
  });

  it('deja datos_invalidos cuando el fallo no es un adjunto', () => {
    const body = failureOf({ email: 'no-es-mail', asunto: 'A', cuerpo: '<p>x</p>' });
    expect(body.codigo).toBe('datos_invalidos');
    expect(body.log.startsWith('Rechazado:')).toBe(true);
    expect(body.detalle).toHaveProperty('fieldErrors');
  });
});
