import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin, isDashboardAuthorized } from '@/lib/auth';
import { corsPreflight, jsonWithCors } from '@/lib/cors';
import { removeFromSesSuppression } from '@/lib/aws/ses-account';
import { GLOBAL_SUPPRESSION_ORIGEN, reactivationRule } from '@/lib/mail/suppression';

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

type HistorialRow = {
  id: number;
  accion: string;
  motivo: string;
  origenAccion: string;
  responsable: string | null;
  nota: string | null;
  sesResultado: string | null;
  fecha: Date;
};

function historialItem(h: HistorialRow) {
  return {
    id: h.id,
    accion: h.accion,
    motivo: h.motivo,
    origenAccion: h.origenAccion,
    responsable: h.responsable,
    nota: h.nota,
    sesResultado: h.sesResultado,
    fecha: h.fecha,
  };
}

// GET /api/dashboard/supresion?q=&activo=&page=
// GET /api/dashboard/supresion?historial=<id>
export async function GET(req: NextRequest) {
  if (!isDashboardAuthorized(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  const historialId = searchParams.get('historial');
  if (historialId) {
    const id = Number(historialId);
    if (!Number.isInteger(id) || id <= 0) {
      return jsonWithCors(req, { error: 'Datos inválidos' }, { status: 400 });
    }
    const rows = await prisma.mail_supresion_historial.findMany({
      where: { supresionId: id },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
    return jsonWithCors(req, { items: rows.map(historialItem) });
  }

  const q = searchParams.get('q')?.trim() ?? '';
  const activoRaw = searchParams.get('activo')?.trim() ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = 25;

  const where: {
    email?: { contains: string };
    activo?: boolean;
  } = {};
  if (q) where.email = { contains: q };
  if (activoRaw === '1' || activoRaw === 'true') where.activo = true;
  if (activoRaw === '0' || activoRaw === 'false') where.activo = false;

  const [rows, total] = await Promise.all([
    prisma.mail_supresion.findMany({
      where,
      orderBy: { fecha: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { historial: { orderBy: { fecha: 'desc' }, take: 1 } },
    }),
    prisma.mail_supresion.count({ where }),
  ]);

  return jsonWithCors(req, {
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      origen: row.origen,
      motivo: row.motivo,
      mailLogId: row.mail_log_id,
      activo: row.activo,
      fecha: row.fecha,
      ultimaAccion: row.historial[0] ? historialItem(row.historial[0]) : null,
    })),
    total,
    page,
    pageSize,
  });
}

// PATCH /api/dashboard/supresion { id, activo, responsable, nota?, confirmar? }
export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) {
    return jsonWithCors(req, { error: 'No autorizado' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonWithCors(req, { error: 'JSON inválido' }, { status: 400 });
  }

  const id = Number(body?.id);
  const activo = body?.activo;
  if (!Number.isInteger(id) || id <= 0 || typeof activo !== 'boolean') {
    return jsonWithCors(req, { error: 'Datos inválidos' }, { status: 400 });
  }

  const current = await prisma.mail_supresion.findUnique({ where: { id } });
  if (!current) {
    return jsonWithCors(req, { error: 'No encontrado' }, { status: 404 });
  }

  // Volver a bloquear solo pide responsable; reactivar aplica las reglas por motivo.
  const decision = activo
    ? reactivationRule('baja', body)
    : reactivationRule(current.motivo, body);
  if (!decision.ok) {
    return jsonWithCors(
      req,
      {
        error: decision.error,
        ...(decision.requiereConfirmacion ? { requiereConfirmacion: true } : {}),
      },
      { status: decision.status }
    );
  }

  // SES va fuera de la transacción: una llamada de red no debe tener filas bloqueadas.
  let sesResultado: string | null = null;
  let advertencia: string | undefined;
  const syncSes =
    !activo &&
    current.origen === GLOBAL_SUPPRESSION_ORIGEN &&
    (current.motivo === 'rebote' || current.motivo === 'queja');
  if (syncSes) {
    const ses = await removeFromSesSuppression(current.email);
    sesResultado = ses.resultado;
    if (ses.resultado === 'error') {
      advertencia =
        `Se reactivó en el Mail Service, pero no se pudo quitar de la lista de supresión de SES (${ses.detalle}). ` +
        'Hasta que se quite, SES va a rechazar los envíos a esta dirección.';
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.mail_supresion.update({
      where: { id },
      data: { activo },
    });
    await tx.mail_supresion_historial.create({
      data: {
        supresionId: id,
        accion: activo ? 'bloquear' : 'reactivar',
        motivo: current.motivo,
        origenAccion: 'admin',
        responsable: decision.responsable,
        nota: decision.nota,
        sesResultado,
      },
    });
    return row;
  });

  return jsonWithCors(req, {
    ok: true,
    ...(advertencia ? { advertencia } : {}),
    sesResultado,
    item: {
      id: updated.id,
      email: updated.email,
      origen: updated.origen,
      motivo: updated.motivo,
      mailLogId: updated.mail_log_id,
      activo: updated.activo,
      fecha: updated.fecha,
    },
  });
}
