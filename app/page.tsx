"use client";

import Link from 'next/link';
import { useState } from 'react';
import NewSystemModal from '@/components/NewSystemModal';

export default function HomePage() {
  const [showNewModal, setShowNewModal] = useState(false);
  const [newKey, setNewKey] = useState<{ sistema: string; key: string } | null>(null);
  return (
    <main className="page">
      <header className="page-header">
        <h1>Mail Service</h1>
        <p className="muted">
          Servicio interno de la Municipalidad de Luján de Cuyo para enviar
          correos desde los sistemas municipales y registrar a quién se le envió,
          desde qué origen y si el envío fue aceptado.
        </p>
        <div style={{ marginTop: 8 }}>
          <button className="btn" type="button" onClick={() => setShowNewModal(true)}>
            Crear sistema + generar clave
          </button>
        </div>
      </header>
      {newKey ? (
        <div className="alert ok">
          <p style={{ margin: 0 }}>
            Clave nueva para <strong>{newKey.sistema}</strong>. Copiala ahora: no se vuelve a mostrar.
          </p>
          <pre className="code" style={{ userSelect: 'all', whiteSpace: 'pre-wrap' }}>{newKey.key}</pre>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn secondary" type="button" onClick={() => void navigator.clipboard?.writeText(newKey.key)}>Copiar</button>
            <button className="btn secondary" type="button" onClick={() => setNewKey(null)}>Ya la guardé</button>
          </div>
        </div>
      ) : null}

      <section className="card" style={{ marginTop: 8 }}>
        <div className="section-head">
          <h2 className="card-title">Integrar un sistema</h2>
          <div>
            <Link className="btn secondary" href="/integracion">Guía completa</Link>
          </div>
        </div>
        <p className="muted">
          La llamada sale del backend del sistema, con la clave en <span className="code">x-api-key</span>.
          El origen lo define esa clave, no el cuerpo del request. La guía completa tiene los mismos
          campos, códigos y ejemplos que el README.
        </p>
        <h3 className="card-title" style={{ marginTop: 14, fontSize: '1rem' }}>Plantillas y HTML libre</h3>
        <p className="muted">
          Una plantilla arma el correo acá. El sistema manda <span className="code">tipo</span> y{' '}
          <span className="code">data</span> (fecha, lugar, número de expediente) y este servicio
          pone el membrete, el saludo y el pie. Los datos se escapan, así que no se interpretan
          como HTML. La baja se agrega solo si la plantilla es de suscripción.{' '}
          <span className="code">GET /api/plantillas</span> lista los tipos y los campos.
        </p>
        <p className="muted">
          Si el sistema ya redacta el mensaje, mandá HTML libre: <span className="code">asunto</span> y{' '}
          <span className="code">cuerpo</span>. Al crear el sistema hay que marcar «Permite enviar
          HTML libre»; si no, la API responde <span className="code">html_libre_no_permitido</span>.
          No se mezcla con <span className="code">tipo</span>. El cuerpo es HTML: un salto de línea
          del texto no se ve en el mail, hace falta <span className="code">&lt;p&gt;</span> o{' '}
          <span className="code">&lt;br&gt;</span>.
        </p>
        <ol className="guide-steps">
          <li>En <Link href="/sistemas">Sistemas</Link> se da de alta el origen, se marca HTML libre y se genera la clave <span className="code">mls_…</span>. Se muestra una sola vez.</li>
          <li><span className="code">POST /api/mail</span> con <span className="code">asunto</span>, <span className="code">cuerpo</span> y una <span className="code">idempotency_key</span> única por mail lógico.</li>
          <li>Toda respuesta trae <span className="code">ok</span>, <span className="code">codigo</span> y <span className="code">log</span>. Guardá <span className="code">log</span> en tu sistema.</li>
          <li>
            <span className="code">GET /api/sistemas/1/stats</span> con la misma clave devuelve las estadísticas del sistema 1.
            El número es el id que se ve en Sistemas. La clave de otro sistema recibe 403.
          </li>
        </ol>
      </section>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card home-card">
          <h2 className="card-title">Enviar un mail</h2>
          <p className="muted">Prueba manual desde el navegador. Los sistemas productivos deben usar la API.</p>
          <div className="actions"><Link className="btn" href="/enviar">Ir a enviar</Link></div>
        </section>
        <section className="card home-card">
          <h2 className="card-title">Dashboard</h2>
          <p className="muted">Historial de envíos con filtros por estado, origen, fecha y texto.</p>
          <div className="actions"><Link className="btn" href="/dashboard">Ver registros</Link></div>
        </section>
      </div>

      {/* Removed duplicate Integracion card (kept above) */}

      {showNewModal ? (
        <NewSystemModal
          onClose={() => setShowNewModal(false)}
          onCreated={(k) => {
            setNewKey(k);
            setShowNewModal(false);
          }}
        />
      ) : null}
      <section className="card" style={{ marginTop: 16 }}>
        <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
          Servidor (curl)
        </p>
        <pre className="code-block">{`curl -X POST http://localhost:3000/api/mail \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: mls_xxxxxxxx_..." \\
  -d '{
    "email": "vecino@ejemplo.com",
    "nombre": "Nombre",
    "asunto": "Turno confirmado",
    "cuerpo": "<p>Hola, tu turno es el 25/09 a las 10:00 en San Martín 50.</p>",
    "idempotency_key": "turno-12345-confirmacion"
  }'`}</pre>
        <p className="muted" style={{ marginTop: 12, marginBottom: 6 }}>
          Backend (fetch)
        </p>
        <pre className="code-block">{`const res = await fetch("http://localhost:3000/api/mail", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.MAIL_SERVICE_API_KEY,
  },
  body: JSON.stringify({
    email: "vecino@ejemplo.com",
    nombre: "Nombre",
    asunto: "Turno confirmado",
    cuerpo: "<p>Hola, tu turno es el 25/09 a las 10:00 en San Martín 50.</p>",
    idempotency_key: "turno-12345-confirmacion",
    adjuntos: [{
      filename: "constancia.pdf",
      contentType: "application/pdf",
      contentBase64: "<base64-sin-prefijo-data>",
    }],
  }),
});
const json = await res.json();
// Guardar json.log en el sistema (éxito o error).
// json.codigo: enviado | encolado | duplicado | adjunto_demasiado_grande | destinatario_suprimido | ...
// 422 destinatario_suprimido: no reintentar.
// 409 idempotencia_conflicto: la misma clave se usó con otro contenido.
// Timeout o 5xx: reintentar con la misma idempotency_key.`}</pre>
      </section>
    </main>
  );
}
