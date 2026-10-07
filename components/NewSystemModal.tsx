"use client";

import { useState } from 'react';
import { apiFetch } from '@/lib/client/token';

type Props = {
  onClose: () => void;
  onCreated: (newKey: { sistema: string; key: string; keyId?: number }) => void;
};

function splitOrigins(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export default function NewSystemModal({ onClose, onCreated }: Props) {
  const [nombre, setNombre] = useState('');
  const [origen, setOrigen] = useState('');
  const [clasificacion, setClasificacion] = useState<'transactional' | 'subscription'>('transactional');
  const [permiteRawHtml, setPermiteRawHtml] = useState(false);
  const [corsOrigins, setCorsOrigins] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createAndGenerate(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    if (!nombre.trim() || !origen.trim()) {
      setError('Nombre y origen son obligatorios');
      return;
    }
    setBusy(true);
    try {
      // 1) Crear sistema
      const res = await apiFetch('/api/admin/sistemas', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          origen,
          clasificacion,
          permiteRawHtml,
          corsOrigins: splitOrigins(corsOrigins),
        }),
      });
      if (!res.ok) {
        let msg = 'No se pudo crear el sistema';
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          // ignore
        }
        setError(msg);
        setBusy(false);
        return;
      }

      // 2) Obtener la lista para encontrar el id del sistema recién creado
      const listRes = await apiFetch('/api/admin/sistemas');
      if (!listRes.ok) {
        setError('Creado pero no se pudo obtener la lista de sistemas');
        setBusy(false);
        return;
      }
      const json = (await listRes.json()) as { sistemas: Array<{ id: number; origen: string; nombre: string }> };
      const found = json.sistemas.find((s) => s.origen === origen);
      if (!found) {
        setError('Sistema creado pero no encontrado (falla al identificar).');
        setBusy(false);
        return;
      }

      // 3) Generar clave
      const keyRes = await apiFetch(`/api/admin/sistemas/${found.id}/keys`, { method: 'POST' });
      if (!keyRes.ok) {
        const msg = (await (keyRes.json().catch(() => ({}))))?.error ?? 'No se pudo generar la clave';
        setError(msg);
        setBusy(false);
        return;
      }
      const keyJson = await keyRes.json();
      if (!keyJson?.key) {
        setError('El servidor no devolvió la clave');
        setBusy(false);
        return;
      }

      onCreated({ sistema: found.nombre, key: keyJson.key, keyId: keyJson.id });
      onClose();
    } catch (err) {
      setError('Error de red al crear el sistema.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal card" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>Crear sistema y generar clave</h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar">x</button>
        </div>
        {error ? <div className="alert error" style={{ marginTop: 8 }}>{error}</div> : null}
        <form className="form" onSubmit={createAndGenerate}>
          <div className="grid-2">
            <label>
              Nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </label>
            <label>
              Origen
              <input value={origen} onChange={(e) => setOrigen(e.target.value)} required placeholder="turnos" />
            </label>
          </div>
          <div className="grid-2">
            <label>
              Clasificación
              <select value={clasificacion} onChange={(e) => setClasificacion(e.target.value as any)}>
                <option value="transactional">Transaccional (Recomendado)</option>
                <option value="subscription">Suscripción</option>
              </select>
            </label>
            <label>
              Orígenes CORS (separados por coma)
              <input value={corsOrigins} onChange={(e) => setCorsOrigins(e.target.value)} placeholder="https://turnos.lujandecuyo.gob.ar" />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={permiteRawHtml} onChange={(e) => setPermiteRawHtml(e.target.checked)} />
            <span>Permite enviar HTML libre</span>
          </label>

          <div className="actions">
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear y generar clave'}</button>
            <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
