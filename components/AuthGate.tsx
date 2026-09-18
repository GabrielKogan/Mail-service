'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getToken } from '@/lib/client/token';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(pathname === '/login');

  useEffect(() => {
    if (pathname === '/login') {
      setReady(true);
      return;
    }
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  if (!ready) {
    return <div className="page-loading muted">Cargando…</div>;
  }

  return <>{children}</>;
}
