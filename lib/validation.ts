import { z } from 'zod';

export const enviarMailSchema = z.object({
  email: z.string().email(),
  nombre: z.string().optional().default(''),
  asunto: z.string().min(1),
  cuerpo: z.string().min(1),
  origen: z.string().optional().default('desconocido'),
});

export type EnviarMailInput = z.infer<typeof enviarMailSchema>;
