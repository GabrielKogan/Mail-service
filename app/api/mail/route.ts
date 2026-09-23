import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getMailProvider, mailErrorMessage } from '@/lib/mail';
import { getMailFrom } from '@/lib/mail/from';
import {
  findActiveSuppression,
  suppressionErrorDetail,
} from '@/lib/mail/suppression';
import {
  listUnsubscribeHeaders,
  normalizeMessageId,
  withOpenPixel,
  withUnsubscribeFooter,
} from '@/lib/mail/tracking';
import { enviarMailSchema } from '@/lib/validation';
import { isAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';

export const runtime = 'nodejs';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

function sesSendHeaders(
  mailLogId: number,
  extra?: Record<string, string>
): Record<string, string> | undefined {
  const configSet = process.env.SES_CONFIGURATION_SET?.trim();
  const headers: Record<string, string> = {
    'X-SES-MESSAGE-TAGS': `mail_log_id=${mailLogId}`,
    ...extra,
  };
  if (configSet) {
    headers['X-SES-CONFIGURATION-SET'] = configSet;
  }
  return headers;
}

function cuerpoConAdjuntos(
  cuerpo: string,
  filenames: string[]
): string {
  if (!filenames.length) return cuerpo;
  const list = filenames.map((f) => escapeHtml(f)).join(', ');
  return `${cuerpo}<p style="margin-top:1em;font-size:12px;color:#555"><em>Adjuntos: ${list}</em></p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  const { email, nombre, asunto, cuerpo, origen, adjuntos } = parsed.data;
  const remitente = getMailFrom().email;
  const provider = (process.env.MAIL_PROVIDER ?? 'ses').toLowerCase().trim();
  const filenames = adjuntos.map((a) => a.filename);
  const cuerpoLog = cuerpoConAdjuntos(cuerpo, filenames);

  const suppressed = await findActiveSuppression(email, origen);
  if (suppressed) {
    const detalle = suppressionErrorDetail(suppressed);
    try {
      await prisma.mailLog.create({
        data: {
          messageId: `suppressed-${randomUUID()}`,
          destinatario: email,
          nombreDest: nombre,
          remitente,
          asunto,
          cuerpo: cuerpoLog,
          origen,
          estadoActual: 'suprimido',
          errorDetalle: detalle,
        },
      });
    } catch {
      // ignore
    }
    return jsonWithCors(
      req,
      {
        error: 'Destinatario en lista de supresión',
        motivo: suppressed.motivo,
        origen: suppressed.origen,
        detalle,
      },
      { status: 422 }
    );
  }

  let logId: number | null = null;

  try {
    const pendingMessageId = `pending-${randomUUID()}`;
    const log = await prisma.mailLog.create({
      data: {
        messageId: pendingMessageId,
        destinatario: email,
        nombreDest: nombre,
        remitente,
        asunto,
        cuerpo: cuerpoLog,
        origen,
        estadoActual: 'enviado',
      },
    });
    logId = log.id;

    const html = withUnsubscribeFooter(
      withOpenPixel(cuerpoLog, log.id),
      log.id
    );
    const unsubHeaders = listUnsubscribeHeaders(log.id);
    const headers =
      provider === 'ses'
        ? sesSendHeaders(log.id, unsubHeaders)
        : unsubHeaders;

    const { messageId } = await getMailProvider().send({
      to: email,
      toName: nombre,
      subject: asunto,
      html,
      headers,
      attachments: adjuntos.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        contentBase64: a.contentBase64,
      })),
    });

    const finalId = normalizeMessageId(messageId);
    await prisma.mailLog.update({
      where: { id: log.id },
      data: {
        messageId: finalId,
        cuerpo: html,
      },
    });

    return jsonWithCors(req, {
      ok: true,
      id: log.id,
      messageId: finalId,
      adjuntos: filenames,
    });
  } catch (err) {
    const detalle = mailErrorMessage(err);

    if (logId != null) {
      try {
        await prisma.mailLog.update({
          where: { id: logId },
          data: {
            estadoActual: 'error',
            errorDetalle: detalle,
          },
        });
      } catch {
        // ignore
      }
    } else {
      try {
        await prisma.mailLog.create({
          data: {
            messageId: `error-${Date.now()}`,
            destinatario: email,
            nombreDest: nombre,
            remitente,
            asunto,
            cuerpo: cuerpoLog,
            origen,
            estadoActual: 'error',
            errorDetalle: detalle,
          },
        });
      } catch {
        // ignore
      }
    }

    return jsonWithCors(
      req,
      { error: 'No se pudo enviar el mail', detalle },
      { status: 502 }
    );
  }
}
