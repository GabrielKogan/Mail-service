# Mail Service - Municipalidad de Luján de Cuyo

Servicio de envío de mails con registro de envíos para dashboard interno.
El motor de entrega es intercambiable: por defecto usa Amazon SES (SMTP);
se puede pasar a Brevo o a otro SMTP cambiando variables de entorno, sin
tocar el endpoint. Versión inicial sin webhook: solo registra `enviado` /
`error` en el momento del envío.

## Setup

```bash
pnpm install
cp .env.example .env
# completar .env (SQL Server, token interno, y SES / Brevo / SMTP según MAIL_PROVIDER)
pnpm prisma generate
pnpm prisma migrate dev --name init   # o `prisma db pull` si la tabla ya existe en SQL Server
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

Auth (uno de los dos):

- `x-internal-token: <INTERNAL_API_TOKEN>`
- `Authorization: Bearer <INTERNAL_API_TOKEN>`

Body JSON: `{ "email": "...", "nombre": "...", "asunto": "...", "cuerpo": "...", "origen": "..." }`.

Desde un backend:

```bash
curl -X POST http://localhost:3000/api/mail \
  -H "Content-Type: application/json" \
  -H "x-internal-token: $INTERNAL_API_TOKEN" \
  -d '{"email":"vecino@ejemplo.com","nombre":"Nombre","asunto":"Asunto","cuerpo":"<p>HTML</p>","origen":"turnos"}'
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
- `GET /api/dashboard/:id` — detalle (`cuerpo`, `errorDetalle`, `remitente`).

## UI interna

Ingresar en `/login` con el `INTERNAL_API_TOKEN`. Luego:

- `/` — inicio
- `/enviar` — mail de prueba
- `/dashboard` — tabla, filtros y detalle

## Estructura

```
app/
  api/
    mail/route.ts
    dashboard/route.ts
    dashboard/[id]/route.ts
  login/page.tsx
  enviar/page.tsx
  dashboard/page.tsx
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
- [ ] Sumar webhook + tabla `mail_log_eventos` cuando se necesite tracking de entrega/apertura
- [ ] Rate limiting en `/api/mail`
