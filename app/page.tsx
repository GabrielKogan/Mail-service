import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Mail Service</h1>
        <p className="muted">
          Servicio interno de la Municipalidad de Luján de Cuyo para enviar
          correos desde los sistemas municipales y registrar a quién se le envió,
          desde qué origen y si el envío fue aceptado.
        </p>
      </header>

      <div className="grid-2">
        <section className="card home-card">
          <h2 className="card-title">Enviar un mail</h2>
          <p className="muted">
            Prueba manual desde el navegador. Los sistemas productivos deben
            usar la API, no esta pantalla.
          </p>
          <div className="actions">
            <Link className="btn" href="/enviar">
              Ir a enviar
            </Link>
          </div>
        </section>
        <section className="card home-card">
          <h2 className="card-title">Dashboard</h2>
          <p className="muted">
            Historial de envíos con filtros por estado, origen, fecha y texto.
          </p>
          <div className="actions">
            <Link className="btn" href="/dashboard">
              Ver registros
            </Link>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Cómo lo llaman los sistemas</h2>
        <p className="muted">
          <span className="code">POST /api/mail</span> con la clave del sistema
          en <span className="code">x-api-key</span> (se genera en{' '}
          <Link href="/sistemas">Sistemas</Link>). El origen sale de la
          credencial. Mandá siempre una{' '}
          <span className="code">idempotency_key</span> única por mail: si
          reintentás con la misma, no se envía dos veces. Respuestas:{' '}
          <span className="code">200</span>/<span className="code">202</span>{' '}
          aceptado, <span className="code">422</span> destinatario suprimido
          (definitivo), <span className="code">409</span> clave reutilizada con
          otro contenido. El estado se consulta con{' '}
          <span className="code">GET /api/mail/:id</span>. Preferí llamar desde
          un backend: la clave en el navegador queda expuesta.
        </p>
        <p className="muted" style={{ marginTop: 12, marginBottom: 6 }}>
          Servidor (curl)
        </p>
        <pre className="code-block">{`curl -X POST http://localhost:3000/api/mail \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: mls_xxxxxxxx_..." \\
  -d '{
    "email": "vecino@ejemplo.com",
    "nombre": "Nombre",
    "asunto": "Asunto",
    "cuerpo": "<p>HTML</p>",
    "idempotency_key": "turno-12345-confirmacion"
  }'`}</pre>
        <p className="muted" style={{ marginTop: 12, marginBottom: 6 }}>
          Node (fetch)
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
    asunto: "Asunto",
    cuerpo: "<p>HTML</p>",
    idempotency_key: "expediente-987-actualizacion-3",
    adjuntos: [
      {
        filename: "documento.pdf",
        contentType: "application/pdf",
        contentBase64: "<base64-sin-prefijo-data>",
      },
    ],
  }),
});
// 200 o 202: { ok, id, estado?, messageId?, duplicado? }
// 422: no reintentar. 409: error de integración (misma clave, otro contenido).`}</pre>
      </section>
    </main>
  );
}
