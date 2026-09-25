import { arr, str } from './campos';
import type { Plantilla } from './tipos';

export const expedienteActualizacion: Plantilla = {
  tipo: 'expediente_actualizacion',
  version: 1,
  nombre: 'Actualización de expediente',
  descripcion: 'Cambio de estado de un expediente en el que la persona es interesada.',
  clasificacion: 'transactional',
  campos: [
    { nombre: 'numero', etiqueta: 'Número de expediente', tipo: 'linea', requerido: true, ejemplo: '12345/2026' },
    { nombre: 'estado', etiqueta: 'Estado', tipo: 'linea', requerido: true, ejemplo: 'Documentación recibida' },
    { nombre: 'detalle', etiqueta: 'Detalle', tipo: 'texto', ejemplo: 'La oficina de Catastro recibió los planos.' },
    { nombre: 'proximo_paso', etiqueta: 'Próximo paso', tipo: 'linea', ejemplo: 'Inspección en el domicilio' },
    { nombre: 'url', etiqueta: 'Enlace al expediente', tipo: 'url', ejemplo: 'https://expedientes.lujandecuyo.gob.ar/12345-2026' },
  ],
  asunto: (d) => `Actualización del expediente ${str(d, 'numero')}`,
  contenido: (d) => ({
    titulo: `Expediente ${str(d, 'numero')}`,
    parrafos: [
      'Hay una actualización en un expediente municipal en el que figurás como interesado.',
      ...(str(d, 'detalle') ? [str(d, 'detalle')] : []),
    ],
    datos: [
      { etiqueta: 'Estado', valor: str(d, 'estado') },
      ...(str(d, 'proximo_paso') ? [{ etiqueta: 'Próximo paso', valor: str(d, 'proximo_paso') }] : []),
    ],
    accion: str(d, 'url') ? { texto: 'Ver el expediente', url: str(d, 'url') } : undefined,
  }),
};

export const documentacionPendiente: Plantilla = {
  tipo: 'documentacion_pendiente',
  version: 1,
  nombre: 'Documentación pendiente',
  descripcion: 'Falta documentación para continuar un trámite.',
  clasificacion: 'transactional',
  campos: [
    { nombre: 'tramite', etiqueta: 'Trámite', tipo: 'linea', requerido: true, ejemplo: 'Habilitación comercial' },
    { nombre: 'documentos', etiqueta: 'Documentos que faltan', tipo: 'lista', requerido: true, ejemplo: ['Constancia de CUIT', 'Plano del local'] },
    { nombre: 'fecha_limite', etiqueta: 'Fecha límite', tipo: 'linea', ejemplo: '10/10/2026' },
    { nombre: 'donde', etiqueta: 'Dónde presentarla', tipo: 'linea', ejemplo: 'Mesa de entradas, San Martín 50' },
    { nombre: 'url', etiqueta: 'Enlace para cargarla', tipo: 'url', ejemplo: 'https://tramites.lujandecuyo.gob.ar' },
  ],
  asunto: (d) => `Documentación pendiente: ${str(d, 'tramite')}`,
  contenido: (d) => ({
    titulo: 'Falta documentación para tu trámite',
    parrafos: [`Para continuar con el trámite "${str(d, 'tramite')}" necesitamos la siguiente documentación:`],
    lista: arr(d, 'documentos'),
    datos: [
      ...(str(d, 'fecha_limite') ? [{ etiqueta: 'Fecha límite', valor: str(d, 'fecha_limite') }] : []),
      ...(str(d, 'donde') ? [{ etiqueta: 'Dónde presentarla', valor: str(d, 'donde') }] : []),
    ],
    accion: str(d, 'url') ? { texto: 'Cargar la documentación', url: str(d, 'url') } : undefined,
  }),
};

export const novedad: Plantilla = {
  tipo: 'novedad',
  version: 1,
  nombre: 'Novedad',
  descripcion: 'Aviso opcional para personas suscriptas. Lleva enlace de baja.',
  clasificacion: 'subscription',
  campos: [
    { nombre: 'titulo', etiqueta: 'Título', tipo: 'linea', requerido: true, ejemplo: 'Nuevo horario de atención' },
    { nombre: 'texto', etiqueta: 'Texto', tipo: 'texto', requerido: true, ejemplo: 'Desde el lunes, la oficina atiende de 8 a 14.\n\nTe esperamos.' },
    { nombre: 'url', etiqueta: 'Enlace', tipo: 'url', ejemplo: 'https://www.lujandecuyo.gob.ar/novedades' },
    { nombre: 'texto_enlace', etiqueta: 'Texto del botón', tipo: 'linea', ejemplo: 'Ver más' },
  ],
  asunto: (d) => str(d, 'titulo'),
  contenido: (d) => ({
    titulo: str(d, 'titulo'),
    parrafos: [str(d, 'texto')],
    accion: str(d, 'url') ? { texto: str(d, 'texto_enlace') || 'Ver más', url: str(d, 'url') } : undefined,
  }),
};
