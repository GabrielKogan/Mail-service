# Google Postmaster Tools

El dashboard muestra la tasa de spam, la reputación y SPF/DKIM/DMARC de Gmail.
Son datos agregados, con unas 48 h de demora, sin detalle por destinatario. Los
días de poco volumen no aparecen. La API v1 (`trafficStats`) no expone el
Feedback Loop por `Feedback-ID`: eso se mira en la web de Postmaster.

Los scopes de lectura (`postmaster.domain` y `postmaster.traffic.readonly`) no
suelen exigir verificación de la app. Si Google la pide al publicar, completar
el formulario de verificación. El scope viejo `postmaster.readonly` ya no
alcanza: Google responde «insufficient authentication scopes».

## 1. Verificar el dominio en Postmaster

1. Entrar a [postmaster.google.com](https://postmaster.google.com/) con una
   cuenta de Google del municipio.
2. Agregar `lujandecuyo.gob.ar` y publicar el registro TXT que indica Google.
3. Esperar a que figure como verificado. Hace falta DKIM del dominio (ver
   [aws-setup.md](aws-setup.md), sección 5).

## 2. Cliente OAuth en Google Cloud

1. Crear un proyecto y habilitar **Gmail Postmaster Tools API**.
2. Pantalla de consentimiento:
   - Si hay Google Workspace: tipo **Interna**.
   - Si no: tipo **Externa**. En modo **Prueba** el refresh token vence a los
     7 días: hay que publicar la app en **Producción**.
3. Credenciales → **ID de cliente OAuth** → tipo **Aplicación web**.
4. URI de redirección: `${APP_BASE_URL}/api/admin/google/callback`
   (`APP_BASE_URL` tiene que ser `https`, salvo `localhost`).
5. Scopes (hay que cargarlos en la pantalla de consentimiento):
   `https://www.googleapis.com/auth/postmaster.domain`,
   `https://www.googleapis.com/auth/postmaster.traffic.readonly`,
   `openid`, `email`.

## 3. Variables

En `.env.web` y `.env.worker`:

```
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_TOKEN_KEY=   # openssl rand -hex 16  (32 caracteres)
ALERTAS_EMAIL=sistemas@lujandecuyo.gob.ar
APP_BASE_URL=https://mail.ejemplo.gob.ar
```

En producción, `GOOGLE_TOKEN_KEY` es obligatorio si hay `GOOGLE_CLIENT_ID`,
tiene que tener 32+ caracteres y ser distinto de los demás secretos.

## 4. Conectar

En `/sistemas` → **Conectar con Google**, autorizar con la misma cuenta que
verificó el dominio. El refresh token se guarda cifrado (AES-256-GCM).

- Al conectar la cuenta se sincroniza en el momento (últimos 14 días).
- El proceso web la vuelve a correr solo: una vez al arrancar y después cada
  15 min revisa si la última pasada exitosa ya cumplió 6 h. No hace falta el
  botón ni tener el worker levantado.
- El worker hace la misma revisión. Si el web ya sincronizó, se la salta.
- **Sincronizar ahora** fuerza una pasada sin esperar esas 6 h.
- Si Google responde `invalid_grant`, la conexión se marca vencida y se manda
  una sola alerta a `ALERTAS_EMAIL`.
