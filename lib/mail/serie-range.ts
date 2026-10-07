/** Días inclusive del gráfico diario cuando no hay rango elegido. */
export const SERIE_DIAS = 15;

export function isoDiaLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function rangoSerieInicial(now = new Date()): { desde: string; hasta: string } {
  const hasta = new Date(now);
  const desde = new Date(now);
  desde.setDate(desde.getDate() - (SERIE_DIAS - 1));
  return { desde: isoDiaLocal(desde), hasta: isoDiaLocal(hasta) };
}

function parseDayStart(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  return new Date(value);
}

function parseDayEnd(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T23:59:59.999`);
  return new Date(value);
}

export function defaultSerieRange(desde: string | null, hasta: string | null, now = new Date()) {
  if (desde || hasta) {
    return {
      desde: desde ? parseDayStart(desde) : undefined,
      hasta: hasta ? parseDayEnd(hasta) : undefined,
      esDefault15d: false,
    };
  }
  const inicial = rangoSerieInicial(now);
  return {
    desde: parseDayStart(inicial.desde),
    hasta: parseDayEnd(inicial.hasta),
    esDefault15d: true,
  };
}
