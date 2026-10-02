'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client/token';
import {
  DashboardStats,
  type StatsData,
} from '@/components/DashboardStats';
import { PostmasterCard } from '@/components/PostmasterCard';

type Tab = 'stats' | 'registro';

type MailListItem = {
  id: number;
  messageId: string;
  destinatario: string;
  nombreDest: string | null;
  remitente: string;
  asunto: string;
  estadoActual: string;
  origen: string | null;
  tipo?: string | null;
  fechaEnvio: string;
  llego?: boolean;
  abrio?: boolean;
  rebotado?: boolean;
  fechaEntrega?: string | null;
  fechaApertura?: string | null;
};

type MailDetail = MailListItem & {
  cuerpo: string | null;
  errorDetalle: string | null;
  eventos?: {
    id: number;
    evento: string;
    fechaEvento: string;
    ip: string | null;
    userAgent: string | null;
    interno?: boolean;
    detalle?: string | null;
  }[];
};

const EVENTO_LABELS: Record<string, string> = {
  creado: 'Registrado',
  encolado: 'En la cola de envío',
  enviando: 'Enviando al proveedor',
  aceptado: 'Aceptado por el proveedor',
  reintento: 'Falló, se reintenta',
  fallo: 'Falló el envío',
  suprimido: 'No enviado: destinatario suprimido',
  revisar: 'A revisar (quedó en "enviando")',
  agotado: 'Agotó los reintentos',
  reencolado_auto: 'Reencolado por el reconciliador',
  reencolado: 'Reencolado desde el dashboard',
  envio_ses: 'SES lo envió',
  entrega: 'Entregado',
  apertura: 'Abierto',
  click: 'Click en un enlace',
  rebote: 'Rebote',
  queja: 'Queja de spam',
  rechazo: 'Rechazado por SES',
  demora: 'Entrega demorada',
  fallo_render: 'Falló el renderizado',
  baja: 'Baja del destinatario',
};

function eventoLabel(evento: string): string {
  return EVENTO_LABELS[evento] ?? evento;
}

type ListResponse = {
  items: MailListItem[];
  total: number;
  page: number;
  pageSize: number;
  tracking?: {
    enabled: boolean;
    baseUrl: string | null;
    isPublic: boolean;
  };
  sesConfigSet?: boolean;
};

type WorkerStatus = {
  modo: 'sync' | 'queue';
  workers: { worker: string; ultimoLatido: string; activo: boolean }[];
  alerta: boolean;
  enCola: number;
  revisar: number;
};

function formatFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR');
}

function badgeClass(estado: string): string {
  if (
    estado === 'error' ||
    estado === 'rebotado' ||
    estado === 'queja' ||
    estado === 'rechazado' ||
    estado === 'suprimido'
  ) {
    return 'error';
  }
  if (estado === 'abierto') return 'abierto';
  if (estado === 'entregado') return 'entregado';
  if (estado === 'en_cola' || estado === 'enviando') return 'pendiente';
  if (estado === 'revisar') return 'revisar';
  return 'enviado';
}

function estadoLabel(estado: string): string {
  switch (estado) {
    case 'enviado':
      return 'Enviado (SES aceptó)';
    case 'entregado':
      return 'Entregado (llegó al buzón)';
    case 'abierto':
      return 'Abierto';
    case 'rebotado':
      return 'Rebotado';
    case 'queja':
      return 'Queja / spam';
    case 'error':
      return 'Error al enviar';
    case 'suprimido':
      return 'Suprimido (no enviado)';
    case 'en_cola':
      return 'En cola';
    case 'enviando':
      return 'Enviando';
    case 'revisar':
      return 'Revisar (no se sabe si salió)';
    default:
      return estado;
  }
}

function siNo(value: boolean | undefined, unknownLabel = 'Sin dato'): string {
  if (value === true) return 'Sí';
  if (value === false) return 'No';
  return unknownLabel;
}

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>('stats');
  const [estado, setEstado] = useState('');
  const [origen, setOrigen] = useState('');
  const [tipo, setTipo] = useState('');
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [markingOpen, setMarkingOpen] = useState(false);
  const [markingDeliver, setMarkingDeliver] = useState(false);
  const [listMeta, setListMeta] = useState<{
    tracking?: ListResponse['tracking'];
    sesConfigSet?: boolean;
  }>({});
  const [origenDia, setOrigenDia] = useState('__all__');
  const [requeueing, setRequeueing] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const appliedRef = useRef({
    estado: '',
    origen: '',
    tipo: '',
    q: '',
    desde: '',
    hasta: '',
  });
  const origenDiaRef = useRef(origenDia);
  origenDiaRef.current = origenDia;

  const filterParams = useCallback(() => {
    const applied = appliedRef.current;
    const params = new URLSearchParams();
    if (applied.estado) params.set('estado', applied.estado);
    if (applied.origen) params.set('origen', applied.origen);
    if (applied.tipo) params.set('tipo', applied.tipo);
    if (applied.q) params.set('q', applied.q);
    if (applied.desde) params.set('desde', applied.desde);
    if (applied.hasta) params.set('hasta', applied.hasta);
    return params;
  }, []);

  const loadStats = useCallback(
    async (origenDiaOverride?: string) => {
      setLoadingStats(true);
      setError('');
      try {
        const params = filterParams();
        const od = origenDiaOverride ?? origenDiaRef.current;
        params.set('origenDia', od || '__all__');
        const res = await apiFetch(`/api/dashboard/stats?${params.toString()}`);
        if (!res.ok) {
          setError('No se pudieron cargar las estadísticas.');
          setStats(null);
          return;
        }
        setStats((await res.json()) as StatsData);
      } catch {
        setError('Error de red al cargar estadísticas.');
        setStats(null);
      } finally {
        setLoadingStats(false);
      }
    },
    [filterParams]
  );

  const loadList = useCallback(
    async (nextPage: number) => {
      setLoadingList(true);
      setError('');
      try {
        const params = filterParams();
        params.set('page', String(nextPage));
        const res = await apiFetch(`/api/dashboard?${params.toString()}`);
        if (!res.ok) {
          setError('No se pudieron cargar los registros.');
          setData(null);
          return;
        }
        const json = (await res.json()) as ListResponse;
        setData(json);
        setPage(json.page);
        setListMeta({
          tracking: json.tracking,
          sesConfigSet: json.sesConfigSet,
        });
      } catch {
        setError('Error de red al cargar el dashboard.');
        setData(null);
      } finally {
        setLoadingList(false);
      }
    },
    [filterParams]
  );

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    apiFetch('/api/dashboard/worker')
      .then((res) => (res.ok ? (res.json() as Promise<WorkerStatus>) : null))
      .then(setWorkerStatus)
      .catch(() => setWorkerStatus(null));
  }, []);

  useEffect(() => {
    if (tab === 'registro' && data === null && !loadingList) {
      void loadList(1);
    }
  }, [tab, data, loadingList, loadList]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    appliedRef.current = {
      estado,
      origen: origen.trim(),
      tipo: tipo.trim(),
      q: q.trim(),
      desde,
      hasta,
    };
    void loadStats();
    if (tab === 'registro') {
      void loadList(1);
    } else {
      setData(null);
    }
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

  async function markOpen() {
    if (!detail) return;
    setMarkingOpen(true);
    setError('');
    try {
      const res = await apiFetch(`/api/dashboard/${detail.id}/open`, {
        method: 'POST',
      });
      if (!res.ok) {
        setError('No se pudo registrar la apertura.');
        return;
      }
      const updated = (await res.json()) as MailDetail;
      setDetail({
        ...updated,
        llego: true,
        abrio: true,
      });
      void loadStats();
      if (tab === 'registro') void loadList(page);
    } catch {
      setError('Error de red al registrar apertura.');
    } finally {
      setMarkingOpen(false);
    }
  }

  async function markDeliver() {
    if (!detail) return;
    setMarkingDeliver(true);
    setError('');
    try {
      const res = await apiFetch(`/api/dashboard/${detail.id}/deliver`, {
        method: 'POST',
      });
      if (!res.ok) {
        setError('No se pudo registrar la entrega.');
        return;
      }
      const updated = (await res.json()) as MailDetail;
      setDetail({
        ...updated,
        llego: true,
        abrio:
          updated.estadoActual === 'abierto' ||
          updated.eventos?.some((e) => e.evento === 'apertura'),
      });
      void loadStats();
      if (tab === 'registro') void loadList(page);
    } catch {
      setError('Error de red al registrar entrega.');
    } finally {
      setMarkingDeliver(false);
    }
  }

  async function requeue() {
    if (!detail) return;
    const confirmar = detail.estadoActual === 'revisar';
    if (
      confirmar &&
      !window.confirm(
        'No se sabe si SES llegó a enviar este mail. Si lo reencolás, el destinatario podría recibirlo dos veces. ¿Reencolar igual?'
      )
    ) {
      return;
    }
    setRequeueing(true);
    setError('');
    try {
      const res = await apiFetch(`/api/dashboard/${detail.id}/requeue`, {
        method: 'POST',
        body: JSON.stringify({ confirmar }),
      });
      const json = (await res.json()) as { error?: string; detalle?: string };
      if (!res.ok) {
        setError([json.error || 'No se pudo reencolar', json.detalle].filter(Boolean).join(': '));
        return;
      }
      await openDetail(detail.id);
      void loadStats();
      if (tab === 'registro') void loadList(page);
    } catch {
      setError('Error de red al reencolar.');
    } finally {
      setRequeueing(false);
    }
  }

  function filterByEstado(value: string) {
    setEstado(value);
    appliedRef.current = {
      ...appliedRef.current,
      estado: value,
    };
    void loadStats();
    void loadList(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="page">
      <header className="page-header">
        <h1>Dashboard de mails</h1>
        <p className="muted">
          Estadísticas y registro de envíos. Filtrá por estado, origen o fechas y
          cambiá de pestaña.
        </p>
      </header>

      <div className="tabs" role="tablist" aria-label="Vistas del dashboard">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'stats'}
          className={`tab${tab === 'stats' ? ' active' : ''}`}
          onClick={() => setTab('stats')}
        >
          Estadísticas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'registro'}
          className={`tab${tab === 'registro' ? ' active' : ''}`}
          onClick={() => {
            setTab('registro');
            if (data === null) void loadList(1);
          }}
        >
          Registro
        </button>
      </div>

      <form className="filters" onSubmit={onFilter}>
        <label>
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="enviado">enviado</option>
            <option value="entregado">entregado</option>
            <option value="abierto">abierto</option>
            <option value="rebotado">rebotado</option>
            <option value="queja">queja</option>
            <option value="suprimido">suprimido</option>
            <option value="error">error</option>
            <option value="en_cola">en cola</option>
            <option value="enviando">enviando</option>
            <option value="revisar">revisar</option>
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
          Tipo
          <input
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            placeholder="turno_confirmacion"
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
      {workerStatus?.alerta ? (
        <div className="alert error">
          El worker no está activo
          {workerStatus.workers[0]
            ? ` (último latido: ${formatFecha(workerStatus.workers[0].ultimoLatido)})`
            : ' (nunca registró actividad)'}
          . Los envíos en cola ({workerStatus.enCola}) y los eventos de SES quedan sin procesar.
        </div>
      ) : null}
      {workerStatus && workerStatus.revisar > 0 ? (
        <div className="alert warn">
          Hay {workerStatus.revisar} envío(s) en <strong>revisar</strong>: quedaron a mitad
          del envío y no se sabe si salieron. Filtrá por ese estado para verlos.
        </div>
      ) : null}

      {tab === 'stats' ? (
        <>
        <PostmasterCard />
        <DashboardStats
          data={stats}
          loading={loadingStats}
          origenDia={origenDia}
          onOrigenDiaChange={(value) => {
            setOrigenDia(value);
            void loadStats(value);
          }}
        />
        </>
      ) : (
        <>
          <div className="alert warn">
            <strong>Cómo se sabe si llegó o se abrió</strong>
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
              <li>
                <strong>Enviado</strong>: SES aceptó el mail (no garantiza
                bandeja de entrada).
              </li>
              <li>
                <strong>Llegó (entregado)</strong>: requiere Configuration Set +
                SNS en AWS (
                <span className="code">SES_CONFIGURATION_SET</span>
                ). Ahora:{' '}
                {listMeta.sesConfigSet ? 'configurado' : 'no configurado'}.
              </li>
              <li>
                <strong>Abrió</strong>: requiere{' '}
                <span className="code">APP_BASE_URL</span> público (no
                localhost). Ahora:{' '}
                {listMeta.tracking?.isPublic
                  ? listMeta.tracking.baseUrl
                  : listMeta.tracking?.baseUrl || 'localhost / sin URL'}
                .
              </li>
            </ul>
            Sin eso, las columnas quedan en &quot;Sin dato&quot;. Podés marcar a
            mano en el detalle para probar la UI, o filtrar abajo por estado.
          </div>

          <div className="actions" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
            <button
              type="button"
              className={`btn secondary${estado === '' ? '' : ''}`}
              onClick={() => filterByEstado('')}
            >
              Todos
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => filterByEstado('entregado')}
            >
              Solo llegaron
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => filterByEstado('abierto')}
            >
              Solo abiertos
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => filterByEstado('enviado')}
            >
              Solo enviados (sin tracking)
            </button>
          </div>

          {loadingList ? <p className="muted">Cargando…</p> : null}

          {!loadingList && data && data.items.length === 0 ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                No hay registros con esos filtros. Si filtrás por &quot;abierto&quot;
                o &quot;entregado&quot; y no hay filas, el tracking aún no
                registró esos eventos.
              </p>
            </div>
          ) : null}

          {!loadingList && data && data.items.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Destinatario</th>
                      <th>Asunto</th>
                      <th>Origen</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th>¿Llegó?</th>
                      <th>¿Abrió?</th>
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
                        <td>{row.tipo ?? 'html'}</td>
                        <td>
                          <span
                            className={`badge ${badgeClass(row.estadoActual)}`}
                          >
                            {estadoLabel(row.estadoActual)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              row.rebotado
                                ? 'error'
                                : row.llego
                                  ? 'entregado'
                                  : 'enviado'
                            }`}
                          >
                            {row.rebotado
                              ? 'Rebotó'
                              : row.llego
                                ? 'Sí'
                                : 'Sin dato'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              row.abrio ? 'abierto' : 'enviado'
                            }`}
                          >
                            {row.abrio ? 'Sí' : 'Sin dato'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <span className="muted">
                  {data.total} registro{data.total === 1 ? '' : 's'} — página{' '}
                  {page} de {totalPages}
                </span>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={page <= 1}
                    onClick={() => void loadList(page - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => void loadList(page + 1)}
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
                  {detail.tipo ? ` · plantilla ${detail.tipo}` : ''}
                </p>
                <p className="muted">De: {detail.remitente || '—'}</p>
                <p>
                  Estado:{' '}
                  <span className={`badge ${badgeClass(detail.estadoActual)}`}>
                    {estadoLabel(detail.estadoActual)}
                  </span>
                </p>
                <div className="stats-kpis" style={{ margin: '0.75rem 0' }}>
                  <div className="stat-kpi">
                    <span className="stat-kpi-label">¿Llegó al buzón?</span>
                    <strong className="stat-kpi-value">
                      {detail.rebotado
                        ? 'Rebotó'
                        : siNo(detail.llego, 'Sin dato')}
                    </strong>
                    {detail.fechaEntrega ? (
                      <span className="stat-kpi-sub">
                        {formatFecha(detail.fechaEntrega)}
                      </span>
                    ) : null}
                  </div>
                  <div className="stat-kpi">
                    <span className="stat-kpi-label">¿Lo abrió?</span>
                    <strong className="stat-kpi-value">
                      {siNo(detail.abrio, 'Sin dato')}
                    </strong>
                    {detail.fechaApertura ? (
                      <span className="stat-kpi-sub">
                        {formatFecha(detail.fechaApertura)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="muted">messageId: {detail.messageId}</p>
                {detail.errorDetalle ? (
                  <div className="alert error">{detail.errorDetalle}</div>
                ) : null}
                {detail.eventos && detail.eventos.length > 0 ? (
                  <>
                    <p style={{ fontWeight: 600, marginBottom: 6 }}>Eventos</p>
                    <ul className="event-list">
                      {detail.eventos.map((ev) => (
                        <li key={ev.id} className={ev.interno ? 'muted' : undefined}>
                          {ev.interno ? eventoLabel(ev.evento) : <strong>{eventoLabel(ev.evento)}</strong>}{' '}
                          — {formatFecha(ev.fechaEvento)}
                          {ev.ip ? ` · IP ${ev.ip}` : ''}
                          {ev.detalle ? ` · ${ev.detalle}` : ''}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {!detail.eventos?.some((ev) => !ev.interno) ? (
                  <p className="muted">
                    Sin eventos de entrega/apertura todavía. Si el destinatario
                    abrió el mail pero acá no figura, el píxel no llegó a esta
                    app (URL pública) o SES Delivery no está configurado.
                  </p>
                ) : null}
                <p style={{ fontWeight: 600, marginBottom: 6 }}>Cuerpo</p>
                <div className="html-body">{detail.cuerpo || '—'}</div>
                <div className="actions">
                  {detail.estadoActual === 'error' || detail.estadoActual === 'revisar' ? (
                    <button
                      className="btn"
                      type="button"
                      disabled={requeueing}
                      onClick={() => void requeue()}
                    >
                      {requeueing ? 'Reencolando…' : 'Reencolar'}
                    </button>
                  ) : null}
                  {!detail.llego && !detail.rebotado ? (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={markingDeliver}
                      onClick={() => void markDeliver()}
                    >
                      {markingDeliver
                        ? 'Registrando…'
                        : 'Registrar entrega (prueba)'}
                    </button>
                  ) : null}
                  {!detail.abrio ? (
                    <button
                      className="btn"
                      type="button"
                      disabled={markingOpen}
                      onClick={() => void markOpen()}
                    >
                      {markingOpen
                        ? 'Registrando…'
                        : 'Registrar apertura (prueba)'}
                    </button>
                  ) : null}
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
        </>
      )}
    </main>
  );
}
