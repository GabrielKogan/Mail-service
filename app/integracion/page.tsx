import Link from 'next/link';

const campos = [
  ['email', 'Obligatorio'],
  ['tipo + data', 'Plantilla. Es la forma recomendada. GET /api/plantillas lista tipos, campos y un ejemplo de data.'],
  ['asunto + cuerpo', 'HTML libre, solo si el sistema lo tiene habilitado. No se mezcla con tipo.'],
  ['nombre', 'Opcional. Lo usa el saludo de la plantilla.'],
  ['idempotency_key', 'Única por mail lógico. Letras, números y . _ : -, hasta 200 caracteres. El reintento usa la misma.'],
  ['origen', 'Opcional. Si no coincide con la clave, la API responde 403 origen_no_coincide.'],
  ['adjuntos', 'Hasta 15 archivos, 20 MB cada uno y 28 MB en total. PDF, DOC, DOCX, PNG, JPG, GIF o WEBP, en contentBase64 sin el prefijo data:.'],
];

const respuestas = [
  ['200', 'enviado', 'El proveedor aceptó el mail (modo sync). Trae id, estado, messageId y log.'],
  ['202', 'encolado', 'Quedó registrado para el worker. El log no afirma que la cola ya lo haya tomado.'],
  ['200 / 202', 'duplicado', 'La misma idempotency_key y el mismo contenido: no se reenvía. El log dice el id y el estado del original.'],
  ['400', 'json_invalido, datos_invalidos, plantilla_inexistente, plantilla_invalida o un adjunto', 'Si fallan varios archivos, codigo es el de mayor prioridad y log nombra todos.'],
  ['401', 'no_autorizado', 'Falta la clave, está revocada o el sistema está inactivo.'],
  ['403', 'origen_no_coincide, html_libre_no_permitido, plantilla_no_permitida', 'La clave no autoriza ese origen, el HTML libre o esa plantilla.'],
  ['409', 'idempotencia_conflicto', 'La misma clave se usó con otro contenido. Es un error de integración.'],
  ['422', 'destinatario_suprimido', 'Definitivo: no reintentar. plantilla_no_permitida también puede responder 422.'],
  ['500', 'registro_fallido', 'No se pudo guardar el envío.'],
  ['502', 'envio_fallido', 'El proveedor rechazó el mail. El log repite el detalle.'],
];

const adjuntos = [
  ['tipo_adjunto_no_permitido', 'La extensión o el MIME no es PDF, DOC, DOCX, PNG, JPG, GIF ni WEBP.'],
  ['nombre_archivo_invalido', 'El nombre trae una barra o está vacío.'],
  ['adjunto_vacio', 'El base64 no tiene contenido.'],
  ['adjunto_demasiado_grande', 'Ese archivo supera 20 MB.'],
  ['demasiados_adjuntos', 'Hay más de 15 archivos.'],
  ['adjuntos_total_excedido', 'Entre todos superan 28 MB.'],
];

export default function IntegracionPage() {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Guía de integración</h1>
        <p className="muted">
          Lo mismo que documenta el README para quien llama a la API: clave,
          cuerpo, adjuntos y qué guardar de la respuesta.{' '}
          <Link href="/">Volver al inicio</Link>
        </p>
      </header>

      <div className="stack">
        <section className="card">
          <h2 className="card-title">Clave y origen</h2>
          <p className="muted">
            Cada sistema se da de alta en <Link href="/sistemas">Sistemas</Link>.
            «Generar clave» muestra <span className="code">mls_prefijo_secreto</span> una
            sola vez. El header de cada llamada es{' '}
            <span className="code">x-api-key</span>. El origen del envío sale de
            esa clave. Para rotarla: generar otra, cambiarla en el sistema y
            revocar la anterior.
          </p>
          <p className="muted">
            Los sistemas nuevos no pueden mandar HTML libre. Sin ese permiso,{' '}
            <span className="code">POST /api/mail</span> exige{' '}
            <span className="code">tipo</span> y <span className="code">data</span>.
            La clave va en el backend: en el navegador queda expuesta.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">POST /api/mail</h2>
          <div className="table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Uso</th>
                </tr>
              </thead>
              <tbody>
                {campos.map(([campo, uso]) => (
                  <tr key={campo}>
                    <td>
                      <span className="code">{campo}</span>
                    </td>
                    <td>{uso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 12, marginBottom: 6 }}>
            Ejemplo
          </p>
          <pre className="code-block">{`curl -X POST https://mail.ejemplo.gob.ar/api/mail \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $MAIL_SERVICE_API_KEY" \\
  -d '{"email":"vecino@ejemplo.com","nombre":"Nombre","tipo":"turno_confirmacion",
       "data":{"area":"Registro Civil","fecha":"25/09/2026","hora":"10:00","lugar":"San Martín 50"},
       "idempotency_key":"turno-12345-confirmacion"}'`}</pre>
        </section>

        <section className="card">
          <h2 className="card-title">Qué devuelve</h2>
          <p className="muted">
            Todas las respuestas traen <span className="code">ok</span>,{' '}
            <span className="code">codigo</span> y <span className="code">log</span>.
            El sistema que llama tiene que persistir <span className="code">log</span>{' '}
            cuando el envío sale bien y cuando se rechaza. Es una frase con el
            destinatario, el id si ya existe, los nombres de archivo y el límite
            que se pasó. No trae el base64 ni el HTML.
          </p>
          <div className="table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>HTTP</th>
                  <th>codigo</th>
                  <th>Qué hacer</th>
                </tr>
              </thead>
              <tbody>
                {respuestas.map(([http, codigo, que]) => (
                  <tr key={http}>
                    <td>{http}</td>
                    <td>
                      <span className="code">{codigo}</span>
                    </td>
                    <td>{que}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Ante un timeout o un 5xx, reintentar con la misma{' '}
            <span className="code">idempotency_key</span>. Un{' '}
            <span className="code">422</span> de supresión no se reintenta.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">Códigos de adjuntos</h2>
          <p className="muted">
            Si un request trae varios problemas, <span className="code">codigo</span>{' '}
            es el primero de esta lista. <span className="code">detalle</span> y{' '}
            <span className="code">log</span> enumeran todos. Un archivo grande
            informa <span className="code">archivo</span>,{' '}
            <span className="code">bytes</span> y <span className="code">maxBytes</span>.
          </p>
          <div className="table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>codigo</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {adjuntos.map(([codigo, motivo]) => (
                  <tr key={codigo}>
                    <td>
                      <span className="code">{codigo}</span>
                    </td>
                    <td>{motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Estadísticas del sistema</h2>
          <p className="muted">
            <span className="code">GET /api/sistemas/:id/stats</span> con la clave de ese
            sistema. El id es el número que figura en Sistemas: la clave del sistema 1
            recibe las estadísticas del sistema 1 y no las de otro. La respuesta trae{' '}
            <span className="code">ok</span>, <span className="code">codigo</span>,{' '}
            <span className="code">log</span>, el total, el resumen (entregados, abiertos,
            errores) y la serie por día. Filtros opcionales:{' '}
            <span className="code">desde</span>, <span className="code">hasta</span>,{' '}
            <span className="code">estado</span>, <span className="code">tipo</span> y{' '}
            <span className="code">q</span>.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">Consultar un envío</h2>
          <p className="muted">
            <span className="code">GET /api/mail/:id</span> con la misma clave
            devuelve estado, messageId, error, intentos y eventos. Un id de otro
            sistema responde 404. Estados:{' '}
            <span className="code">en_cola</span>, <span className="code">enviando</span>,{' '}
            <span className="code">enviado</span>, <span className="code">entregado</span>,{' '}
            <span className="code">abierto</span>, y los finales{' '}
            <span className="code">rebotado</span>, <span className="code">queja</span>,{' '}
            <span className="code">rechazado</span>, <span className="code">suprimido</span>,{' '}
            <span className="code">error</span> y <span className="code">revisar</span>.
          </p>
        </section>
      </div>
    </main>
  );
}
