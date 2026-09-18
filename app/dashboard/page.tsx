'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client/token';

type MailListItem = {
  id: number;
  messageId: string;
  destinatario: string;
  nombreDest: string | null;
  remitente: string;
  asunto: string;
  estadoActual: string;
  origen: string | null;
  fechaEnvio: string;
};

type MailDetail = MailListItem & {
  cuerpo: string | null;
  errorDetalle: string | null;
};

type ListResponse = {
  items: MailListItem[];
  total: number;
  page: number;
  pageSize: number;
};

function formatFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR');
}

export default function DashboardPage() {
  const [estado, setEstado] = useState('');
  const [origen, setOrigen] = useState('');
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const appliedRef = useRef({ estado: '', origen: '', q: '', desde: '', hasta: '' });

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError('');
    const applied = appliedRef.current;
    const params = new URLSearchParams();
    params.set('page', String(nextPage));
    if (applied.estado) params.set('estado', applied.estado);
    if (applied.origen) params.set('origen', applied.origen);
    if (applied.q) params.set('q', applied.q);
    if (applied.desde) params.set('desde', applied.desde);
    if (applied.hasta) params.set('hasta', applied.hasta);
    try {
      const res = await apiFetch(`/api/dashboard?${params.toString()}`);
      if (!res.ok) {
        setError('No se pudieron cargar los registros.');
        setData(null);
        return;
      }
      const json = (await res.json()) as ListResponse;
      setData(json);
      setPage(json.page);
    } catch {
      setError('Error de red al cargar el dashboard.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    appliedRef.current = {
      estado,
      origen: origen.trim(),
      q: q.trim(),
      desde,
      hasta,
    };
    void load(1);
  }

  async function openDetail(id: number) {
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/dashboard/${id}`);
      if (!res.ok) {
        setError('No se pudo abrir el detalle.');
        return;
      }
      setDetail((await res.json()) as MailDetail);
    } finally {
      setDetailLoading(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="page">
      <h1>Dashboard de mails</h1>
      <p className="muted">
        Registros de envío. El estado es el del momento de la API (enviado /
        error), sin tracking de entrega todavía.
      </p>

      <form className="filters" onSubmit={onFilter}>
        <label>
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="enviado">enviado</option>
            <option value="error">error</option>
          </select>
        </label>
        <label>
          Origen
          <input
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            placeholder="sistema"
          />
        </label>
        <label>
          Buscar
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="destinatario o asunto"
          />
        </label>
        <label>
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
        <button className="btn" type="submit">
          Filtrar
        </button>
      </form>

      {error ? <div className="alert error">{error}</div> : null}
      {loading ? <p className="muted">Cargando…</p> : null}

      {!loading && data && data.items.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No hay registros con esos filtros.
          </p>
        </div>
      ) : null}

      {!loading && data && data.items.length > 0 ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Destinatario</th>
                  <th>Asunto</th>
                  <th>Origen</th>
                  <th>Remitente</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr
                    key={row.id}
                    className="clickable"
                    onClick={() => void openDetail(row.id)}
                  >
                    <td>{formatFecha(row.fechaEnvio)}</td>
                    <td>{row.destinatario}</td>
                    <td>{row.asunto}</td>
                    <td>{row.origen ?? '—'}</td>
                    <td>{row.remitente || '—'}</td>
                    <td>
                      <span
                        className={`badge ${
                          row.estadoActual === 'error' ? 'error' : 'enviado'
                        }`}
                      >
                        {row.estadoActual}
                      </span>
                    </td>
                  </tr>
                ))}
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
                disabled={page <= 1}
                onClick={() => void load(page - 1)}
              >
                Anterior
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={page >= totalPages}
                onClick={() => void load(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      ) : null}

      {detailLoading && !detail ? (
        <p className="muted">Abriendo detalle…</p>
      ) : null}

      {detail ? (
        <div
          className="modal-backdrop"
          onClick={() => setDetail(null)}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-labelledby="detalle-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="detalle-titulo" style={{ marginTop: 0 }}>
              {detail.asunto}
            </h2>
            <p className="muted">
              {formatFecha(detail.fechaEnvio)} · {detail.destinatario}
              {detail.nombreDest ? ` (${detail.nombreDest})` : ''} · origen{' '}
              {detail.origen ?? '—'}
            </p>
            <p className="muted">De: {detail.remitente || '—'}</p>
            <p>
              Estado:{' '}
              <span
                className={`badge ${
                  detail.estadoActual === 'error' ? 'error' : 'enviado'
                }`}
              >
                {detail.estadoActual}
              </span>
            </p>
            <p className="muted">messageId: {detail.messageId}</p>
            {detail.errorDetalle ? (
              <div className="alert error">{detail.errorDetalle}</div>
            ) : null}
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Cuerpo</p>
            <div className="html-body">{detail.cuerpo || '—'}</div>
            <div className="actions">
              <button
                className="btn secondary"
                type="button"
                onClick={() => setDetail(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
