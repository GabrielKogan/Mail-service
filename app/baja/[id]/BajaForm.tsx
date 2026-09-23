'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

type InfoOk = {
  ok: true;
  email: string;
  origen: string;
  critico: boolean;
  yaDadoDeBaja: boolean;
  permiteBaja: boolean;
  contacto: string;
};

type InfoErr = { error: string };

export function BajaForm() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const token = search.get('t') ?? '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<InfoOk | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `/api/t/unsub/${id}?t=${encodeURIComponent(token)}`
        );
        const data = (await res.json()) as InfoOk | InfoErr;
        if (cancelled) return;
        if (!res.ok || !('ok' in data) || !data.ok) {
          setError('error' in data ? data.error : 'Enlace inválido o vencido');
          return;
        }
        setInfo(data);
        if (data.yaDadoDeBaja) setDone(true);
      } catch {
        if (!cancelled) setError('No se pudo cargar el pedido de baja.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!info?.permiteBaja || done) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(
        `/api/t/unsub/${id}?t=${encodeURIComponent(token)}`,
        { method: 'POST' }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        critico?: boolean;
        error?: string;
      };
      if (data.critico) {
        setError(
          data.error ||
            'Este correo es una notificación oficial. No se puede dar de baja.'
        );
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error || 'No se pudo registrar la baja.');
        return;
      }
      setDone(true);
    } catch {
      setError('Error de red al registrar la baja.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Cancelar avisos</h1>
        {loading ? <p className="muted">Cargando…</p> : null}
        {!loading && error && !info ? (
          <div className="alert error">{error}</div>
        ) : null}
        {info ? (
          <>
            {info.critico ? (
              <>
                <p>
                  Este correo es una notificación oficial del sistema{' '}
                  <span className="code">{info.origen}</span> de la Municipalidad
                  de Luján de Cuyo. No se puede dar de baja de este tipo de avisos.
                </p>
                <p className="muted">
                  Si tenés dudas, escribinos a{' '}
                  <span className="code">{info.contacto}</span>.
                </p>
              </>
            ) : done ? (
              <>
                <div className="alert ok">
                  Ya no vas a recibir avisos de{' '}
                  <span className="code">{info.origen}</span> en {info.email}.
                </div>
                <p className="muted">
                  Otros sistemas municipales (por ejemplo turnos o expedientes)
                  pueden seguir escribiéndote si corresponde.
                </p>
              </>
            ) : (
              <form className="form" onSubmit={onSubmit}>
                <p>
                  Vas a dejar de recibir avisos del sistema{' '}
                  <span className="code">{info.origen}</span> en {info.email}.
                </p>
                <p className="muted">
                  No afecta notificaciones oficiales de otros sistemas
                  municipales.
                </p>
                {error ? <div className="alert error">{error}</div> : null}
                <button className="btn" type="submit" disabled={submitting}>
                  {submitting
                    ? 'Registrando…'
                    : 'Dejar de recibir avisos de este sistema'}
                </button>
              </form>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
