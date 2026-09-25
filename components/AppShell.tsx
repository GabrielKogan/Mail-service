'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '@/lib/client/token';
import { isPublicAppPath } from '@/lib/public-paths';

const links = [
  { href: '/', label: 'Inicio' },
  { href: '/enviar', label: 'Enviar' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/supresion', label: 'Supresión' },
  { href: '/sistemas', label: 'Sistemas' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (isPublicAppPath(pathname)) {
    return <>{children}</>;
  }

  function logout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <>
      <header className="shell-header">
        <div className="shell-brand">
          <span className="shell-mark" aria-hidden>
            ML
          </span>
          <div className="shell-brand-text">
            <strong>Municipalidad de Luján de Cuyo</strong>
            <span>Mail Service</span>
          </div>
        </div>
        <nav className="shell-nav">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? 'active' : undefined}
            >
              {link.label}
            </Link>
          ))}
          <button type="button" className="shell-logout" onClick={logout}>
            Salir
          </button>
        </nav>
      </header>
      {children}
    </>
  );
}
