export type MailTemplate = {
  id: string;
  label: string;
  origen: string;
  asunto: string;
  cuerpo: string;
};

export const MAIL_TEMPLATES: MailTemplate[] = [
  {
    id: 'turno',
    label: 'Confirmación de turno',
    origen: 'turnos',
    asunto: 'Confirmación de turno — Municipalidad de Luján de Cuyo',
    cuerpo: `<p>Hola Juan Pérez,</p>
<p>Confirmamos tu turno en la Municipalidad de Luján de Cuyo.</p>
<ul>
  <li>Área: Registro Civil</li>
  <li>Fecha: 25/09/2026 — 10:00</li>
  <li>Lugar: San Martín 50, Luján de Cuyo</li>
</ul>
<p>Si no podés asistir, reprogramalo desde el sistema de turnos o escribinos a registro@lujandecuyo.gob.ar.</p>
<p>Municipalidad de Luján de Cuyo<br>https://www.lujandecuyo.gob.ar</p>`,
  },
  {
    id: 'expediente',
    label: 'Actualización de trámite',
    origen: 'expediente',
    asunto: 'Actualización de tu trámite N.º 12345',
    cuerpo: `<p>Hola María Gómez,</p>
<p>Hay una actualización en tu trámite municipal N.º 12345.</p>
<p>Estado: documentación recibida. El próximo paso se informará por este medio.</p>
<p>Este correo es una notificación del expediente en el que figurás como interesado.</p>
<p>Municipalidad de Luján de Cuyo<br>registro@lujandecuyo.gob.ar</p>`,
  },
  {
    id: 'recordatorio',
    label: 'Recordatorio de documentación',
    origen: 'recordatorio',
    asunto: 'Recordatorio: vencimiento de documentación',
    cuerpo: `<p>Hola,</p>
<p>Te recordamos que hay documentación pendiente asociada a tu trámite municipal.</p>
<p>Por favor acercate o cargala antes de la fecha indicada en el sistema.</p>
<p>Municipalidad de Luján de Cuyo</p>`,
  },
];
