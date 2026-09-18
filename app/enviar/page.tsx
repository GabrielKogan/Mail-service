'use client';

import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/client/token';

type SendOk = { ok: true; id: number; messageId: string };
type SendErr = { error: string; detalle?: string };

export default function EnviarPage() {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('<p></p>');
  const [origen, setOrigen] = useState('prueba-ui');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState<SendOk | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/mail', {
        method: 'POST',
        body: JSON.stringify({ email, nombre, asunto, cuerpo, origen }),
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
        Usa el mismo endpoint que los sistemas internos. SES puede aceptar el
        envío y igual no llegar a la bandeja: no uses Gmail/Outlook/Yahoo como
        remitente; Gmail lo descarta por DMARC. Revisá spam del destinatario.
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
        {error ? <div className="alert error">{error}</div> : null}
        {ok ? (
          <div className="alert ok">
            SES aceptó el mail (id {ok.id} — {ok.messageId}). Eso no confirma
            que esté en la bandeja. Si el remitente es @gmail.com, Gmail suele
            descartarlo; no uses Gmail como From. Revisá spam.
          </div>
        ) : null}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
    </main>
  );
}
