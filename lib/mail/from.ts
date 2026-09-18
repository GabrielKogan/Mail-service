const DEFAULT_FROM_EMAIL = 'registro@lujandecuyo.gob.ar';
const DEFAULT_FROM_NAME = 'Municipalidad de Lujan de Cuyo';

export function getMailFrom(): { email: string; name: string } {
  return {
    email: process.env.MAIL_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL,
    name: process.env.MAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME,
  };
}
