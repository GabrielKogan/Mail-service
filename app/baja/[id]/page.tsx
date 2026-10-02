import { Suspense } from 'react';
import { BajaForm } from './BajaForm';

export default function BajaPage() {
  return (
    <Suspense
      fallback={
        <div className="login-wrap">
          <div className="card login-card">
            <p className="muted">Cargando…</p>
          </div>
        </div>
      }
    >
      <BajaForm />
    </Suspense>
  );
}
