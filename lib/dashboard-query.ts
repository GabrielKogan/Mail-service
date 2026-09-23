import { Prisma } from '@prisma/client';

export function parseDayEnd(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999`);
  }
  return new Date(value);
}

export function parseDayStart(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
}

export type DashboardFilters = {
  estado?: string | null;
  origen?: string | null;
  q?: string | null;
  desde?: string | null;
  hasta?: string | null;
};

export function buildMailLogWhere(
  filters: DashboardFilters
): Prisma.MailLogWhereInput {
  const where: Prisma.MailLogWhereInput = {};
  if (filters.estado) where.estadoActual = filters.estado;
  if (filters.origen) where.origen = filters.origen;
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { destinatario: { contains: q } },
      { asunto: { contains: q } },
    ];
  }
  if (filters.desde || filters.hasta) {
    where.fechaEnvio = {};
    if (filters.desde) where.fechaEnvio.gte = parseDayStart(filters.desde);
    if (filters.hasta) where.fechaEnvio.lte = parseDayEnd(filters.hasta);
  }
  return where;
}

export function filtersFromSearchParams(
  searchParams: URLSearchParams
): DashboardFilters {
  return {
    estado: searchParams.get('estado'),
    origen: searchParams.get('origen'),
    q: searchParams.get('q'),
    desde: searchParams.get('desde'),
    hasta: searchParams.get('hasta'),
  };
}
