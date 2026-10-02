'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/token';

type Accion = {
  id: number;
  accion: string;
  motivo: string;
  origenAccion: string;
  responsable: string | null;
  nota: string | null;
  sesResultado: string | null;
  fecha: string;
};

type Item = {
  id: number;
  email: string;
  origen: string;
  motivo: string;
  mailLogId: number | null;
  activo: boolean;
  fecha: string;
  ultimaAccion: Accion | null;
};

type Cambio = {
  item: Item;
  activo: boolean;
  responsable: string;
  nota: string;
  confirmar: boolean;
};

const RESPONSABLE_KEY = 'mail-service-responsable';
const MIN_NOTA = 10;

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

function accionLabel(a: Accion): string {
  const quien =
    a.origenAccion === 'ses'
      ? 'Amazon SES'
      : a.origenAccion === 'vecino'
        ? 'el destinatario'
        : a.responsable || 'admin';
  return `${a.accion === 'reactivar' ? 'Reactivada' : 'Bloqueada'} por ${quien}`;
}

function sesResultadoLabel(r: string | null): string | null {
  switch (r) {
    case 'eliminada':
      return 'Quitada de la lista de SES';
    case 'no_estaba':
      return 'No estaba en la lista de SES';
    case 'no_aplica':
      return 'SES no se consultó (otro proveedor o sin región)';
    case 'error':
      return 'No se pudo quitar de la lista de SES';
    default:
      return null;
  }
}

function requiereRevision(motivo: string): boolean {
  return motivo === 'rebote' || motivo === 'queja';
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
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [cambioError, setCambioError] = useState('');
  const [advertencia, setAdvertencia] = useState('');
  const [historial, setHistorial] = useState<{ item: Item; items: Accion[] | null } | null>(
    null
  );

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

  function openCambio(item: Item, next: boolean) {
    setCambioError('');
    setCambio({
      item,
      activo: next,
      responsable: localStorage.getItem(RESPONSABLE_KEY) ?? '',
      nota: '',
      confirmar: false,
    });
  }

  async function submitCambio(e: FormEvent) {
    e.preventDefault();
    if (!cambio) return;
    const { item } = cambio;
    setBusyId(item.id);
    setCambioError('');
    setAdvertencia('');
    try {
      const res = await apiFetch('/api/dashboard/supresion', {
        method: 'PATCH',
        body: JSON.stringify({
          id: item.id,
          activo: cambio.activo,
          responsable: cambio.responsable.trim(),
          nota: cambio.nota.trim() || undefined,
          confirmar: cambio.confirmar,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        advertencia?: string;
      };
      if (!res.ok || !json.ok) {
        setCambioError(json.error || 'No se pudo actualizar');
        return;
      }
      localStorage.setItem(RESPONSABLE_KEY, cambio.responsable.trim());
      if (json.advertencia) setAdvertencia(json.advertencia);
      setCambio(null);
      await load(page, applied);
    } catch {
      setCambioError('Error de red al actualizar.');
    } finally {
      setBusyId(null);
    }
  }

  async function openHistorial(item: Item) {
    setHistorial({ item, items: null });
    try {
      const res = await apiFetch(`/api/dashboard/supresion?historial=${item.id}`);
      const json = (await res.json()) as { items?: Accion[]; error?: string };
      if (!res.ok || !json.items) {
        setHistorial(null);
        setError(json.error || 'No se pudo cargar el historial');
        return;
      }
      setHistorial({ item, items: json.items });
    } catch {
      setHistorial(null);
      setError('Error de red al cargar el historial.');
    }
  }

  const revision = cambio && !cambio.activo && requiereRevision(cambio.item.motivo);
  const puedeEnviar =
    cambio != null &&
    cambio.responsable.trim().length > 0 &&
    (!revision || (cambio.confirmar && cambio.nota.trim().length >= MIN_NOTA));

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
          mail. Una baja se reactiva a pedido del destinatario; un rebote o una
          queja solo después de verificar la dirección, con una nota.
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
      {advertencia ? (
        <div className="alert warn">
          {advertencia}{' '}
          <button className="btn secondary" type="button" onClick={() => setAdvertencia('')}>
            Entendido
          </button>
        </div>
      ) : null}
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
                  <th>Última acción</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
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
                        {row.ultimaAccion ? (
                          <>
                            {accionLabel(row.ultimaAccion)}
                            <div className="muted" style={{ fontSize: '0.85rem' }}>
                              {formatFecha(row.ultimaAccion.fecha)}
                              {row.ultimaAccion.nota ? ` · ${row.ultimaAccion.nota}` : ''}
                              {sesResultadoLabel(row.ultimaAccion.sesResultado)
                                ? ` · ${sesResultadoLabel(row.ultimaAccion.sesResultado)}`
                                : ''}
                            </div>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {row.activo ? (
                          <button
                            className="btn secondary"
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => openCambio(row, false)}
                          >
                            Reactivar
                          </button>
                        ) : (
                          <button
                            className="btn"
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => openCambio(row, true)}
                          >
                            Volver a bloquear
                          </button>
                        )}{' '}
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => void openHistorial(row)}
                        >
                          Historial
                        </button>
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

      {cambio ? (
        <div className="modal-backdrop" onClick={() => setCambio(null)} role="presentation">
          <form
            className="modal form"
            role="dialog"
            aria-labelledby="cambio-titulo"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitCambio}
          >
            <h2 id="cambio-titulo" style={{ marginTop: 0 }}>
              {cambio.activo ? 'Volver a bloquear' : 'Reactivar'} {cambio.item.email}
            </h2>
            <p className="muted">
              {motivoLabel(cambio.item.motivo)} · {origenLabel(cambio.item.origen)} ·{' '}
              {formatFecha(cambio.item.fecha)}
            </p>

            {revision ? (
              <div className="alert warn">
                {cambio.item.motivo === 'queja'
                  ? 'Esta dirección se bloqueó porque su proveedor informó una queja de spam. '
                  : 'Esta dirección se bloqueó porque el servidor de destino la rechazó de forma permanente. '}
                Volver a enviarle sin verificar daña la reputación del dominio y puede hacer que
                los correos de todos los sistemas terminen en spam. Reactivá solo si el titular lo
                pidió y la dirección es correcta. También se quita de la lista de supresión de SES.
              </div>
            ) : null}

            <label>
              Responsable
              <input
                required
                maxLength={120}
                value={cambio.responsable}
                onChange={(e) => setCambio({ ...cambio, responsable: e.target.value })}
                placeholder="Nombre y apellido"
              />
            </label>
            <label>
              Nota{revision ? ` (obligatoria, mínimo ${MIN_NOTA} caracteres)` : ' (opcional)'}
              <textarea
                rows={3}
                maxLength={1000}
                value={cambio.nota}
                onChange={(e) => setCambio({ ...cambio, nota: e.target.value })}
                placeholder={
                  revision
                    ? 'Qué se verificó y quién lo pidió (ej.: el vecino confirmó por teléfono la dirección).'
                    : ''
                }
              />
            </label>
            {revision ? (
              <label>
                <input
                  type="checkbox"
                  checked={cambio.confirmar}
                  onChange={(e) => setCambio({ ...cambio, confirmar: e.target.checked })}
                />{' '}
                Verifiqué la dirección y el titular pidió volver a recibir correos
              </label>
            ) : null}

            {cambioError ? <div className="alert error">{cambioError}</div> : null}

            <div className="actions">
              <button
                className="btn"
                type="submit"
                disabled={!puedeEnviar || busyId === cambio.item.id}
              >
                {busyId === cambio.item.id
                  ? 'Guardando…'
                  : cambio.activo
                    ? 'Bloquear'
                    : 'Reactivar'}
              </button>
              <button className="btn secondary" type="button" onClick={() => setCambio(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {historial ? (
        <div className="modal-backdrop" onClick={() => setHistorial(null)} role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-labelledby="historial-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="historial-titulo" style={{ marginTop: 0 }}>
              Historial de {historial.item.email}
            </h2>
            <p className="muted">{origenLabel(historial.item.origen)}</p>
            {historial.items == null ? (
              <p className="muted">Cargando…</p>
            ) : historial.items.length === 0 ? (
              <p className="muted">
                Sin acciones registradas (el bloqueo es anterior al historial).
              </p>
            ) : (
              <ul>
                {historial.items.map((a) => (
                  <li key={a.id}>
                    <strong>{accionLabel(a)}</strong> — {formatFecha(a.fecha)} ·{' '}
                    {motivoLabel(a.motivo)}
                    {a.nota ? <div className="muted">{a.nota}</div> : null}
                    {sesResultadoLabel(a.sesResultado) ? (
                      <div className="muted">{sesResultadoLabel(a.sesResultado)}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="actions">
              <button className="btn secondary" type="button" onClick={() => setHistorial(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
