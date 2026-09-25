'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken } from '@/lib/client/token';

export default function LoginPage() {
  const router = useRouter();
  const [token, setTokenValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const value = token.trim();
    if (!value) {
      setError('Ingresá el token de administración.');
      return;
    }
    setLoading(true);
    setToken(value);
    try {
      const res = await apiFetch('/api/dashboard?page=1');
      if (res.status === 401) {
        setError('Token inválido.');
        return;
      }
      if (!res.ok) {
        setError('No se pudo validar el token (¿SQL Server disponible?).');
        return;
      }
      router.replace('/');
    } catch {
      setError('No se pudo validar el token.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Ingreso</h1>
        <p className="muted">
          Usá el <span className="code">ADMIN_TOKEN</span> configurado en el
          servidor. Es distinto de las claves que usan los sistemas para enviar.
        </p>
        <form className="form" onSubmit={onSubmit} style={{ marginTop: 16 }}>
          <label>
            Token de administración
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setTokenValue(e.target.value)}
            />
          </label>
          {error ? <div className="alert error">{error}</div> : null}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Validando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
