import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getMailProvider, mailErrorMessage } from '@/lib/mail';
import { getMailFrom } from '@/lib/mail/from';
import { enviarMailSchema } from '@/lib/validation';
import { isAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonWithCors(req, { error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = enviarMailSchema.safeParse(body);

  if (!parsed.success) {
    return jsonWithCors(
      req,
      { error: 'Datos inválidos', detalle: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, nombre, asunto, cuerpo, origen } = parsed.data;
  const remitente = getMailFrom().email;

  try {
    const { messageId } = await getMailProvider().send({
      to: email,
      toName: nombre,
      subject: asunto,
      html: cuerpo,
    });

    try {
      const log = await prisma.mailLog.create({
        data: {
          messageId,
          destinatario: email,
          nombreDest: nombre,
          remitente,
          asunto,
          cuerpo,
          origen,
          estadoActual: 'enviado',
        },
      });

      return jsonWithCors(req, { ok: true, id: log.id, messageId });
    } catch (dbErr) {
      return jsonWithCors(
        req,
        {
          error: 'Mail enviado, pero no se pudo registrar',
          detalle: mailErrorMessage(dbErr),
        },
        { status: 500 }
      );
    }
  } catch (err) {
    const detalle = mailErrorMessage(err);

    try {
      await prisma.mailLog.create({
        data: {
          messageId: `error-${Date.now()}`,
          destinatario: email,
          nombreDest: nombre,
          remitente,
          asunto,
          cuerpo,
          origen,
          estadoActual: 'error',
          errorDetalle: detalle,
        },
      });
    } catch {
      // El envío ya falló; no tapar el error original si el log también falla.
    }

    return jsonWithCors(
      req,
      { error: 'No se pudo enviar el mail', detalle },
      { status: 502 }
    );
  }
}
