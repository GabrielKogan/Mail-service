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
    return reply({ error: 'No autorizado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = enviarMailSchema.safeParse(body);

  if (!parsed.success) {
    return reply(
      { error: 'Datos inválidos', detalle: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const resolved = await resolveOrigin(caller, parsed.data.origen);
  if (!resolved.ok) {
    return reply({ error: resolved.error, detalle: resolved.detalle }, { status: resolved.status });
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
      return reply(
        {
          error: `No existe la plantilla "${parsed.data.tipo}"`,
          detalle: `Tipos disponibles: ${PLANTILLAS.map((p) => p.tipo).join(', ')}. Ver GET /api/plantillas.`,
        },
        { status: 400 }
      );
    }
    const data = parsePlantillaData(plantilla, parsed.data.data);
    if (!data.ok) {
      return reply({ error: 'Datos de la plantilla inválidos', detalle: data.detalle }, { status: 400 });
    }
    const clasificacion = sistema?.clasificacion ?? (await clasificacionDe(origen, null));
    const check = checkPlantillaParaSistema(
      plantilla,
      { origen, clasificacion },
      { esAdmin: caller.kind === 'admin' }
    );
    if (!check.ok) return reply({ error: check.error }, { status: check.status });

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
          error: 'Este sistema no tiene permitido enviar HTML libre',
          detalle: 'Usá una plantilla: tipo + data (ver GET /api/plantillas).',
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
    try {
      await prisma.mailLog.create({
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
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raced = await replyExisting();
        if (raced) return raced;
      }
    }
    return reply(
      {
        error: 'Destinatario en lista de supresión',
        motivo: suppressed.motivo,
        origen: suppressed.origen,
        detalle,
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
    return reply(
      { error: 'No se pudo registrar el envío', detalle: mailErrorMessage(err) },
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
      { ok: true, id: logId, estado: 'en_cola', adjuntos: filenames },
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
        id: logId,
        messageId: result.messageId,
        adjuntos: filenames,
      });
    case 'suppressed':
      return reply(
        { error: 'Destinatario en lista de supresión', detalle: result.detalle, id: logId },
        { status: 422 }
      );
    case 'skipped':
      return reply({ ok: true, id: logId, estado: 'en_cola', adjuntos: filenames }, { status: 202 });
    case 'failed':
      return reply(
        { error: 'No se pudo enviar el mail', detalle: result.detalle, id: logId },
        { status: 502 }
      );
  }
}
