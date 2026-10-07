import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { mailErrorMessage } from '@/lib/mail';
import { getMailFrom } from '@/lib/mail/from';
import {
  findActiveSuppression,
  suppressionErrorDetail,
} from '@/lib/mail/suppression';
import {
  computeRequestHash,
  findByIdempotencyKey,
  isUniqueViolation,
  replyForExisting,
  type HashableRequest,
} from '@/lib/mail/idempotency';
import {
  PLANTILLAS,
  checkPlantillaParaSistema,
  findPlantilla,
  parsePlantillaData,
  renderPlantilla,
} from '@/lib/mail/plantillas';
import { clasificacionDe } from '@/lib/mail/sistemas';
import { processSendJob, QUEUED_PREFIX } from '@/lib/mail/send-job';
import { recordInternalEvent } from '@/lib/mail/events';
import { enqueueSendJob } from '@/lib/queue/sqs';
import { formatValidationFailure, logEncolado, logEnviado, logSuprimido } from '@/lib/mail/client-log';
import { enviarMailSchema } from '@/lib/validation';
import { authenticateMailCaller, resolveOrigin, type MailCaller } from '@/lib/auth/caller';
import { globalCorsOrigins, jsonWithCors, mailCorsPreflight, type CorsAllowList } from '@/lib/cors';

export const runtime = 'nodejs';

export function OPTIONS(req: NextRequest) {
  return mailCorsPreflight(req);
}

function corsFor(caller: MailCaller | null): CorsAllowList {
  if (caller?.kind === 'system') {
    return caller.sistema.corsOrigins.length ? caller.sistema.corsOrigins : null;
  }
  return globalCorsOrigins();
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
  const caller = await authenticateMailCaller(req);
  const cors = corsFor(caller);
  const reply = (body: unknown, init?: ResponseInit) => jsonWithCors(req, body, init, cors);

  if (!caller) {
    return reply(
      {
        ok: false,
        codigo: 'no_autorizado',
        error: 'No autorizado',
        log: 'Rechazado: falta la clave o no es válida.',
      },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(
      {
        ok: false,
        codigo: 'json_invalido',
        error: 'JSON inválido',
        log: 'Rechazado: el cuerpo no es JSON válido.',
      },
      { status: 400 }
    );
  }

  const parsed = enviarMailSchema.safeParse(body);

  if (!parsed.success) {
    return reply(formatValidationFailure(parsed.error), { status: 400 });
  }

  const resolved = await resolveOrigin(caller, parsed.data.origen);
  if (!resolved.ok) {
    const codigo = resolved.status === 403 ? 'origen_no_coincide' : 'datos_invalidos';
    const detalle = resolved.detalle ? ` ${resolved.detalle}` : '';
    return reply(
      {
        ok: false,
        codigo,
        error: resolved.error,
        detalle: resolved.detalle,
        log: `Rechazado: ${resolved.error}.${detalle}`,
      },
      { status: resolved.status }
    );
  }
  const { origen, sistema } = resolved;
  const { email, nombre, adjuntos } = parsed.data;
  const filenames = adjuntos.map((a) => a.filename);

  let asunto: string;
  let html: string;
  let texto: string | null = null;
  let tipo: string | null = null;
  let plantillaVersion: number | null = null;
  let hashable: HashableRequest;

  if (parsed.data.tipo) {
    const plantilla = findPlantilla(parsed.data.tipo);
    if (!plantilla) {
      const tipos = PLANTILLAS.map((p) => p.tipo).join(', ');
      return reply(
        {
          ok: false,
          codigo: 'plantilla_inexistente',
          error: `No existe la plantilla "${parsed.data.tipo}"`,
          detalle: `Tipos disponibles: ${tipos}. Ver GET /api/plantillas.`,
          log: `Rechazado: no existe la plantilla "${parsed.data.tipo}".`,
        },
        { status: 400 }
      );
    }
    const data = parsePlantillaData(plantilla, parsed.data.data);
    if (!data.ok) {
      return reply(
        {
          ok: false,
          codigo: 'plantilla_invalida',
          error: 'Datos de la plantilla inválidos',
          detalle: data.detalle,
          log: `Rechazado: los datos de la plantilla "${parsed.data.tipo}" no son válidos.`,
        },
        { status: 400 }
      );
    }
    const clasificacion = sistema?.clasificacion ?? (await clasificacionDe(origen, null));
    const check = checkPlantillaParaSistema(
      plantilla,
      { origen, clasificacion },
      { esAdmin: caller.kind === 'admin' }
    );
    if (!check.ok) {
      return reply(
        {
          ok: false,
          codigo: 'plantilla_no_permitida',
          error: check.error,
          log: `Rechazado: ${check.error}`,
        },
        { status: check.status }
      );
    }

    const rendered = renderPlantilla(plantilla, data.data, nombre);
    asunto = rendered.asunto;
    html = rendered.html;
    texto = filenames.length
      ? `${rendered.texto}\n\nAdjuntos: ${filenames.join(', ')}`
      : rendered.texto;
    tipo = rendered.tipo;
    plantillaVersion = rendered.version;
    hashable = { email, tipo, data: data.data, nombre, adjuntos };
  } else {
    if (sistema && !sistema.permiteRawHtml) {
      return reply(
        {
          ok: false,
          codigo: 'html_libre_no_permitido',
          error: 'Este sistema no tiene permitido enviar HTML libre',
          detalle: 'Usá una plantilla: tipo + data (ver GET /api/plantillas).',
          log: 'Rechazado: este sistema no puede enviar HTML libre. Usá una plantilla (tipo + data).',
        },
        { status: 403 }
      );
    }
    asunto = parsed.data.asunto!;
    html = parsed.data.cuerpo!;
    hashable = { email, asunto, cuerpo: html, adjuntos };
  }

  const sistemaId = sistema?.sistemaId ?? null;
  const remitente = getMailFrom().email;
  const cuerpoLog = cuerpoConAdjuntos(html, filenames);

  // Sin sistema (token viejo con un origen no registrado) la clave no tiene ámbito y se ignora.
  const idempotencyKey = sistemaId != null ? (parsed.data.idempotency_key ?? null) : null;
  const requestHash = idempotencyKey ? computeRequestHash(hashable) : null;

  const replyExisting = async (): Promise<Response | null> => {
    if (sistemaId == null || !idempotencyKey || !requestHash) return null;
    const existing = await findByIdempotencyKey(sistemaId, idempotencyKey);
    if (!existing) return null;
    const { status, body } = replyForExisting(existing, requestHash);
    return reply(body, { status });
  };

  const earlier = await replyExisting();
  if (earlier) return earlier;

  const baseData = {
    destinatario: email,
    nombreDest: nombre,
    remitente,
    asunto,
    cuerpo: cuerpoLog,
    texto,
    tipo,
    plantillaVersion,
    origen,
    sistemaId,
    idempotencyKey,
    requestHash,
  };

  const suppressed = await findActiveSuppression(email, origen);
  if (suppressed) {
    const detalle = suppressionErrorDetail(suppressed);
    let suppressedId: number | undefined;
    try {
      const created = await prisma.mailLog.create({
        data: {
          ...baseData,
          messageId: `suppressed-${randomUUID()}`,
          estadoActual: 'suprimido',
          errorDetalle: detalle,
          mail_log_eventos: {
            create: [
              { evento: 'creado', fecha_evento: new Date() },
              {
                evento: 'suprimido',
                fecha_evento: new Date(),
                payload_raw: JSON.stringify({ detalle }),
              },
            ],
          },
        },
        select: { id: true },
      });
      suppressedId = created.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raced = await replyExisting();
        if (raced) return raced;
      }
    }
    return reply(
      {
        ok: false,
        codigo: 'destinatario_suprimido',
        error: 'Destinatario en lista de supresión',
        motivo: suppressed.motivo,
        origen: suppressed.origen,
        detalle,
        ...(suppressedId != null ? { id: suppressedId } : {}),
        log: logSuprimido({
          email,
          id: suppressedId,
          motivo: suppressed.motivo,
          detalle,
        }),
      },
      { status: 422 }
    );
  }

  const queueMode = config().mailSendMode === 'queue';

  let logId: number;
  try {
    const log = await prisma.mailLog.create({
      data: {
        ...baseData,
        messageId: `${QUEUED_PREFIX}${randomUUID()}`,
        estadoActual: 'en_cola',
        fechaEncolado: new Date(),
        adjuntos: {
          create: adjuntos.map((a, orden) => ({
            orden,
            filename: a.filename,
            contentType: a.contentType,
            contenido: Buffer.from(a.contentBase64, 'base64'),
          })),
        },
        mail_log_eventos: {
          create: [
            {
              evento: 'creado',
              fecha_evento: new Date(),
              payload_raw: JSON.stringify({ modo: queueMode ? 'queue' : 'sync' }),
            },
          ],
        },
      },
      select: { id: true },
    });
    logId = log.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const raced = await replyExisting();
      if (raced) return raced;
    }
    console.error('[api/mail] no se pudo registrar el envío', err);
    const detalle = mailErrorMessage(err);
    return reply(
      {
        ok: false,
        codigo: 'registro_fallido',
        error: 'No se pudo registrar el envío',
        detalle,
        log: `No se pudo registrar el envío a ${email}: ${detalle}`,
      },
      { status: 500 }
    );
  }

  if (queueMode) {
    try {
      await enqueueSendJob(logId);
      await recordInternalEvent(logId, 'encolado');
    } catch (err) {
      // El registro queda en_cola: el reconciliador del worker lo reencola.
      console.error('[api/mail] no se pudo encolar', logId, err);
    }
    return reply(
      {
        ok: true,
        codigo: 'encolado',
        id: logId,
        estado: 'en_cola',
        adjuntos: filenames,
        log: logEncolado({ id: logId, email, adjuntos: filenames }),
      },
      { status: 202 }
    );
  }

  let result;
  try {
    result = await processSendJob(logId, { allowRetry: false });
  } catch (err) {
    result = { status: 'failed' as const, detalle: mailErrorMessage(err) };
    await prisma.mailLog
      .updateMany({
        where: { id: logId, estadoActual: { in: ['en_cola', 'enviando'] } },
        data: { estadoActual: 'error', errorDetalle: result.detalle },
      })
      .catch(() => undefined);
  }

  switch (result.status) {
    case 'sent':
      return reply({
        ok: true,
        codigo: 'enviado',
        id: logId,
        estado: 'enviado',
        messageId: result.messageId,
        adjuntos: filenames,
        log: logEnviado({ id: logId, email, messageId: result.messageId, adjuntos: filenames }),
      });
    case 'suppressed':
      return reply(
        {
          ok: false,
          codigo: 'destinatario_suprimido',
          error: 'Destinatario en lista de supresión',
          detalle: result.detalle,
          id: logId,
          log: logSuprimido({ email, id: logId, detalle: result.detalle }),
        },
        { status: 422 }
      );
    case 'skipped':
      return reply(
        {
          ok: true,
          codigo: 'encolado',
          id: logId,
          estado: 'en_cola',
          adjuntos: filenames,
          log: logEncolado({ id: logId, email, adjuntos: filenames }),
        },
        { status: 202 }
      );
    case 'failed':
      return reply(
        {
          ok: false,
          codigo: 'envio_fallido',
          error: 'No se pudo enviar el mail',
          detalle: result.detalle,
          id: logId,
          log: `No se pudo enviar el mail (id ${logId}) a ${email}: ${result.detalle}`,
        },
        { status: 502 }
      );
  }
}
