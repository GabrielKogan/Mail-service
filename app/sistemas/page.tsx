'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/token';
import NewSystemModal from '@/components/NewSystemModal';
import { esErrorScopePostmaster, mensajeErrorPostmaster } from '@/lib/google/scopes';

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
  const sinPermiso = esErrorScopePostmaster(estado?.ultimoError);
  const errorSync = estado?.ultimoError ? mensajeErrorPostmaster(estado.ultimoError) : '';

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
          {vencida || sinPermiso ? (
            <span className="badge error" style={{ marginLeft: 8 }}>
              {sinPermiso ? 'sin permiso' : 'vencida'}
            </span>
          ) : (
            <span className="badge enviado" style={{ marginLeft: 8 }}>
              activa
            </span>
          )}
          <br />
          <span className="muted">
            Última sincronización: {formatFecha(estado.ultimaSync ?? null)}
            {errorSync ? ` · ${errorSync}` : ''}
            {!vencida && !sinPermiso ? (
              <>
                <br />
                Se actualiza sola cada 6 horas. «Sincronizar ahora» la adelanta.
              </>
            ) : null}
          </span>
        </p>
      ) : null}
      {mensaje ? (
        <div
          className={`alert ${
            mensaje.startsWith('No') ||
            mensaje.startsWith('Error') ||
            /error|venc|permiso de Postmaster|insufficient authentication scopes/i.test(mensaje)
              ? 'error'
              : 'ok'
          }`}
        >
          {mensajeErrorPostmaster(mensaje)}
        </div>
      ) : null}
      <div className="actions">
        {!estado?.conectado || vencida || sinPermiso ? (
          <button className="btn" type="button" disabled={busy === 'conectar'} onClick={() => void conectar()}>
            {busy === 'conectar' ? 'Redirigiendo…' : vencida || sinPermiso ? 'Reconectar' : 'Conectar con Google'}
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
  const [generatedKeys, setGeneratedKeys] = useState<Record<number, string>>({});
  const [showNewModal, setShowNewModal] = useState(false);

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

  async function generateKey(s: Sistema): Promise<string | null> {
    setBusy(`key-${s.id}`);
    setError('');
    setNewKey(null);
    try {
      const res = await apiFetch(`/api/admin/sistemas/${s.id}/keys`, { method: 'POST' });
      if (!res.ok) {
        setError(await readError(res, 'No se pudo generar la clave'));
        return null;
      }
      const json = (await res.json()) as { key: string; id?: number };
      if (json.id) setGeneratedKeys((p) => ({ ...p, [json.id as number]: json.key }));
      setNewKey({ sistema: s.nombre, key: json.key });
      await load();
      return json.key;
    } catch {
      setError('Error de red al generar la clave.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  function handleModalCreated(k: { sistema: string; key: string }) {
    setNewKey(k);
    // if modal returned keyId include it in generatedKeys map
    const asAny = k as unknown as { keyId?: number };
    if (asAny.keyId) setGeneratedKeys((p) => ({ ...p, [asAny.keyId as number]: k.key }));
    void load();
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
        <div style={{ marginTop: 8 }}>
          <button className="btn" type="button" onClick={() => setShowNewModal(true)}>
            Crear sistema + generar clave
          </button>
        </div>
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

      {showNewModal ? (
        <NewSystemModal onClose={() => setShowNewModal(false)} onCreated={(k) => handleModalCreated(k)} />
      ) : null}

      <SesEstadoCard />
      <GooglePostmasterCard />

      {loading && !sistemas ? <p className="muted">Cargando…</p> : null}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title">Sistemas y claves</div>
        <p className="muted">Listado unificado con todos los sistemas y sus claves. Usa las acciones para generar o revocar claves y editar sistemas.</p>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Sistema</th>
                <th>Claves</th>
                <th>Alta</th>
                <th>Último uso</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sistemas?.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{s.nombre}</div>
                    <div className="muted">id {s.id} · {s.origen} · {s.corsOrigins.length ? s.corsOrigins.join(', ') : 'CORS: ninguno'}</div>
                  </td>
                  <td>
                    {s.keys.length === 0 ? (
                      <span className="muted">Sin claves.</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {s.keys.map((k) => (
                          <div key={k.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <code style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>mls_{k.prefijo}_…</code>
                            <button
                              className="btn secondary icon-btn"
                              type="button"
                              title="Copiar clave"
                              aria-label={`Copiar clave ${k.prefijo}`}
                              onClick={async () => {
                                try {
                                  // if we have the full key for this key id in memory, copy it
                                  if (generatedKeys[k.id]) {
                                    await navigator.clipboard?.writeText(generatedKeys[k.id]);
                                    window.alert('Clave copiada al portapapeles.');
                                    return;
                                  }
                                  // else ask user to confirm generating a new key to copy
                                  if (!window.confirm('No es posible recuperar la clave completa. ¿Generar una nueva clave y copiarla ahora?')) return;
                                  const full = await generateKey(s);
                                  if (full) {
                                    await navigator.clipboard?.writeText(full);
                                    window.alert('Nueva clave generada y copiada al portapapeles.');
                                  }
                                } catch (e) {
                                  // ignore clipboard errors
                                }
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                                <path d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1z" fill="currentColor"/>
                                <path d="M20 5H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h12v14z" fill="currentColor"/>
                              </svg>
                            </button>
                            <span className={`badge ${k.activo && !k.revocadaEn ? 'enviado' : 'error'}`} style={{ marginLeft: 8 }}>
                              {k.activo && !k.revocadaEn ? 'Vigente' : `Revocada ${k.revocadaEn ? formatFecha(k.revocadaEn) : ''}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{formatFecha(s.fechaAlta)}</td>
                  <td>{s.keys.length ? formatFecha(s.keys[0].ultimoUso) : '—'}</td>
                  <td>
                    <span className={`badge ${s.activo ? 'enviado' : 'error'}`}>{s.activo ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="btn" type="button" disabled={busy === `key-${s.id}`} onClick={() => void generateKey(s)}>
                        {busy === `key-${s.id}` ? 'Generando…' : 'Generar clave'}
                      </button>
                      <button className="btn secondary" type="button" onClick={() => startEdit(s)} aria-label={`Editar ${s.nombre}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', display: 'inline-block' }} aria-hidden>
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="currentColor" />
                          <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
