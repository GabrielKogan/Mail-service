'use client';

import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/client/token';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from '@/lib/attachment-limits';

type SendOk = { ok: true; id: number; messageId: string; adjuntos?: string[] };
type SendErr = { error: string; detalle?: string };

type AdjuntoPayload = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

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

export default function EnviarPage() {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('<p></p>');
  const [origen, setOrigen] = useState('prueba-ui');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState<SendOk | null>(null);

  function onFilesChange(list: FileList | null) {
    if (!list) {
      setFiles([]);
      return;
    }
    const next = Array.from(list).slice(0, MAX_ATTACHMENTS);
    setFiles(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk(null);
    setLoading(true);
    try {
      for (const f of files) {
        if (f.size > MAX_ATTACHMENT_BYTES) {
          setError(
            `"${f.name}" supera ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`
          );
          return;
        }
      }

      const adjuntos = await Promise.all(files.map(fileToAdjunto));

      const res = await apiFetch('/api/mail', {
        method: 'POST',
        body: JSON.stringify({
          email,
          nombre,
          asunto,
          cuerpo,
          origen,
          adjuntos,
        }),
      });
      const raw = await res.text();
      let data: SendOk | SendErr;
      try {
        data = JSON.parse(raw) as SendOk | SendErr;
      } catch {
        setError('El servidor devolvió un error inesperado.');
        return;
      }
      if (!res.ok) {
        const message = 'error' in data ? data.error : 'No se pudo enviar el mail';
        const detalle = 'detalle' in data ? data.detalle : undefined;
        setError(detalle ? `${message}: ${detalle}` : message);
        return;
      }
      setOk(data as SendOk);
      setFiles([]);
    } catch {
      setError('Error de red al enviar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <h1>Enviar mail de prueba</h1>
      <p className="muted">
        Usa el mismo endpoint que los sistemas internos. Podés adjuntar PDF,
        DOC/DOCX e imágenes (PNG, JPG, GIF, WEBP), hasta {MAX_ATTACHMENTS}{' '}
        archivos y {MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB c/u.
      </p>

      <form className="form" onSubmit={onSubmit} style={{ marginTop: 16 }}>
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
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
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
        <label>
          Origen
          <input
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            placeholder="nombre del sistema"
          />
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
            SES aceptó el mail (id {ok.id} — {ok.messageId})
            {ok.adjuntos?.length
              ? ` · adjuntos: ${ok.adjuntos.join(', ')}`
              : ''}
            . Revisá spam si no aparece.
          </div>
        ) : null}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
    </main>
  );
}
