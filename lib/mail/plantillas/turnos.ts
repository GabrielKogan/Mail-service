import { str, type Campo, type PlantillaData } from './campos';
import type { Contenido } from './layout';
import type { Plantilla } from './tipos';

const camposTurno: Campo[] = [
  { nombre: 'area', etiqueta: 'Área u oficina', tipo: 'linea', requerido: true, ejemplo: 'Registro Civil' },
  { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'linea', requerido: true, ejemplo: '25/09/2026', ayuda: 'Como se muestra al vecino (dd/mm/aaaa).' },
  { nombre: 'hora', etiqueta: 'Hora', tipo: 'linea', requerido: true, ejemplo: '10:00' },
  { nombre: 'lugar', etiqueta: 'Lugar', tipo: 'linea', requerido: true, ejemplo: 'San Martín 50, Luján de Cuyo' },
  { nombre: 'indicaciones', etiqueta: 'Indicaciones', tipo: 'texto', ejemplo: 'Traé tu DNI.' },
  { nombre: 'url_gestion', etiqueta: 'Enlace para reprogramar o cancelar', tipo: 'url', ejemplo: 'https://turnos.lujandecuyo.gob.ar/mis-turnos' },
];

function datosTurno(d: PlantillaData) {
  return [
    { etiqueta: 'Área', valor: str(d, 'area') },
    { etiqueta: 'Fecha', valor: `${str(d, 'fecha')} — ${str(d, 'hora')}` },
    { etiqueta: 'Lugar', valor: str(d, 'lugar') },
  ];
}

function contenidoTurno(d: PlantillaData, titulo: string, intro: string): Contenido {
  const url = str(d, 'url_gestion');
  return {
    titulo,
    parrafos: [intro, ...(str(d, 'indicaciones') ? [str(d, 'indicaciones')] : [])],
    datos: datosTurno(d),
    accion: url ? { texto: 'Reprogramar o cancelar', url } : undefined,
    nota: 'Si no podés asistir, avisá con anticipación para liberar el turno.',
  };
}

export const turnoConfirmacion: Plantilla = {
  tipo: 'turno_confirmacion',
  version: 1,
  nombre: 'Confirmación de turno',
  descripcion: 'Se envía al reservar un turno.',
  clasificacion: 'transactional',
  origenes: ['turnos'],
  campos: camposTurno,
  asunto: (d) => `Turno confirmado: ${str(d, 'area')}, ${str(d, 'fecha')} ${str(d, 'hora')}`,
  contenido: (d) =>
    contenidoTurno(d, 'Tu turno está confirmado', 'Confirmamos tu turno en la Municipalidad de Luján de Cuyo.'),
};

export const turnoRecordatorio: Plantilla = {
  tipo: 'turno_recordatorio',
  version: 1,
  nombre: 'Recordatorio de turno',
  descripcion: 'Se envía antes de la fecha del turno.',
  clasificacion: 'transactional',
  origenes: ['turnos'],
  campos: camposTurno,
  asunto: (d) => `Recordatorio de turno: ${str(d, 'area')}, ${str(d, 'fecha')} ${str(d, 'hora')}`,
  contenido: (d) =>
    contenidoTurno(d, 'Recordatorio de tu turno', 'Te recordamos que tenés un turno en la Municipalidad de Luján de Cuyo.'),
};
