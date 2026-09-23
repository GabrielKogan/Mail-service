export function isPublicAppPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/baja' || pathname.startsWith('/baja/');
}
