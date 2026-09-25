'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/client/token';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from '@/lib/attachment-limits';

type SendOk = {
  ok: true;
  id: number;
  messageId?: string | null;
  estado?: string;
  duplicado?: boolean;
  adjuntos?: string[];
};
type SendErr = { error: string; detalle?: string | Record<string, unknown> };

type AdjuntoPayload = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

type Campo = {
  nombre: string;
  etiqueta: string;
  tipo: 'linea' | 'texto' | 'url' | 'lista';
  requerido?: boolean;
  ayuda?: string;
  ejemplo: string | string[];
};

type PlantillaInfo = {
  tipo: string;
  version: number;
  nombre: string;
  descripcion: string;
  clasificacion: 'transactional' | 'subscription';
  origenes: string[] | null;
  campos: Campo[];
  ejemplo: Record<string, string | string[]>;
};

type Sistema = {
  id: number;
  nombre: string;
  origen: string;
  clasificacion: 'transactional' | 'subscription';
  permiteRawHtml: boolean;
};

type Preview = { asunto: string; html: string; texto: string };

const ACCEPT = ALLOWED_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(',');

async function fileToAdjunto(file: File): Promise<AdjuntoPayload> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    contentBase64: btoa(binary),
  };
}

function emptyData(campos: Campo[]): Record<string, string | string[]> {
  return Object.fromEntries(
    campos.map((c) => [c.nombre, c.tipo === 'lista' ? [] : ''])
  );
}

export default function EnviarPage() {
  const [plantillas, setPlantillas] = useState<PlantillaInfo[]>([]);
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [modo, setModo] = useState<'plantilla' | 'html'>('plantilla');
  const [tipo, setTipo] = useState('');
  const [data, setData] = useState<Record<string, string | string[]>>({});
  const [origen, setOrigen] = useState('');
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('<p></p>');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState<SendOk | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [pRes, sRes] = await Promise.all([
          apiFetch('/api/plantillas'),
          apiFetch('/api/admin/sistemas'),
        ]);
        if (pRes.ok) {
          const json = (await pRes.json()) as { plantillas: PlantillaInfo[] };
          setPlantillas(json.plantillas);
        }
        if (sRes.ok) {
          const json = (await sRes.json()) as { sistemas: Sistema[] };
          setSistemas(json.sistemas.filter((s) => s.origen !== 'panel'));
        }
      } catch {
        // El formulario sigue usable: se puede escribir el origen a mano.
      }
    })();
  }, []);

  const plantilla = useMemo(
    () => plantillas.find((p) => p.tipo === tipo) ?? null,
    [plantillas, tipo]
  );

  function onTipoChange(next: string) {
    setTipo(next);
    setPreview(null);
    const p = plantillas.find((x) => x.tipo === next);
    if (p) {
      setData(emptyData(p.campos));
      if (p.origenes?.length === 1) setOrigen(p.origenes[0]);
    } else {
      setData({});
    }
  }

  function setCampo(nombre: string, value: string | string[]) {
    setData((prev) => ({ ...prev, [nombre]: value }));
    setPreview(null);
  }

  function onFilesChange(list: FileList | null) {
    setFiles(list ? Array.from(list).slice(0, MAX_ATTACHMENTS) : []);
  }

  async function onPreview() {
    if (!tipo) return;
    setPreviewing(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/plantillas/preview', {
        method: 'POST',
        body: JSON.stringify({ tipo, data, nombre }),
      });
      const json = (await res.json()) as Preview | SendErr;
      if (!res.ok) {
        const extra =
          'detalle' in json && json.detalle ? `: ${JSON.stringify(json.detalle)}` : '';
        setError(('error' in json ? json.error : 'No se pudo previsualizar') + extra);
        return;
      }
      setPreview(json as Preview);
    } catch {
      setError('Error de red al previsualizar.');
    } finally {
      setPreviewing(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk(null);
    setLoading(true);
    try {
      for (const f of files) {
        if (f.size > MAX_ATTACHMENT_BYTES) {
          setError(`"${f.name}" supera ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
          return;
        }
      }
      const adjuntos = await Promise.all(files.map(fileToAdjunto));
      const payload =
        modo === 'plantilla'
          ? { email, nombre, tipo, data, origen: origen || undefined, adjuntos }
          : { email, nombre, asunto, cuerpo, origen: origen || undefined, adjuntos };
      const res = await apiFetch('/api/mail', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let parsed: SendOk | SendErr;
      try {
        parsed = JSON.parse(raw) as SendOk | SendErr;
      } catch {
        setError('El servidor devolvió un error inesperado.');
        return;
      }
      if (!res.ok) {
        const message = 'error' in parsed ? parsed.error : 'No se pudo enviar el mail';
        const detalle = 'detalle' in parsed ? parsed.detalle : undefined;
        const extra =
          typeof detalle === 'string'
            ? detalle
            : detalle
              ? JSON.stringify(detalle)
              : '';
        setError(extra ? `${message}: ${extra}` : message);
        return;
      }
      setOk(parsed as SendOk);
      setFiles([]);
    } catch {
      setError('Error de red al enviar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Enviar mail de prueba</h1>
        <p className="muted">
          Usa el mismo endpoint que los sistemas internos. Elegí una plantilla
          (tipo + data) o, si el sistema lo permite, HTML libre. Adjuntá PDF,
          DOC/DOCX e imágenes, hasta {MAX_ATTACHMENTS} archivos y{' '}
          {MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB c/u. Si no elegís sistema,
          el origen queda como <code>panel</code>.
        </p>
      </header>

      <form className="form card" onSubmit={onSubmit}>
        <label>
          Sistema (origen)
          <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
            <option value="">panel (sin sistema)</option>
            {sistemas.map((s) => (
              <option key={s.id} value={s.origen}>
                {s.nombre} ({s.origen}) · {s.clasificacion}
                {s.permiteRawHtml ? ' · HTML libre' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="actions" style={{ marginTop: 0 }}>
          <button
            type="button"
            className={`btn${modo === 'plantilla' ? '' : ' secondary'}`}
            onClick={() => setModo('plantilla')}
          >
            Plantilla
          </button>
          <button
            type="button"
            className={`btn${modo === 'html' ? '' : ' secondary'}`}
            onClick={() => setModo('html')}
          >
            HTML libre
          </button>
        </div>

        {modo === 'plantilla' ? (
          <>
            <label>
              Plantilla
              <select required value={tipo} onChange={(e) => onTipoChange(e.target.value)}>
                <option value="">Elegí un tipo</option>
                {plantillas.map((p) => (
                  <option key={p.tipo} value={p.tipo}>
                    {p.nombre} ({p.tipo})
                  </option>
                ))}
              </select>
            </label>
            {plantilla ? (
              <p className="muted" style={{ marginTop: 0 }}>
                {plantilla.descripcion} · {plantilla.clasificacion}
                {plantilla.origenes ? ` · solo ${plantilla.origenes.join(', ')}` : ''}
              </p>
            ) : null}
            {plantilla?.campos.map((c) => (
              <label key={c.nombre}>
                {c.etiqueta}
                {c.requerido ? ' *' : ''}
                {c.tipo === 'texto' || c.tipo === 'lista' ? (
                  <textarea
                    required={c.requerido}
                    value={
                      c.tipo === 'lista'
                        ? ((data[c.nombre] as string[]) ?? []).join('\n')
                        : ((data[c.nombre] as string) ?? '')
                    }
                    onChange={(e) =>
                      setCampo(
                        c.nombre,
                        c.tipo === 'lista'
                          ? e.target.value.split(/\r?\n/).filter((l) => l.trim())
                          : e.target.value
                      )
                    }
                    placeholder={
                      Array.isArray(c.ejemplo) ? c.ejemplo.join('\n') : c.ejemplo
                    }
                  />
                ) : (
                  <input
                    required={c.requerido}
                    type={c.tipo === 'url' ? 'url' : 'text'}
                    value={(data[c.nombre] as string) ?? ''}
                    onChange={(e) => setCampo(c.nombre, e.target.value)}
                    placeholder={typeof c.ejemplo === 'string' ? c.ejemplo : ''}
                  />
                )}
                {c.ayuda ? <span className="muted">{c.ayuda}</span> : null}
                {c.tipo === 'lista' ? (
                  <span className="muted">Una línea por ítem.</span>
                ) : null}
              </label>
            ))}
            <div className="actions" style={{ marginTop: 0 }}>
              <button
                className="btn secondary"
                type="button"
                disabled={!tipo || previewing}
                onClick={() => void onPreview()}
              >
                {previewing ? 'Armando…' : 'Vista previa'}
              </button>
            </div>
            {preview ? (
              <div className="card" style={{ margin: 0 }}>
                <p>
                  <strong>{preview.asunto}</strong>
                </p>
                <div className="html-body" dangerouslySetInnerHTML={{ __html: preview.html }} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="alert warn">
              El HTML libre solo lo aceptan los sistemas con esa opción activa.
              Conviene migrar a una plantilla (tipo + data).
            </div>
            <label>
              Asunto
              <input
                required
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
              />
            </label>
            <label>
              Cuerpo (HTML)
              <textarea
                required
                value={cuerpo}
                onChange={(e) => setCuerpo(e.target.value)}
              />
            </label>
          </>
        )}

        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          Adjuntos
          <input
            type="file"
            accept={ACCEPT}
            multiple
            onChange={(e) => onFilesChange(e.target.files)}
          />
        </label>
        {files.length > 0 ? (
          <ul className="muted" style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`}>
                {f.name} ({Math.round(f.size / 1024)} KB)
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <div className="alert error">{error}</div> : null}
        {ok ? (
          <div className="alert ok">
            {ok.duplicado
              ? `Ya existía un envío con esa clave (id ${ok.id})`
              : ok.estado === 'en_cola'
                ? `Mail encolado (id ${ok.id}); el worker lo envía en segundos`
                : `SES aceptó el mail (id ${ok.id} — ${ok.messageId})`}
            {ok.adjuntos?.length ? ` · adjuntos: ${ok.adjuntos.join(', ')}` : ''}.
            Revisá spam si no aparece.
          </div>
        ) : null}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
    </main>
  );
}
