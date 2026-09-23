'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/token';

type Item = {
  id: number;
  email: string;
  origen: string;
  motivo: string;
  mailLogId: number | null;
  activo: boolean;
  fecha: string;
};

type ListResponse = {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
};

function formatFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR');
}

function motivoLabel(motivo: string): string {
  switch (motivo) {
    case 'rebote':
      return 'Rebote permanente';
    case 'queja':
      return 'Queja / spam';
    case 'baja':
      return 'Baja del destinatario';
    default:
      return motivo;
  }
}

function origenLabel(origen: string): string {
  return origen === '*' ? 'Todos los orígenes' : origen;
}

export default function SupresionPage() {
  const [q, setQ] = useState('');
  const [activo, setActivo] = useState('1');
  const [applied, setApplied] = useState({ q: '', activo: '1' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(
    async (nextPage = page, filters = applied) => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        params.set('page', String(nextPage));
        if (filters.q) params.set('q', filters.q);
        if (filters.activo) params.set('activo', filters.activo);
        const res = await apiFetch(`/api/dashboard/supresion?${params}`);
        const json = (await res.json()) as ListResponse | { error?: string };
        if (!res.ok) {
          setError(
            'error' in json && json.error
              ? json.error
              : 'No se pudo cargar la lista'
          );
          return;
        }
        setData(json as ListResponse);
        setPage(nextPage);
      } catch {
        setError('Error de red al cargar la lista de supresión.');
      } finally {
        setLoading(false);
      }
    },
    [applied, page]
  );

  useEffect(() => {
    void load(1, applied);
    // Solo al montar / al cambiar filtros aplicados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    setApplied({ q: q.trim(), activo });
  }

  async function setActivoItem(item: Item, next: boolean) {
    setBusyId(item.id);
    setError('');
    try {
      const res = await apiFetch('/api/dashboard/supresion', {
        method: 'PATCH',
        body: JSON.stringify({ id: item.id, activo: next }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || 'No se pudo actualizar');
        return;
      }
      await load(page, applied);
    } catch {
      setError('Error de red al actualizar.');
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <main className="page">
      <header className="page-header">
        <h1>Lista de supresión</h1>
        <p className="muted">
          Direcciones que no se vuelven a enviar: rebote permanente y queja
          bloquean todos los orígenes; la baja solo el sistema que originó el
          mail. Reactivar sirve si una baja fue un error.
        </p>
      </header>

      <form className="filters" onSubmit={onFilter}>
        <label>
          Email
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="buscar destinatario"
          />
        </label>
        <label>
          Estado
          <select value={activo} onChange={(e) => setActivo(e.target.value)}>
            <option value="1">Activas</option>
            <option value="0">Inactivas</option>
            <option value="">Todas</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Filtrar
        </button>
      </form>

      {error ? <div className="alert error">{error}</div> : null}
      {loading && !data ? <p className="muted">Cargando…</p> : null}

      {data ? (
        <>
          <div className="table-wrap card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Origen</th>
                  <th>Motivo</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No hay registros con esos filtros.
                    </td>
                  </tr>
                ) : (
                  data.items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.email}</td>
                      <td>{origenLabel(row.origen)}</td>
                      <td>{motivoLabel(row.motivo)}</td>
                      <td>{formatFecha(row.fecha)}</td>
                      <td>
                        <span
                          className={`badge ${row.activo ? 'error' : 'enviado'}`}
                        >
                          {row.activo ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        {row.activo ? (
                          <button
                            className="btn secondary"
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void setActivoItem(row, false)}
                          >
                            {busyId === row.id ? '…' : 'Reactivar'}
                          </button>
                        ) : (
                          <button
                            className="btn"
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void setActivoItem(row, true)}
                          >
                            {busyId === row.id ? '…' : 'Volver a bloquear'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span className="muted">
              {data.total} registro{data.total === 1 ? '' : 's'} — página {page}{' '}
              de {totalPages}
            </span>
            <div className="actions" style={{ marginTop: 0 }}>
              <button
                className="btn secondary"
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => void load(page - 1)}
              >
                Anterior
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => void load(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
