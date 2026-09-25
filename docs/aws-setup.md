# Infraestructura de AWS: colas SQS, eventos de SES e IAM

Todo va en `eu-central-1`, la misma región que SES y el tópico SNS del configuration set.
La plantilla [infra/sqs.yml](../infra/sqs.yml) crea las colas, la suscripción, los usuarios
IAM y las alarmas. Abajo están los pasos, lo que la plantilla no cubre y cómo verificar.

## 1. Qué se crea

| Recurso | Configuración |
| --- | --- |
| `mail-send` | visibilidad 120 s, espera de lectura 20 s, pasa a `mail-send-dlq` tras 5 intentos |
| `mail-events` | visibilidad 60 s, espera de lectura 20 s, pasa a `mail-events-dlq` tras 5 intentos |
| `mail-send-dlq`, `mail-events-dlq` | retienen los mensajes 14 días |
| Suscripción SNS → `mail-events` | protocolo `sqs`, **raw delivery desactivado** (el worker necesita el sobre SNS con `MessageId`) |
| Política de `mail-events` | `sqs:SendMessage` solo desde el tópico de SES (`aws:SourceArn`) |
| Usuario `mail-api` | `sqs:SendMessage` sobre `mail-send`; `ses:GetAccount`, `ses:GetSuppressedDestination`, `ses:DeleteSuppressedDestination`, `ses:GetEmailIdentity` y `ses:GetConfigurationSet` (reactivaciones y estado de SES) |
| Usuario `mail-worker` | leer/borrar en las cuatro colas, `SendMessage` en `mail-send`, `ses:SendEmail`/`ses:SendRawEmail` solo desde `MAIL_FROM_EMAIL` |
| Alarmas | cualquier cola de fallidos con mensajes; mensaje más viejo de `mail-send` > 10 min |

Todas las colas usan cifrado SSE-SQS (administrado por SQS). No usar una clave KMS propia:
habría que darle permisos a SNS en la política de la clave.

## 2. Desplegar la plantilla

```bash
aws cloudformation deploy \
  --region eu-central-1 \
  --stack-name mail-service-queues \
  --template-file infra/sqs.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      SesSnsTopicArn=arn:aws:sns:eu-central-1:<cuenta>:<topico-ses> \
      SesConfigurationSetName=<configuration-set> \
      MailFromEmail=registro@lujandecuyo.gob.ar \
      AlarmEmail=sistemas@lujandecuyo.gob.ar

aws cloudformation describe-stacks --region eu-central-1 \
  --stack-name mail-service-queues --query "Stacks[0].Outputs"
```

Las salidas dan las URLs para `SQS_SEND_QUEUE_URL`, `SQS_SEND_DLQ_URL` y `SQS_EVENTS_QUEUE_URL`.
Si se configuró `AlarmEmail`, confirmar la suscripción desde el mail que manda AWS.

## 3. Pasos manuales

### Tipos de evento del configuration set

Sumar `REJECT`, `RENDERING_FAILURE` y `DELIVERY_DELAY` a los que ya se publican en el tópico
(`SEND`, `DELIVERY`, `BOUNCE`, `COMPLAINT`, `OPEN`, ...):

```bash
aws sesv2 get-configuration-set-event-destinations --region eu-central-1 \
  --configuration-set-name <configuration-set>

aws sesv2 update-configuration-set-event-destination --region eu-central-1 \
  --configuration-set-name <configuration-set> \
  --event-destination-name <destino-sns> \
  --event-destination '{
    "Enabled": true,
    "MatchingEventTypes": ["SEND","DELIVERY","BOUNCE","COMPLAINT","REJECT","RENDERING_FAILURE","DELIVERY_DELAY","OPEN"],
    "SnsDestination": {"TopicArn": "arn:aws:sns:eu-central-1:<cuenta>:<topico-ses>"}
  }'
```

Mantener en `MatchingEventTypes` todos los tipos que ya estaban.

### Claves de acceso

La plantilla no genera claves para que no queden en las salidas del stack:

```bash
aws iam create-access-key --user-name mail-api
aws iam create-access-key --user-name mail-worker
```

- Guardarlas en archivos de variables separados (`.env.web` y `.env.worker`) con permisos `600`
  y dueño el usuario que corre Docker.
- Rotarlas cada 90 días: crear la nueva, cambiar el archivo, reiniciar el contenedor y borrar la anterior
  con `aws iam delete-access-key`.
- El contenedor `web` usa `mail-api`; el `worker`, `mail-worker`. Si `MAIL_PROVIDER=ses` (SMTP), el
  worker sigue usando las credenciales SMTP de SES para enviar.
- `web` necesita las credenciales de `mail-api` aunque se envíe por SMTP: con ellas quita
  direcciones de la lista de supresión de SES al reactivar y muestra el estado de SES en `/sistemas`.

### Transición del webhook

Mientras el webhook HTTPS siga suscripto, SES entrega cada evento dos veces (por HTTPS y por la cola).
Es seguro: los dos llevan el mismo `MessageId` de SNS y `mail_log_eventos.origen_evento_id` los
deduplica. Cuando el worker procese eventos sin errores durante unos días:

```bash
aws sns list-subscriptions-by-topic --region eu-central-1 --topic-arn <topico-ses>
aws sns unsubscribe --region eu-central-1 --subscription-arn <arn-de-la-suscripcion-https>
```

y poner `SES_WEBHOOK_ENABLED=false` para que `/api/webhooks/ses` responda 410.

## 4. Verificar

```bash
# Colas y atributos
aws sqs get-queue-attributes --region eu-central-1 --queue-url <SQS_EVENTS_QUEUE_URL> \
  --attribute-names Policy RedrivePolicy SqsManagedSseEnabled

# Llega un evento real: mandar un mail de prueba al simulador de SES
#   success@simulator.amazonses.com  -> Delivery
#   bounce@simulator.amazonses.com   -> Bounce (suprime la dirección del simulador)
aws sqs get-queue-attributes --region eu-central-1 --queue-url <SQS_EVENTS_QUEUE_URL> \
  --attribute-names ApproximateNumberOfMessages
```

Con el worker corriendo, el contador vuelve a 0 y el evento aparece en el detalle del mail en el dashboard.

## 5. Autenticación del dominio (DKIM, SPF, DMARC y TLS)

Gmail y Yahoo exigen a los remitentes masivos SPF, DKIM y DMARC alineados con el dominio del
`From`. El `From` sigue siendo `registro@lujandecuyo.gob.ar`; lo que se agrega es la
autenticación del dominio `lujandecuyo.gob.ar` en SES. El estado se ve en `/sistemas`
(tarjeta "Estado de SES", en rojo lo que falta).

### DKIM (Easy DKIM, 2048 bits)

Verificar el dominio como identidad (no solo la dirección): una identidad solo de dirección
firma con el dominio de Amazon y no alinea DKIM.

```bash
aws sesv2 create-email-identity --region eu-central-1 \
  --email-identity lujandecuyo.gob.ar \
  --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT
# Si el dominio ya existe como identidad:
aws sesv2 put-email-identity-dkim-signing-attributes --region eu-central-1 \
  --email-identity lujandecuyo.gob.ar --signing-attributes-origin AWS_SES \
  --signing-attributes NextSigningKeyLength=RSA_2048_BIT

aws sesv2 get-email-identity --region eu-central-1 --email-identity lujandecuyo.gob.ar \
  --query "DkimAttributes.Tokens"
```

Por cada uno de los tres tokens, un CNAME en el DNS:
`<token>._domainkey.lujandecuyo.gob.ar  CNAME  <token>.dkim.amazonses.com`.

### MAIL FROM personalizado (SPF alineado)

Sin MAIL FROM propio, el remitente del sobre es `amazonses.com` y SPF pasa pero no alinea.

```bash
aws sesv2 put-email-identity-mail-from-attributes --region eu-central-1 \
  --email-identity lujandecuyo.gob.ar \
  --mail-from-domain bounce.lujandecuyo.gob.ar \
  --behavior-on-mx-failure USE_DEFAULT_VALUE
```

Registros DNS del subdominio:

| Nombre | Tipo | Valor |
| --- | --- | --- |
| `bounce.lujandecuyo.gob.ar` | MX (prioridad 10) | `feedback-smtp.eu-central-1.amazonses.com` |
| `bounce.lujandecuyo.gob.ar` | TXT | `v=spf1 include:amazonses.com ~all` |

`USE_DEFAULT_VALUE` hace que, si el MX falla, SES siga enviando con su dominio en vez de rechazar.

### SPF del dominio raíz

Revisar el SPF actual de `lujandecuyo.gob.ar` antes de tocarlo: lo usan otros servidores del
municipio. Con MAIL FROM propio no hace falta agregar `amazonses.com` al raíz. Un dominio
solo puede tener **un** registro `v=spf1`, con 10 consultas DNS como máximo.

### DMARC

Empezar en monitoreo y endurecer cuando los reportes muestren que todo lo legítimo pasa:

1. `_dmarc.lujandecuyo.gob.ar TXT "v=DMARC1; p=none; rua=mailto:dmarc@lujandecuyo.gob.ar; adkim=r; aspf=r"`
2. Tras 2–4 semanas sin fuentes legítimas fallando: `p=quarantine; pct=25`, luego `pct=100`.
3. Finalmente `p=reject`.

La alineación relajada (`adkim=r; aspf=r`) acepta `bounce.lujandecuyo.gob.ar` como alineado
con `lujandecuyo.gob.ar`. Los reportes `rua` se pueden leer con un servicio gratuito de
análisis DMARC o con Google Postmaster Tools.

### TLS obligatorio

```bash
aws sesv2 put-configuration-set-delivery-options --region eu-central-1 \
  --configuration-set-name <configuration-set> --tls-policy REQUIRE
```

Con `REQUIRE`, SES no entrega a servidores que no acepten TLS (el mensaje rebota).

### Checklist de Gmail y Yahoo (remitentes masivos)

- SPF y DKIM válidos, con DMARC publicado (al menos `p=none`) y alineado con el `From`.
- Baja en un clic (`List-Unsubscribe` + `List-Unsubscribe-Post`) en los correos de
  suscripción: ya lo agrega el servicio.
- Tasa de spam por debajo de 0,3 % en Google Postmaster Tools (idealmente menor a 0,1 %).
- DNS directo e inverso válidos para las IP de envío (lo cubre SES).

### Verificar

```bash
aws sesv2 get-email-identity --region eu-central-1 --email-identity lujandecuyo.gob.ar
# DkimAttributes.Status = SUCCESS, MailFromAttributes.MailFromDomainStatus = SUCCESS

nslookup -type=TXT _dmarc.lujandecuyo.gob.ar
nslookup -type=TXT bounce.lujandecuyo.gob.ar
nslookup -type=MX bounce.lujandecuyo.gob.ar
nslookup -type=CNAME <token>._domainkey.lujandecuyo.gob.ar
```

En Gmail, "Mostrar original" de un correo recibido debe decir `SPF: PASS`, `DKIM: PASS` y
`DMARC: PASS`.

### Lista de supresión de la cuenta

SES tiene su propia lista de supresión, además de `mail_supresion`. La tarjeta de `/sistemas`
muestra si está activa (a nivel de cuenta o del configuration set). Cuando está activa, un
envío a una dirección de esa lista vuelve como rebote `OnAccountSuppressionList` y se bloquea
también en el Mail Service. Al reactivar un rebote o una queja desde `/supresion`, el servicio
la quita también de la lista de SES; si falla, lo avisa y queda registrado en el historial.

## 6. Cuando algo cae en una cola de fallidos

- **`mail-send-dlq`:** el worker la lee cada 5 minutos, marca esos registros como `error`
  ("agotó reintentos en SQS") y borra el mensaje. Desde el dashboard se pueden reencolar.
- **`mail-events-dlq`:** normalmente son eventos de mails que no están en la base (por ejemplo,
  enviados desde otra aplicación con el mismo configuration set). Revisarlos con
  `aws sqs receive-message` y borrarlos a mano; se retienen 14 días.
