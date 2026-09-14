# Mail Service - Municipalidad de Luján de Cuyo

Servicio de envío de mails (vía API de Brevo) con registro de envíos para
dashboard interno. Versión inicial sin webhook: solo registra `enviado` /
`error` en el momento del envío.

## Setup

```bash
pnpm install
cp .env.example .env
# completar .env con los datos reales (SQL Server, API key de Brevo, token interno)
pnpm prisma generate
pnpm prisma migrate dev --name init   # o `prisma db pull` si la tabla ya existe en SQL Server
pnpm dev
```

## Endpoints

- `POST /api/mail` — envía un mail y lo registra.
  - Header requerido: `x-internal-token: <INTERNAL_API_TOKEN>`
  - Body JSON: `{ "email": "...", "nombre": "...", "asunto": "...", "cuerpo": "...", "origen": "..." }`
- `GET /api/dashboard` — lista registros paginados.
  - Query params opcionales: `estado`, `desde`, `hasta`, `page`

## Estructura

```
app/
  api/
    mail/route.ts        → endpoint de envío
    dashboard/route.ts    → endpoint de lectura para el dashboard
  dashboard/page.tsx      → UI del dashboard (por completar)
lib/
  brevo.ts                → cliente de la API de Brevo
  prisma.ts                → cliente de Prisma (singleton)
  validation.ts             → schemas de Zod
  auth.ts                    → validación del token interno
prisma/
  schema.prisma               → modelo MailLog
```

## Pendiente (siguientes pasos)

- [ ] Completar la UI de `/dashboard` (tabla + filtros)
- [ ] Autenticación de usuarios para ver el dashboard (no solo el token interno de `/api/mail`)
- [ ] Sumar webhook + tabla `mail_log_eventos` cuando se necesite tracking de entrega/apertura
- [ ] Rate limiting en `/api/mail`
