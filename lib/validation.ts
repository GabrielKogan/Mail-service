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

export const enviarMailSchema = z
  .object({
    email: z.string().email(),
    nombre: z.string().optional().default(''),
    asunto: z.string().min(1),
    cuerpo: z.string().min(1),
    origen: z.string().optional().default('desconocido'),
    adjuntos: z.array(adjuntoSchema).max(MAX_ATTACHMENTS).optional().default([]),
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

export type EnviarMailInput = z.infer<typeof enviarMailSchema>;
export type AdjuntoInput = z.infer<typeof adjuntoSchema>;
