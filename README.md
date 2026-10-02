# Mail Service - Municipalidad de Luján de Cuyo

Servicio de envío de mails para los sistemas municipales. Cada sistema se autentica con su
propia clave, los envíos quedan registrados con sus eventos de SES (entrega, rebote, queja,
apertura) y hay bajas por sistema y una lista de supresión. Los envíos y los eventos pueden
procesarse en forma asíncrona con colas SQS y un worker.

## Setup (desarrollo)

```bash
pnpm install
cp .env.example .env        # completar: SQL Server, ADMIN_TOKEN, UNSUBSCRIBE_HMAC_SECRET, proveedor
pnpm prisma generate
pnpm prisma:deploy          # aplica prisma/migrations
pnpm dev
```

- `pnpm test`: pruebas (vitest). `pnpm typecheck`: TypeScript.
- `pnpm worker:dev`: compila y corre el worker con el `.env` (solo si hay colas configuradas).
- La configuración se valida al arrancar (`lib/config.ts`). En producción la app no arranca si
  faltan secretos, si son cortos o si se repiten.

### Migraciones

El esquema se maneja con `prisma migrate` (antes era `db push`). `0_init` es el esquema que
ya existía; las siguientes agregan sistemas y claves, idempotencia, deduplicación de eventos,
cola de envíos, historial de supresión, plantillas y Postmaster.

**Base existente (una sola vez por ambiente):** marcar la inicial como aplicada y después
aplicar el resto:

```bash
pnpm prisma migrate resolve --applied 0_init
pnpm prisma:deploy
```

Antes conviene correr `pnpm prisma db pull` contra la base real y revisar que no haya
diferencias con `prisma/schema.prisma`.

**Cambios nuevos:** `pnpm prisma:migrate` (`migrate dev`) necesita `SHADOW_DATABASE_URL`, una
base vacía auxiliar (p. ej. `MAIL_QUEUE_SHADOW`). En producción solo se usa `prisma:deploy`.

> **Índices filtrados.** `UX_mail_log_idempotencia` y `UX_eventos_origen` se crean con SQL a
> mano porque Prisma no los modela. Si `migrate dev` genera una migración que los borra
> (`DROP INDEX UX_...`), quitar esas líneas antes de aplicarla: sin ellos se pierden la
> idempotencia y la deduplicación de eventos.

## Proveedor de envío

`MAIL_PROVIDER` elige el adaptador (`lib/mail/providers`). Default: `ses`.

| Valor | Qué usa |
| --- | --- |
| `ses` | SES por SMTP (credenciales SMTP de SES). Configuration set y etiquetas van como headers `X-SES-*`. |
| `ses-api` | SES por API v2 (`SendEmail` Raw) con las credenciales IAM. Recomendado con el worker: distingue errores reintentables. |
| `brevo` | API de Brevo (`BREVO_API_KEY`). |
| `smtp` | Otro relay SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). |

Para SES: verificar el dominio o el remitente (`MAIL_FROM_EMAIL`) en la misma región que
`AWS_REGION`. Por SMTP, `SMTP_USER` es el SMTP Username (empieza con `AKIA`) y `SMTP_PASS`
la contraseña SMTP, no el Secret Access Key de IAM. Mientras la cuenta esté en sandbox,
solo se entrega a direcciones verificadas.

`SES_MAX_SEND_RATE` limita los envíos por segundo de cada proceso (token bucket). Dejarlo un
poco por debajo del límite de la cuenta.

## Sistemas y claves de API

Cada sistema que envía se da de alta en `/sistemas` (o con `/api/admin/sistemas`):

- **origen**: identificador fijo (`turnos`, `expediente`...). Es el que se ve en el dashboard y
  al que se asocian las bajas.
- **clasificación**:
  - `transactional`: avisos de trámites; **sin** link de baja ni `List-Unsubscribe`.
  - `subscription`: avisos opcionales; con pie de baja y `List-Unsubscribe` one-click.
- **CORS**: orígenes del navegador permitidos, solo si llama directo desde un frontend.
- **HTML libre**: los sistemas nuevos lo tienen apagado. Sin eso, `/api/mail` exige `tipo` + `data`.

**Claves:** "Generar clave" muestra la clave (`mls_<prefijo>_<secreto>`) una sola vez; en la
base solo queda el SHA-256. Para **rotar**: generar una nueva, cambiarla en el sistema y
revocar la anterior. Una clave revocada o de un sistema inactivo deja de funcionar al instante.

El sistema `panel` lo crea la migración y lo usa la pantalla `/enviar`.

Orígenes sin sistema registrado (solo con el token viejo): son transaccionales si están en
`MAIL_ORIGENES_CRITICOS` (default `turnos,expediente`) y de suscripción si no.

## API

### `POST /api/mail`

Header `x-api-key: <clave del sistema>`. El origen sale de la clave.

```bash
curl -X POST https://mail.ejemplo.gob.ar/api/mail \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MAIL_SERVICE_API_KEY" \
  -d '{"email":"vecino@ejemplo.com","nombre":"Nombre","tipo":"turno_confirmacion",
       "data":{"area":"Registro Civil","fecha":"25/09/2026","hora":"10:00","lugar":"San Martín 50"},
       "idempotency_key":"turno-12345-confirmacion"}'
```

`GET /api/plantillas` (con la misma clave) lista tipos, campos y un ejemplo de `data`.
Tipos: `turno_confirmacion`, `turno_recordatorio` (solo `turnos`), `expediente_actualizacion`,
`documentacion_pendiente`, `novedad` (suscripción).

| Campo | |
| --- | --- |
| `email` | obligatorio |
| `tipo` + `data` | plantilla (recomendado) |
| `asunto` + `cuerpo` | HTML libre, solo si el sistema lo permite. No se mezclan con `tipo` |
| `nombre` | opcional; lo usa el saludo de la plantilla |
| `idempotency_key` | recomendado: único por mail lógico, `^[A-Za-z0-9._:-]+$`, hasta 200 |
| `origen` | opcional; si se manda distinto al de la clave, 403 |
| `adjuntos` | hasta 5, 4 MB c/u y 10 MB en total: PDF, DOC, DOCX, PNG, JPG, GIF, WEBP |

| Respuesta | Significado |
| --- | --- |
| **200** | Enviado (`MAIL_SEND_MODE=sync`): `{ ok, id, messageId }` |
| **202** | En cola (`MAIL_SEND_MODE=queue`): `{ ok, id, estado: "en_cola" }` |
| 200/202 con `duplicado: true` | Misma `idempotency_key` y mismo contenido: se devuelve el envío original, no se reenvía |
| **401** | Sin clave o clave inválida/revocada |
| **403** | `origen` distinto al de la clave, HTML libre no permitido, o plantilla de otro sistema |
| **409** | Misma `idempotency_key` con otro contenido (error de integración) |
| **422** | Destinatario suprimido (definitivo: no reintentar) |
| **502** | El proveedor rechazó o falló (modo sync) |

Reintentos: ante un timeout o un 5xx, reintentar **con la misma** `idempotency_key`.

### `GET /api/mail/:id`

Con la misma clave: `{ id, estado, tipo, plantillaVersion, messageId, errorDetalle, intentos, eventos }`.
Solo muestra envíos del propio sistema (los de otros dan 404).

Cada envío lleva `Feedback-ID: <tipo>:<origen>:<clasificacion>:mlc` (el HTML libre usa `html`
en el primer campo) para que Gmail separe la tasa de spam por sistema en Postmaster Tools.

Estados: `en_cola` → `enviando` → `enviado` → `entregado` → `abierto`; finales `rebotado`,
`queja`, `rechazado`, `suprimido`, `error`; y `revisar` (quedó más de 10 minutos en
`enviando`: no se sabe si SES lo mandó).

### Transición desde el token compartido

Mientras `LEGACY_TOKEN_ENABLED=true`, se sigue aceptando `x-internal-token` /
`Authorization: Bearer` con `INTERNAL_API_TOKEN` y el `origen` del body (se registra una
advertencia). Si ese origen no tiene sistema registrado, la `idempotency_key` se ignora.

### Administración (con `ADMIN_TOKEN`)

- `GET/POST /api/admin/sistemas`, `PATCH /api/admin/sistemas/:id`
- `POST /api/admin/sistemas/:id/keys` (genera), `DELETE /api/admin/sistemas/:id/keys?keyId=` (revoca)
- `GET /api/dashboard`, `/api/dashboard/stats`, `/api/dashboard/:id`, `/api/dashboard/supresion`
- `POST /api/dashboard/:id/requeue`: reencola un envío en `error` o `revisar` (este último con `{ "confirmar": true }`)
- `GET /api/dashboard/worker`: latido del worker y cantidad en cola/revisar

`DASHBOARD_LEGACY_TOKEN=true` permite usar `INTERNAL_API_TOKEN` en el dashboard solo durante
la transición.

## Supresión, rebotes y bajas

Tabla `mail_supresion`. Antes de enviar (y otra vez en el worker) se consulta por email:

- `origen = '*'`: bloquea **todos** los sistemas.
- `origen` exacto: bloquea solo ese sistema.

| Evento | Qué hace |
|---|---|
| Rebote permanente (SES Bounce Permanent) | Supresión global (`*`), motivo `rebote` |
| Queja de spam (SES Complaint) | Supresión global (`*`), motivo `queja` |
| Rebote transitorio | Solo se registra el evento |
| Baja del destinatario (solo sistemas de suscripción) | Supresión `email + origen`, motivo `baja` |

Un `Complaint` llega solo cuando el proveedor del destinatario le informa la queja a SES
(Outlook y Yahoo suelen hacerlo; Gmail casi nunca). Un mail que el proveedor manda solo a la
carpeta de spam no genera ningún evento: no se puede saber por destinatario. La reputación
hacia Gmail se sigue en Google Postmaster Tools, que da métricas agregadas por dominio.

**Reactivaciones** (`/supresion`, con `ADMIN_TOKEN`): siempre piden el nombre del responsable.
Una baja se reactiva a pedido del vecino. Un rebote o una queja piden además confirmación y
una nota que explique qué se verificó, y se quitan también de la lista de supresión de la
cuenta de SES si está activa. Cada bloqueo y cada reactivación quedan en
`mail_supresion_historial`.

- Página pública de baja: `GET /baja/:id?t=…`; API: `GET`/`POST /api/t/unsub/:id?t=…`.
- El token `t` es un HMAC con `UNSUBSCRIBE_HMAC_SECRET`. Durante el cambio de secreto,
  `UNSUBSCRIBE_HMAC_SECRET_PREVIOUS` mantiene válidos los links ya enviados.

## Eventos de SES

1. Configuration set con los eventos Send, Delivery, Bounce, Complaint, Reject,
   Rendering Failure, Delivery Delay y Open, publicados a un tópico SNS.
2. `SES_CONFIGURATION_SET` y `SES_SNS_TOPIC_ARN` en el `.env`.
3. Entrega de los eventos:
   - **Cola (recomendado):** SNS → SQS `mail-events` → worker. Ver [docs/aws-setup.md](docs/aws-setup.md).
   - **Webhook:** SNS → HTTPS `POST /api/webhooks/ses`. Solo acepta mensajes con firma SNS
     válida y del tópico configurado. Con `SES_WEBHOOK_ENABLED=false` responde 410.

Cada evento se registra una sola vez aunque llegue por los dos caminos (`MessageId` de SNS
en `mail_log_eventos.origen_evento_id`), y la supresión se aplica en la misma transacción.

**Apertura:** con `APP_BASE_URL` público se inserta un píxel (`/api/t/open/:id`). Es
aproximado: algunos clientes bloquean o precargan imágenes.

### Eventos internos

Además de los de SES, el servicio registra en `mail_log_eventos` cada paso propio. No cambian
el estado y, si fallan al guardarse, solo se loguean. En el dashboard aparecen en gris.

| Evento | Cuándo |
|---|---|
| `creado` | Se registró el envío (el detalle indica cola o envío directo) |
| `encolado` | Se publicó en `mail-send` |
| `enviando` | Un proceso tomó el envío (con el número de intento) |
| `aceptado` | El proveedor lo aceptó (con el `messageId`) |
| `reintento` / `fallo` | Error reintentable (vuelve a la cola) o definitivo |
| `suprimido` | No se envió: destinatario en `mail_supresion` |
| `agotado` | Agotó los reintentos (reconciliador o `mail-send-dlq`) |
| `reencolado_auto` | El reconciliador lo volvió a publicar |
| `revisar` | Quedó más de 10 min en `enviando` |
| `reencolado` | Un admin lo reencoló desde el dashboard |

## Colas y worker

Con `MAIL_SEND_MODE=queue`, `/api/mail` guarda el envío (adjuntos incluidos) como `en_cola`,
lo publica en `mail-send` y responde 202. El worker (`worker/index.ts`):

- envía con un bloqueo condicional (`en_cola` → `enviando`): un mensaje duplicado no se envía dos veces;
- reintenta los errores reintentables hasta 5 veces; los definitivos quedan en `error`;
- procesa `mail-events`;
- cada 60 s: reencola lo que lleva más de 15 min en cola, marca `error` lo que agotó intentos,
  pasa a `revisar` lo trabado en `enviando` y borra adjuntos de más de 7 días;
- cada 5 min vacía `mail-send-dlq` marcando esos envíos como `error`;
- actualiza `mail_worker_heartbeat` cada 30 s (el dashboard avisa si deja de latir);
- cada 6 h sincroniza Google Postmaster Tools (si hay cuenta conectada). Sin worker,
  usar **Sincronizar ahora** en `/sistemas`.

Con `MAIL_SEND_MODE=sync` (default) se envía en el momento con la misma lógica, sin reintentos.

## Despliegue con Docker

```bash
cp .env.example .env.web      # credenciales IAM mail-api
cp .env.example .env.worker   # credenciales IAM mail-worker
chmod 600 .env.web .env.worker
docker compose build
docker compose up -d
```

- Una sola imagen para `web` y `worker`. `web` aplica `prisma migrate deploy` al arrancar y
  tiene healthcheck en `GET /api/health`.
- El worker espera hasta 30 s los envíos en curso al detenerse (`stop_grace_period: 40s`).

## Puesta en marcha del cambio

1. Aplicar las migraciones (ver arriba) y cargar `ADMIN_TOKEN`, `UNSUBSCRIBE_HMAC_SECRET` y
   `UNSUBSCRIBE_HMAC_SECRET_PREVIOUS` (el valor con que se firmaba hasta ahora:
   `TRACKING_SECRET` si estaba, si no `INTERNAL_API_TOKEN`).
2. Crear la infraestructura de AWS ([docs/aws-setup.md](docs/aws-setup.md)).
   Para Gmail: [docs/google-postmaster.md](docs/google-postmaster.md) y conectar
   la cuenta en `/sistemas` (cargar `GOOGLE_*` en `.env.web` y `.env.worker`).
3. Dar de alta cada sistema en `/sistemas`, entregarle su clave y pedirle que mande
   `idempotency_key`, acepte 202, trate el 422 como definitivo y el 409 como error.
4. Con todos migrados: `MAIL_SEND_MODE=queue`, `LEGACY_TOKEN_ENABLED=false`, quitar
   `INTERNAL_API_TOKEN` y, cuando los eventos lleguen por la cola, `SES_WEBHOOK_ENABLED=false`.
5. En unos 6 meses, quitar `UNSUBSCRIBE_HMAC_SECRET_PREVIOUS`.

## UI interna

Ingresar en `/login` con `ADMIN_TOKEN`:

- `/enviar`: mail de prueba (origen `panel`)
- `/dashboard`: estadísticas, registro, detalle y reencolado
- `/supresion`: bloqueos y reactivación
- `/sistemas`: sistemas y claves de API

## Estructura

```
app/api/        mail, mail/[id], admin/sistemas, dashboard, t (píxel y baja), webhooks/ses, health
lib/config.ts   configuración validada
lib/auth/       claves de API y resolución del llamador
lib/mail/       proveedores, send-job, idempotencia, supresión, eventos de SES
lib/queue/      cliente SQS
worker/         proceso del worker (envíos, eventos, reconciliador)
prisma/         esquema y migraciones
infra/sqs.yml   plantilla de CloudFormation
tests/          vitest
```
