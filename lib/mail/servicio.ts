export const SERVICIOS_MAIL = ['Gmail', 'Hotmail', 'Yahoo', 'Otros'] as const;

export type ServicioMail = (typeof SERVICIOS_MAIL)[number];

const DOMINIOS: Record<string, Exclude<ServicioMail, 'Otros'>> = {
  'gmail.com': 'Gmail',
  'googlemail.com': 'Gmail',
  'hotmail.com': 'Hotmail',
  'hotmail.com.ar': 'Hotmail',
  'hotmail.es': 'Hotmail',
  'outlook.com': 'Hotmail',
  'outlook.es': 'Hotmail',
  'live.com': 'Hotmail',
  'live.com.ar': 'Hotmail',
  'msn.com': 'Hotmail',
  'yahoo.com': 'Yahoo',
  'yahoo.com.ar': 'Yahoo',
  'yahoo.es': 'Yahoo',
  'ymail.com': 'Yahoo',
  'rocketmail.com': 'Yahoo',
  'aol.com': 'Yahoo',
};

export function servicioDeDestinatario(email: string | null | undefined): ServicioMail {
  const dominio = email?.split('@').pop()?.trim().toLowerCase() ?? '';
  return DOMINIOS[dominio] ?? 'Otros';
}

export function contarPorServicio(
  emails: Array<string | null | undefined>
): { servicio: ServicioMail; cantidad: number; porcentaje: number }[] {
  const counts = new Map<ServicioMail, number>(SERVICIOS_MAIL.map((s) => [s, 0]));
  for (const email of emails) {
    const servicio = servicioDeDestinatario(email);
    counts.set(servicio, (counts.get(servicio) ?? 0) + 1);
  }
  const total = emails.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  return SERVICIOS_MAIL.map((servicio) => ({
    servicio,
    cantidad: counts.get(servicio) ?? 0,
    porcentaje: pct(counts.get(servicio) ?? 0),
  })).filter((row) => row.cantidad > 0);
}
