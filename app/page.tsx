import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page">
      <h1>Mail Service</h1>
      <p className="muted">
        Servicio interno de la Municipalidad de Luján de Cuyo para enviar
        correos desde los sistemas municipales y registrar a quién se le envió,
        desde qué origen y si el envío fue aceptado.
      </p>

      <div className="grid-2">
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Enviar un mail</h2>
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
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Dashboard</h2>
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
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>
          Cómo lo llaman los sistemas
        </h2>
        <p className="muted">
          <span className="code">POST /api/mail</span> con el token interno
          en <span className="code">x-internal-token</span> o{' '}
          <span className="code">Authorization: Bearer</span>. El campo{' '}
          <span className="code">origen</span> identifica la plataforma y
          aparece en el dashboard. Desde un frontend hay que listar el origen
          en <span className="code">CORS_ORIGINS</span>. Preferí un backend
          proxy: el token en el navegador queda expuesto.
        </p>
        <p className="muted" style={{ marginTop: 12, marginBottom: 6 }}>
          Servidor (curl)
        </p>
        <pre className="code-block">{`curl -X POST http://localhost:3000/api/mail \\
  -H "Content-Type: application/json" \\
  -H "x-internal-token: <INTERNAL_API_TOKEN>" \\
  -d '{
    "email": "vecino@ejemplo.com",
    "nombre": "Nombre",
    "asunto": "Asunto",
    "cuerpo": "<p>HTML</p>",
    "origen": "nombre-del-sistema"
  }'`}</pre>
        <p className="muted" style={{ marginTop: 12, marginBottom: 6 }}>
          Navegador (fetch)
        </p>
        <pre className="code-block">{`await fetch("http://localhost:3000/api/mail", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer <INTERNAL_API_TOKEN>",
  },
  body: JSON.stringify({
    email: "vecino@ejemplo.com",
    nombre: "Nombre",
    asunto: "Asunto",
    cuerpo: "<p>HTML</p>",
    origen: "nombre-del-sistema",
  }),
});`}</pre>
      </section>
    </main>
  );
}
