'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/token';

type ApiKey = {
  id: number;
  prefijo: string;
  activo: boolean;
  fechaAlta: string;
  ultimoUso: string | null;
  revocadaEn: string | null;
};

type Sistema = {
  id: number;
  nombre: string;
  origen: string;
  clasificacion: 'transactional' | 'subscription';
  permiteRawHtml: boolean;
  corsOrigins: string[];
  activo: boolean;
  fechaAlta: string;
  keys: ApiKey[];
};

type EditState = {
  nombre: string;
  clasificacion: Sistema['clasificacion'];
  permiteRawHtml: boolean;
  corsOrigins: string;
  activo: boolean;
};

const EMPTY_FORM = {
  nombre: '',
  origen: '',
  clasificacion: 'transactional' as Sistema['clasificacion'],
  permiteRawHtml: false,
  corsOrigins: '',
};

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR');
}

function clasificacionLabel(c: string): string {
  return c === 'subscription' ? 'Suscripción' : 'Transaccional';
}

function splitOrigins(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string; detalle?: unknown };
    const detalle =
      json.detalle && typeof json.detalle === 'object'
        ? JSON.stringify(json.detalle)
        : '';
    return [json.error || fallback, detalle].filter(Boolean).join(': ');
  } catch {
    return fallback;
  }
}

type SesEstado = {
  disponible: boolean;
  proveedor: string;
  motivo?: string;
  fromEmail?: string | null;
  identity?: {
    identity: string;
    type: 'domain' | 'email';
    verifiedForSending: boolean;
    dkimStatus: string | null;
    dkimKeyLength: string | null;
    mailFromDomain: string | null;
    mailFromStatus: string | null;
  } | null;
  identityError?: string | null;
  account?: {
    productionAccess: boolean | null;
    sendingEnabled: boolean | null;
    maxSendRate: number | null;
    max24HourSend: number | null;
    sentLast24Hours: number | null;
    effectiveSuppressedReasons: string[];
    configurationSetSuppressedReasons: string[] | null;
    tlsPolicy: string | null;
    configurationSet: string | null;
  } | null;
  accountError?: string | null;
  problemas?: string[];
  consultado?: string;
};

function EstadoFila({ label, ok, valor }: { label: string; ok: boolean | null; valor: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td>
        <span className={`badge ${ok == null ? 'pendiente' : ok ? 'enviado' : 'error'}`}>
          {valor}
        </span>
      </td>
    </tr>
  );
}

function SesEstadoCard() {
  const [estado, setEstado] = useState<SesEstado | null>(null);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await apiFetch('/api/admin/ses-estado');
        const json = (await res.json()) as SesEstado & { error?: string };
        if (cancel) return;
        if (!res.ok && !json.motivo) {
          setFallo(json.error || 'No se pudo consultar');
          return;
        }
        setEstado(json);
      } catch {
        if (!cancel) setFallo('No se pudo consultar');
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const id = estado?.identity;
  const acc = estado?.account;

  return (
    <section className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-title">Estado de SES</div>
      {fallo ? <p className="muted">No se pudo consultar: {fallo}</p> : null}
      {!fallo && !estado ? <p className="muted">Consultando…</p> : null}
      {estado && !estado.disponible ? (
        <p className="muted">No se pudo consultar: {estado.motivo}</p>
      ) : null}
      {estado?.disponible ? (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <tbody>
                {id ? (
                  <>
                    <EstadoFila
                      label={`Identidad (${id.type === 'domain' ? 'dominio' : 'solo dirección'})`}
                      ok={id.type === 'domain' && id.verifiedForSending}
                      valor={`${id.identity}${id.verifiedForSending ? ' · verificada' : ' · sin verificar'}`}
                    />
                    <EstadoFila
                      label="DKIM"
                      ok={id.dkimStatus === 'SUCCESS' && (id.type !== 'domain' || id.dkimKeyLength === 'RSA_2048_BIT')}
                      valor={`${id.dkimStatus ?? 'sin configurar'}${id.dkimKeyLength ? ` · ${id.dkimKeyLength}` : ''}`}
                    />
                    <EstadoFila
                      label="MAIL FROM"
                      ok={Boolean(id.mailFromDomain) && id.mailFromStatus === 'SUCCESS'}
                      valor={id.mailFromDomain ? `${id.mailFromDomain} · ${id.mailFromStatus}` : 'sin configurar'}
                    />
                  </>
                ) : (
                  <EstadoFila label="Identidad" ok={false} valor={estado.identityError || 'no se pudo consultar'} />
                )}
                {acc ? (
                  <>
                    <EstadoFila
                      label="Cuenta"
                      ok={acc.productionAccess === true && acc.sendingEnabled !== false}
                      valor={acc.productionAccess ? 'producción' : 'sandbox'}
                    />
                    <EstadoFila
                      label="TLS en el configuration set"
                      ok={acc.tlsPolicy === 'REQUIRE'}
                      valor={acc.configurationSet ? `${acc.configurationSet} · ${acc.tlsPolicy ?? '—'}` : 'sin configuration set'}
                    />
                    <EstadoFila
                      label="Lista de supresión de SES"
                      ok={null}
                      valor={
                        acc.effectiveSuppressedReasons.length
                          ? `activa (${acc.effectiveSuppressedReasons.join(', ')})${acc.configurationSetSuppressedReasons ? ' · por configuration set' : ' · por cuenta'}`
                          : 'inactiva'
                      }
                    />
                    <EstadoFila
                      label="Cuota"
                      ok={null}
                      valor={`${acc.sentLast24Hours ?? '—'} / ${acc.max24HourSend ?? '—'} en 24 h · ${acc.maxSendRate ?? '—'} por segundo`}
                    />
                  </>
                ) : (
                  <EstadoFila label="Cuenta" ok={false} valor={estado.accountError || 'no se pudo consultar'} />
                )}
              </tbody>
            </table>
          </div>
          {estado.problemas?.length ? (
            <div className="alert error">
              <ul style={{ margin: 0 }}>
                {estado.problemas.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="alert ok">Dominio y cuenta listos.</div>
          )}
          <p className="muted" style={{ marginBottom: 0 }}>
            Consultado {formatFecha(estado.consultado ?? null)} (se actualiza cada 5 minutos). Ver
            docs/aws-setup.md, sección 5.
          </p>
        </>
      ) : null}
    </section>
  );
}

type GoogleEstado = {
  conectado: boolean;
  configurado?: boolean;
  email?: string;
  estado?: string;
  ultimaSync?: string | null;
  ultimoError?: string | null;
  conectadoEn?: string;
};

function GooglePostmasterCard() {
  const [estado, setEstado] = useState<GoogleEstado | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/google/conectar');
      const json = (await res.json()) as GoogleEstado & { error?: string };
      if (!res.ok) {
        setMensaje(json.error || 'No se pudo consultar Google');
        return;
      }
      setEstado(json);
    } catch {
      setMensaje('No se pudo consultar Google');
    }
  }, []);

  useEffect(() => {
    void load();
    const q = new URLSearchParams(window.location.search);
    if (q.get('google') === 'ok') setMensaje('Cuenta de Google conectada.');
    if (q.get('google') === 'error') {
      setMensaje(`No se pudo conectar: ${q.get('detalle') || 'error'}`);
    }
  }, [load]);

  async function conectar() {
    setBusy('conectar');
    setMensaje('');
    try {
      const res = await apiFetch('/api/admin/google/conectar', { method: 'POST' });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setMensaje(json.error || 'No se pudo armar el enlace de Google');
        return;
      }
      window.location.href = json.url;
    } catch {
      setMensaje('Error de red al conectar.');
    } finally {
      setBusy('');
    }
  }

  async function sincronizar() {
    setBusy('sync');
    setMensaje('');
    try {
      const res = await apiFetch('/api/admin/google/sincronizar', { method: 'POST' });
      const json = (await res.json()) as { ok?: boolean; motivo?: string; dias?: number; error?: string };
      if (!res.ok && !json.ok) {
        setMensaje(json.motivo || json.error || 'No se pudo sincronizar');
      } else {
        setMensaje(`Sincronizado: ${json.dias ?? 0} día(s) de Gmail.`);
      }
      await load();
    } catch {
      setMensaje('Error de red al sincronizar.');
    } finally {
      setBusy('');
    }
  }

  async function desconectar() {
    if (!window.confirm('¿Desconectar Google Postmaster? Se deja de actualizar el dashboard.')) return;
    setBusy('off');
    try {
      const res = await apiFetch('/api/admin/google/conectar', { method: 'DELETE' });
      if (!res.ok) {
        setMensaje('No se pudo desconectar');
        return;
      }
      setEstado({ conectado: false, configurado: estado?.configurado });
      setMensaje('Desconectado.');
    } catch {
      setMensaje('Error de red al desconectar.');
    } finally {
      setBusy('');
    }
  }

  const vencida = estado?.estado === 'vencida';

  return (
    <section className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-title">Google Postmaster</div>
      {!estado ? <p className="muted">Consultando…</p> : null}
      {estado && !estado.conectado ? (
        <p className="muted">
          {estado.configurado
            ? 'Sin conectar. Hace falta una cuenta que tenga el dominio verificado en Postmaster Tools.'
            : 'Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_TOKEN_KEY. Ver docs/google-postmaster.md.'}
        </p>
      ) : null}
      {estado?.conectado ? (
        <p>
          Conectado como <strong>{estado.email}</strong>
          {vencida ? (
            <span className="badge error" style={{ marginLeft: 8 }}>
              vencida
            </span>
          ) : (
            <span className="badge enviado" style={{ marginLeft: 8 }}>
              activa
            </span>
          )}
          <br />
          <span className="muted">
            Última sincronización: {formatFecha(estado.ultimaSync ?? null)}
            {estado.ultimoError ? ` · ${estado.ultimoError}` : ''}
          </span>
        </p>
      ) : null}
      {mensaje ? <div className={`alert ${mensaje.startsWith('No') || mensaje.includes('error') || mensaje.includes('venc') ? 'error' : 'ok'}`}>{mensaje}</div> : null}
      <div className="actions">
        {!estado?.conectado || vencida ? (
          <button className="btn" type="button" disabled={busy === 'conectar'} onClick={() => void conectar()}>
            {busy === 'conectar' ? 'Redirigiendo…' : vencida ? 'Reconectar' : 'Conectar con Google'}
          </button>
        ) : null}
        {estado?.conectado ? (
          <>
            <button className="btn secondary" type="button" disabled={busy === 'sync'} onClick={() => void sincronizar()}>
              {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
            <button className="btn secondary" type="button" disabled={busy === 'off'} onClick={() => void desconectar()}>
              Desconectar
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

export default function SistemasPage() {
  const [sistemas, setSistemas] = useState<Sistema[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ sistema: string; key: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/sistemas');
      if (!res.ok) {
        setError(await readError(res, 'No se pudo cargar la lista de sistemas'));
        return;
      }
      const json = (await res.json()) as { sistemas: Sistema[] };
      setSistemas(json.sistemas);
    } catch {
      setError('Error de red al cargar los sistemas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/sistemas', {
        method: 'POST',
        body: JSON.stringify({
          nombre: form.nombre,
          origen: form.origen,
          clasificacion: form.clasificacion,
          permiteRawHtml: form.permiteRawHtml,
          corsOrigins: splitOrigins(form.corsOrigins),
        }),
      });
      if (!res.ok) {
        setError(await readError(res, 'No se pudo crear el sistema'));
        return;
      }
      setForm(EMPTY_FORM);
      await load();
    } catch {
      setError('Error de red al crear el sistema.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(s: Sistema) {
    setEditId(s.id);
    setEdit({
      nombre: s.nombre,
      clasificacion: s.clasificacion,
      permiteRawHtml: s.permiteRawHtml,
      corsOrigins: s.corsOrigins.join(', '),
      activo: s.activo,
    });
  }

  async function saveEdit(id: number) {
    if (!edit) return;
    setBusy(`edit-${id}`);
    setError('');
    try {
      const res = await apiFetch(`/api/admin/sistemas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...edit, corsOrigins: splitOrigins(edit.corsOrigins) }),
      });
      if (!res.ok) {
        setError(await readError(res, 'No se pudo guardar'));
        return;
      }
      setEditId(null);
      setEdit(null);
      await load();
    } catch {
      setError('Error de red al guardar.');
    } finally {
      setBusy(null);
    }
  }

  async function generateKey(s: Sistema) {
    setBusy(`key-${s.id}`);
    setError('');
    setNewKey(null);
    try {
      const res = await apiFetch(`/api/admin/sistemas/${s.id}/keys`, { method: 'POST' });
      if (!res.ok) {
        setError(await readError(res, 'No se pudo generar la clave'));
        return;
      }
      const json = (await res.json()) as { key: string };
      setNewKey({ sistema: s.nombre, key: json.key });
      await load();
    } catch {
      setError('Error de red al generar la clave.');
    } finally {
      setBusy(null);
    }
  }

  async function revokeKey(s: Sistema, k: ApiKey) {
    if (!window.confirm(`¿Revocar la clave ${k.prefijo} de ${s.nombre}? El sistema deja de poder enviar con ella.`)) {
      return;
    }
    setBusy(`revoke-${k.id}`);
    setError('');
    try {
      const res = await apiFetch(`/api/admin/sistemas/${s.id}/keys?keyId=${k.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError(await readError(res, 'No se pudo revocar la clave'));
        return;
      }
      await load();
    } catch {
      setError('Error de red al revocar la clave.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Sistemas y claves de API</h1>
        <p className="muted">
          Cada sistema envía con su propia clave (<code>x-api-key</code>) y el
          origen sale de la credencial. Los transaccionales no llevan enlace de
          baja; los de suscripción sí. Para rotar una clave: generá una nueva,
          cambiala en el sistema y después revocá la anterior.
        </p>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {newKey ? (
        <div className="alert ok">
          <p style={{ margin: 0 }}>
            Clave nueva para <strong>{newKey.sistema}</strong>. Copiala ahora: no
            se vuelve a mostrar.
          </p>
          <pre className="code" style={{ userSelect: 'all', whiteSpace: 'pre-wrap' }}>
            {newKey.key}
          </pre>
          <div className="actions" style={{ marginTop: 0 }}>
            <button
              className="btn secondary"
              type="button"
              onClick={() => void navigator.clipboard?.writeText(newKey.key)}
            >
              Copiar
            </button>
            <button className="btn secondary" type="button" onClick={() => setNewKey(null)}>
              Ya la guardé
            </button>
          </div>
        </div>
      ) : null}

      <SesEstadoCard />
      <GooglePostmasterCard />

      {loading && !sistemas ? <p className="muted">Cargando…</p> : null}

      {sistemas?.map((s) => (
        <section key={s.id} className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <span>
              {s.nombre} <span className="muted">({s.origen})</span>
            </span>
            <span>
              <span className={`badge ${s.clasificacion === 'subscription' ? 'abierto' : 'entregado'}`}>
                {clasificacionLabel(s.clasificacion)}
              </span>{' '}
              <span className={`badge ${s.activo ? 'enviado' : 'error'}`}>
                {s.activo ? 'Activo' : 'Inactivo'}
              </span>
            </span>
          </div>

          {editId === s.id && edit ? (
            <div className="form">
              <div className="grid-2">
                <label>
                  Nombre
                  <input
                    value={edit.nombre}
                    onChange={(e) => setEdit({ ...edit, nombre: e.target.value })}
                  />
                </label>
                <label>
                  Clasificación
                  <select
                    value={edit.clasificacion}
                    onChange={(e) =>
                      setEdit({ ...edit, clasificacion: e.target.value as Sistema['clasificacion'] })
                    }
                  >
                    <option value="transactional">Transaccional</option>
                    <option value="subscription">Suscripción</option>
                  </select>
                </label>
              </div>
              <label>
                Orígenes CORS (separados por coma)
                <input
                  value={edit.corsOrigins}
                  onChange={(e) => setEdit({ ...edit, corsOrigins: e.target.value })}
                  placeholder="https://turnos.lujandecuyo.gob.ar"
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={edit.permiteRawHtml}
                  onChange={(e) => setEdit({ ...edit, permiteRawHtml: e.target.checked })}
                />{' '}
                Permite enviar HTML libre
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={edit.activo}
                  onChange={(e) => setEdit({ ...edit, activo: e.target.checked })}
                />{' '}
                Activo
              </label>
              <div className="actions">
                <button
                  className="btn"
                  type="button"
                  disabled={busy === `edit-${s.id}`}
                  onClick={() => void saveEdit(s.id)}
                >
                  {busy === `edit-${s.id}` ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setEditId(null);
                    setEdit(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>
              CORS: {s.corsOrigins.length ? s.corsOrigins.join(', ') : 'ninguno'} · HTML
              libre: {s.permiteRawHtml ? 'sí' : 'no'} · alta {formatFecha(s.fechaAlta)}
            </p>
          )}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Clave</th>
                  <th>Alta</th>
                  <th>Último uso</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {s.keys.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Sin claves.
                    </td>
                  </tr>
                ) : (
                  s.keys.map((k) => {
                    const vigente = k.activo && !k.revocadaEn;
                    return (
                      <tr key={k.id}>
                        <td>
                          <code>mls_{k.prefijo}_…</code>
                        </td>
                        <td>{formatFecha(k.fechaAlta)}</td>
                        <td>{formatFecha(k.ultimoUso)}</td>
                        <td>
                          <span className={`badge ${vigente ? 'enviado' : 'error'}`}>
                            {vigente ? 'Vigente' : `Revocada ${formatFecha(k.revocadaEn)}`}
                          </span>
                        </td>
                        <td>
                          {vigente ? (
                            <button
                              className="btn secondary"
                              type="button"
                              disabled={busy === `revoke-${k.id}`}
                              onClick={() => void revokeKey(s, k)}
                            >
                              {busy === `revoke-${k.id}` ? '…' : 'Revocar'}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="actions">
            <button
              className="btn"
              type="button"
              disabled={busy === `key-${s.id}`}
              onClick={() => void generateKey(s)}
            >
              {busy === `key-${s.id}` ? 'Generando…' : 'Generar clave'}
            </button>
            {editId !== s.id ? (
              <button className="btn secondary" type="button" onClick={() => startEdit(s)}>
                Editar
              </button>
            ) : null}
          </div>
        </section>
      ))}

      <form className="form card" onSubmit={onCreate}>
        <div className="card-title">Nuevo sistema</div>
        <div className="grid-2">
          <label>
            Nombre
            <input
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Turnos web"
            />
          </label>
          <label>
            Origen
            <input
              required
              value={form.origen}
              onChange={(e) => setForm({ ...form, origen: e.target.value })}
              placeholder="turnos"
            />
          </label>
        </div>
        <label>
          Clasificación
          <select
            value={form.clasificacion}
            onChange={(e) =>
              setForm({ ...form, clasificacion: e.target.value as Sistema['clasificacion'] })
            }
          >
            <option value="transactional">
              Transaccional (turnos, trámites: sin enlace de baja)
            </option>
            <option value="subscription">Suscripción (novedades: con enlace de baja)</option>
          </select>
        </label>
        <label>
          Orígenes CORS (solo si el navegador llama directo; separados por coma)
          <input
            value={form.corsOrigins}
            onChange={(e) => setForm({ ...form, corsOrigins: e.target.value })}
            placeholder="https://turnos.lujandecuyo.gob.ar"
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.permiteRawHtml}
            onChange={(e) => setForm({ ...form, permiteRawHtml: e.target.checked })}
          />{' '}
          Permite enviar HTML libre
        </label>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Creando…' : 'Crear sistema'}
        </button>
      </form>
    </main>
  );
}
