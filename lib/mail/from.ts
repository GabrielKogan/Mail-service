import { config } from '@/lib/config';

const DEFAULT_FROM_EMAIL = 'registro@lujandecuyo.gob.ar';
const DEFAULT_FROM_NAME = 'Municipalidad de Lujan de Cuyo';

export function getMailFrom(): { email: string; name: string } {
  const cfg = config();
  return {
    email: cfg.mailFromEmail || DEFAULT_FROM_EMAIL,
    name: cfg.mailFromName || DEFAULT_FROM_NAME,
  };
}
