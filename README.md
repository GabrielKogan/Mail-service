# Mail Service - Municipalidad de Luján de Cuyo

Servicio de envío de mails con registro de envíos para dashboard interno.
El motor de entrega es intercambiable: por defecto usa Amazon SES (SMTP);
se puede pasar a Brevo o a otro SMTP cambiando variables de entorno, sin
tocar el endpoint. Registra envíos, eventos SES (entrega, rebote, queja,
apertura), bajas por origen y una lista de supresión.

## Setup

```bash
pnpm install
cp .env.example .env
# completar .env (SQL Server, token interno, y SES / Brevo / SMTP según MAIL_PROVIDER)
pnpm prisma generate
pnpm prisma db push   # crea/actualiza tablas en SQL Server (mail_log, eventos, supresión)
pnpm dev
```

## Proveedor de envío

`MAIL_PROVIDER` elige el adaptador (`lib/mail`). Default: `ses`.

### Amazon SES (default, SMTP)

En la consola de AWS: verificá el dominio o el remitente (`MAIL_FROM_EMAIL`),
creá [SMTP credentials](https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html)
en SES (no uses el Access Key de IAM como password SMTP) y completá:

```
MAIL_PROVIDER=ses
AWS_REGION=us-east-1
MAIL_FROM_EMAIL=registro@lujandecuyo.gob.ar
MAIL_FROM_NAME=Municipalidad de Lujan de Cuyo
SMTP_USER=...
SMTP_PASS=...
```

El host se arma como `email-smtp.{AWS_REGION}.amazonaws.com` (puerto 587 /
STARTTLS). Podés forzar `SMTP_HOST`, `SMTP_PORT` o `SMTP_SECURE` si hace falta.

Mientras la cuenta esté en **sandbox** de SES, solo se entrega a direcciones
o dominios verificados en esa cuenta. Para producción hay que pedir salida
del sandbox en AWS.

### Brevo (API transaccional)

```
MAIL_PROVIDER=brevo
BREVO_API_KEY=...
MAIL_FROM_EMAIL=registro@lujandecuyo.gob.ar
MAIL_FROM_NAME=Municipalidad de Lujan de Cuyo
```

### SMTP genérico

Para EnvíaloSimple u otro relay (host obligatorio):

```
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.envialosimple.email
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

Reiniciar el proceso después de cambiar el `.env`. Puerto 587 usa STARTTLS;
465 usa SSL.

Para otra API, agregar un archivo en `lib/mail/providers/` y un `case` en
`getMailProvider()`. El resto del sistema no se toca.

## API para otras plataformas

`POST /api/mail` envía el correo y lo guarda en `mail_log` (visible en `/dashboard`).
Identificá el sistema con `origen`. El remitente guardado es `MAIL_FROM_EMAIL`.

Si el destinatario está en la lista de supresión, **no** se llama a SES: se
guarda el intento con estado `suprimido` y la API responde **422**.

Auth (uno de los dos):

- `x-internal-token: <INTERNAL_API_TOKEN>`
- `Authorization: Bearer <INTERNAL_API_TOKEN>`

Body JSON: `{ "email", "nombre", "asunto", "cuerpo", "origen", "adjuntos?" }`.

`adjuntos` (opcional): array de `{ "filename", "contentType", "contentBase64" }`.
Tipos: PDF, DOC, DOCX, PNG, JPG, GIF, WEBP. Máx. 5 archivos, 4 MB c/u, 10 MB en total.

Desde un backend:

```bash
curl -X POST http://localhost:3000/api/mail \
  -H "Content-Type: application/json" \
  -H "x-internal-token: $INTERNAL_API_TOKEN" \
  -d '{"email":"vecino@ejemplo.com","nombre":"Nombre","asunto":"Asunto","cuerpo":"<p>HTML</p>","origen":"turnos","adjuntos":[{"filename":"turno.pdf","contentType":"application/pdf","contentBase64":"<base64>"}]}'
```

Desde un frontend, listá el origen de esa web en `CORS_ORIGINS` (separados por coma, o `*` solo en pruebas). El token en el navegador queda expuesto; lo ideal es un backend proxy.

```js
await fetch("https://mail.ejemplo.gob.ar/api/mail", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer " + token,
  },
  body: JSON.stringify({
    email: "vecino@ejemplo.com",
    nombre: "Nombre",
    asunto: "Asunto",
    cuerpo: "<p>HTML</p>",
    origen: "expediente",
  }),
});
```

- `GET /api/dashboard` — lista paginada (sin `cuerpo`). Mismos headers.
  - Query: `estado`, `origen`, `q`, `desde`, `hasta`, `page`
- `GET /api/dashboard/stats` — agregados para gráficos (por estado, origen, serie diaria, KPIs).
  - Mismos filtros que la lista (sin `page`).
- `GET /api/dashboard/:id` — detalle (`cuerpo`, `errorDetalle`, `remitente`, `eventos`).
- `GET /api/dashboard/supresion` — lista de direcciones bloqueadas (`q`, `activo`, `page`).
- `PATCH /api/dashboard/supresion` — `{ "id", "activo" }` para reactivar o volver a bloquear.

## Plantillas de ejemplo

Solo en la UI `/enviar` (selector “Usar ejemplo”). La API sigue recibiendo
`asunto` + `cuerpo` HTML. Ejemplos: confirmación de turno, actualización de
trámite, recordatorio de documentación.

## Supresión, rebotes y bajas

Tabla `mail_supresion`. Antes de enviar, se consulta por email (minúsculas):

- `origen = '*'` (global): bloquea **todos** los sistemas.
- `origen` exacto: bloquea solo ese sistema.

| Evento | Qué hace |
|---|---|
| Rebote **permanente** (SES Bounce Permanent) | Supresión global (`*`), motivo `rebote` |
| Queja / spam (SES Complaint) | Supresión global (`*`), motivo `queja` |
| Rebote transitorio | Solo se registra el evento; no se bloquea |
| Baja del destinatario | Supresión `email + origen` del mail, motivo `baja` |

Si hay `APP_BASE_URL`, **todos** los mails incluyen pie de baja y headers
`List-Unsubscribe` / `List-Unsubscribe-Post` (one-click).

Orígenes críticos (`MAIL_ORIGENES_CRITICOS`, default `turnos,expediente`):
el link está, pero si el vecino confirma la baja se explica que es una
notificación oficial y **no** se suprime. Turnos y expedientes siguen
enviándose.

- Página pública: `GET /baja/:id?t=…` (sin login)
- API: `GET`/`POST /api/t/unsub/:id?t=…`

## Tracking de entrega y apertura

Estados posibles: `enviado` → `entregado` → `abierto` (también `rebotado`,
`queja`, `suprimido`, `error`).

### Apertura (píxel)

Al enviar, si `APP_BASE_URL` está definido, se inserta un píxel en el HTML que pega a
`GET /api/t/open/:id?t=…`. Cuando el cliente carga imágenes, el estado pasa a `abierto`
y se guarda un evento en `mail_log_eventos`.

La URL debe ser **alcanzable desde internet** (no `localhost`). En desarrollo podés
usar un túnel (ngrok, Cloudflare Tunnel, etc.).

### Entrega / rebote / apertura SES

1. En SES (misma región): creá un **Configuration set** (ej. `mail-service-events`).
2. Activá event publishing: Delivery, Bounce, Complaint, Open (y Click si querés).
3. Destino: **SNS** (topic Standard) → suscripción **HTTPS** a  
   `https://TU-DOMINIO/api/webhooks/ses`  
   Confirmá la suscripción (el endpoint responde al `SubscribeURL` de SNS).
4. En el `.env`:

```
APP_BASE_URL=https://tu-mail-service.ejemplo.gob.ar
SES_CONFIGURATION_SET=mail-service-events
```

Los envíos SES llevan `X-SES-CONFIGURATION-SET` y el tag `mail_log_id` para correlacionar
eventos con el registro del dashboard. Un **Bounce Permanent** o **Complaint** además
agrega al destinatario a `mail_supresion` (todos los orígenes).

**Límites:** “entregado” = el servidor del destinatario aceptó el mail (puede ir a spam).
“abierto” es aproximado (algunos clientes bloquean imágenes o precargan el píxel).

### Webhook

- `POST /api/webhooks/ses` — sin token interno; pensado para SNS.

## UI interna

Ingresar en `/login` con el `INTERNAL_API_TOKEN`. Luego:

- `/` — inicio
- `/enviar` — mail de prueba (con ejemplos)
- `/dashboard` — tabla, filtros y detalle
- `/supresion` — lista de bloqueos y reactivar

## Estructura

```
app/
  api/
    mail/route.ts
    dashboard/route.ts
    dashboard/[id]/route.ts
    dashboard/supresion/route.ts
    t/open/[id]/route.ts
    t/unsub/[id]/route.ts
    webhooks/ses/route.ts
  login/page.tsx
  enviar/page.tsx
  dashboard/page.tsx
  supresion/page.tsx
  baja/[id]/page.tsx
lib/
  mail/
  client/token.ts
  prisma.ts
  validation.ts
  auth.ts
  cors.ts
components/
  AppShell.tsx
  AuthGate.tsx
```

## Pendiente (siguientes pasos)

- [ ] Autenticación de usuarios (hoy es el token interno)
- [ ] Rate limiting en `/api/mail`
- [ ] Verificar firma SNS (opcional, endurecer webhook)
