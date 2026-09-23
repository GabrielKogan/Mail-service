'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getToken } from '@/lib/client/token';
import { isPublicAppPath } from '@/lib/public-paths';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(isPublicAppPath(pathname));

  useEffect(() => {
    if (isPublicAppPath(pathname)) {
      setReady(true);
      return;
    }
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (isPublicAppPath(pathname)) {
    return <>{children}</>;
  }

  if (!ready) {
    return <div className="page-loading muted">Cargando…</div>;
  }

  return <>{children}</>;
}
