import type { Clasificacion } from '../sistemas';
import type { Campo, PlantillaData } from './campos';
import type { Contenido } from './layout';

export type Plantilla = {
  tipo: string;
  /** Subir cuando cambia el contenido: queda registrada en cada envío. */
  version: number;
  nombre: string;
  descripcion: string;
  clasificacion: Clasificacion;
  /** Si está, solo esos sistemas pueden usarla. */
  origenes?: string[];
  campos: Campo[];
  asunto: (data: PlantillaData) => string;
  contenido: (data: PlantillaData) => Contenido;
};
