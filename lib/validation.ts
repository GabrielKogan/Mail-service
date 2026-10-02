import { z } from 'zod';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  base64ByteLength,
  isAllowedAttachment,
} from './attachment-limits';

export {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENTS_TOTAL_BYTES,
} from './attachment-limits';

const adjuntoSchema = z
  .object({
    filename: z
      .string()
      .min(1)
      .max(200)
      .refine((name) => !/[\\/]/.test(name), 'Nombre de archivo inválido'),
    contentType: z.string().min(1).max(120),
    contentBase64: z.string().min(1),
  })
  .superRefine((val, ctx) => {
    if (!isAllowedAttachment(val.filename, val.contentType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Tipo no permitido: ${val.filename}. Usá PDF, DOC, DOCX, PNG, JPG, GIF o WEBP.`,
        path: ['filename'],
      });
      return;
    }
    const bytes = base64ByteLength(val.contentBase64);
    if (bytes <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Archivo vacío',
        path: ['contentBase64'],
      });
    } else if (bytes > MAX_ATTACHMENT_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Cada archivo puede pesar hasta ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`,
        path: ['contentBase64'],
      });
    }
  });

const sinSaltos = /^[^\r\n]*$/;

export const enviarMailSchema = z
  .object({
    email: z.string().email(),
    nombre: z
      .string()
      .max(120)
      .regex(sinSaltos, 'El nombre no puede tener saltos de línea')
      .optional()
      .default(''),
    /** HTML libre: asunto + cuerpo (solo sistemas con permiteRawHtml). */
    asunto: z
      .string()
      .min(1)
      .max(200)
      .regex(sinSaltos, 'El asunto no puede tener saltos de línea')
      .optional(),
    cuerpo: z.string().min(1).optional(),
    /** Plantilla: tipo + data (ver GET /api/plantillas). */
    tipo: z.string().min(1).max(60).optional(),
    data: z.record(z.unknown()).optional(),
    /** Con clave de sistema es opcional: si se manda, tiene que coincidir con la credencial. */
    origen: z.string().max(120).optional(),
    /** Misma clave y mismo contenido devuelven el envío original sin reenviar. */
    idempotency_key: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/, 'Solo letras, números y . _ : -')
      .optional(),
    adjuntos: z.array(adjuntoSchema).max(MAX_ATTACHMENTS).optional().default([]),
  })
  .superRefine((val, ctx) => {
    const libre = val.asunto !== undefined || val.cuerpo !== undefined;
    const plantilla = val.tipo !== undefined || val.data !== undefined;
    if (libre && plantilla) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mandá tipo + data (plantilla) o asunto + cuerpo (HTML libre), no las dos cosas.',
        path: ['tipo'],
      });
    } else if (plantilla && !val.tipo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Falta tipo', path: ['tipo'] });
    } else if (!plantilla && (!val.asunto || !val.cuerpo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Faltan asunto y cuerpo (o tipo + data para usar una plantilla).',
        path: [val.asunto ? 'cuerpo' : 'asunto'],
      });
    }
  })
  .superRefine((val, ctx) => {
    if (!val.adjuntos?.length) return;
    let total = 0;
    for (const a of val.adjuntos) {
      total += base64ByteLength(a.contentBase64);
    }
    if (total > MAX_ATTACHMENTS_TOTAL_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `El total de adjuntos no puede superar ${MAX_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)} MB`,
        path: ['adjuntos'],
      });
    }
  });

const corsOriginSchema = z
  .string()
  .trim()
  .regex(/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i, 'Origen inválido (ej. https://turnos.lujandecuyo.gob.ar)');

export const sistemaCreateSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  origen: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{0,119}$/, 'Solo minúsculas, números, punto, guion y guion bajo'),
  clasificacion: z.enum(['transactional', 'subscription']),
  permiteRawHtml: z.boolean().optional().default(false),
  corsOrigins: z.array(corsOriginSchema).max(20).optional().default([]),
});

export const sistemaUpdateSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    clasificacion: z.enum(['transactional', 'subscription']),
    permiteRawHtml: z.boolean(),
    corsOrigins: z.array(corsOriginSchema).max(20),
    activo: z.boolean(),
  })
  .partial();

export type EnviarMailInput = z.infer<typeof enviarMailSchema>;
export type AdjuntoInput = z.infer<typeof adjuntoSchema>;
