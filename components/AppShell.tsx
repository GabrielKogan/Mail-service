'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '@/lib/client/token';

const links = [
  { href: '/', label: 'Inicio' },
  { href: '/enviar', label: 'Enviar' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/login') {
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
          <strong>Municipalidad de Luján de Cuyo</strong>
          <span>Mail Service</span>
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
          <button type="button" onClick={logout}>
            Salir
          </button>
        </nav>
      </header>
      {children}
    </>
  );
}
