/** `Licencia de conducir` → `licenciadeconducir`. */
export function buzonDeNombre(nombre: string): string {
  const sinAcento = nombre.normalize('NFD').replace(/\p{M}/gu, '');
  return sinAcento.toLowerCase().replace(/[^a-z0-9]/g, '');
}
