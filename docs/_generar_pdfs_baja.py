"""Genera los PDF explicativos del protocolo de baja. Uso: python docs/_generar_pdfs_baja.py"""

from pathlib import Path

from fpdf import FPDF

OUT_DIR = Path(__file__).resolve().parent
FONT_REG = r"C:\Windows\Fonts\segoeui.ttf"
FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_ITAL = r"C:\Windows\Fonts\segoeuii.ttf"

TEAL = (18, 80, 79)
TEAL_MID = (34, 143, 141)
INK = (27, 44, 46)
MUTED = (91, 111, 112)
LINE = (213, 228, 227)
SOFT = (231, 245, 244)
WHITE = (255, 255, 255)
DANGER = (180, 35, 24)


class Doc(FPDF):
    def __init__(self, subtitle: str):
        super().__init__(format="A4", unit="mm")
        self.subtitle = subtitle
        self.set_auto_page_break(auto=True, margin=22)
        self.set_margins(18, 28, 18)
        self.add_font("ui", "", FONT_REG)
        self.add_font("ui", "B", FONT_BOLD)
        self.add_font("ui", "I", FONT_ITAL)

    def header(self):
        self.set_fill_color(*TEAL)
        self.rect(0, 0, 210, 18, "F")
        self.set_font("ui", "B", 9)
        self.set_text_color(*WHITE)
        self.set_xy(18, 4.5)
        self.cell(174, 4.5, "Municipalidad de Luján de Cuyo  ·  Mail Service")
        self.set_font("ui", "", 8)
        self.set_xy(18, 9.5)
        self.cell(174, 4.5, self.subtitle)
        self.set_text_color(*INK)
        self.set_xy(18, 28)

    def footer(self):
        self.set_y(-16)
        self.set_draw_color(*LINE)
        self.line(18, self.get_y(), 192, self.get_y())
        self.set_font("ui", "", 8)
        self.set_text_color(*MUTED)
        self.set_xy(18, -13)
        self.cell(120, 5, "Uso interno  ·  No incluye datos personales de vecinos")
        self.set_xy(150, -13)
        self.cell(42, 5, str(self.page_no()), align="R")
        self.set_text_color(*INK)

    def h1(self, text: str):
        self.set_x(18)
        self.set_font("ui", "B", 18)
        self.set_text_color(*TEAL)
        self.multi_cell(174, 8, text)
        self.ln(2)
        self.set_draw_color(*TEAL_MID)
        self.set_line_width(0.6)
        y = self.get_y()
        self.line(18, y, 80, y)
        self.set_line_width(0.2)
        self.ln(6)
        self.set_text_color(*INK)

    def lead(self, text: str):
        self.set_x(18)
        self.set_font("ui", "I", 11)
        self.set_text_color(*MUTED)
        self.multi_cell(174, 6, text)
        self.ln(5)
        self.set_text_color(*INK)

    def h2(self, text: str):
        self.ln(2)
        if self.get_y() > 250:
            self.add_page()
        self.set_fill_color(*SOFT)
        self.set_font("ui", "B", 12)
        self.set_text_color(*TEAL)
        self.set_x(18)
        self.cell(174, 8, f"  {text}", fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)
        self.set_text_color(*INK)

    def p(self, text: str):
        self.set_x(18)
        self.set_font("ui", "", 10.5)
        self.set_text_color(*INK)
        self.multi_cell(174, 5.6, text)
        self.ln(2.5)

    def bullet(self, text: str, indent: float = 4):
        x = 18 + indent
        w = 192 - x
        self.set_xy(x, self.get_y())
        self.set_font("ui", "B", 10.5)
        self.set_text_color(*TEAL_MID)
        self.cell(5, 5.6, "•")
        self.set_font("ui", "", 10.5)
        self.set_text_color(*INK)
        self.multi_cell(w - 5, 5.6, text)
        self.ln(0.8)

    def note(self, text: str):
        self.set_x(18)
        self.set_fill_color(*SOFT)
        self.set_font("ui", "", 10)
        self.set_text_color(*TEAL)
        self.multi_cell(174, 5.4, text, fill=True)
        self.ln(4)
        self.set_text_color(*INK)

    def code(self, text: str):
        self.set_x(18)
        self.set_fill_color(18, 59, 58)
        self.set_text_color(230, 244, 243)
        self.set_font("ui", "", 8.5)
        self.multi_cell(174, 4.8, text, fill=True)
        self.ln(3)
        self.set_text_color(*INK)

    def kv(self, key: str, value: str):
        self.set_x(18)
        self.set_font("ui", "B", 10.5)
        self.set_text_color(*TEAL)
        self.cell(48, 5.8, key)
        self.set_font("ui", "", 10.5)
        self.set_text_color(*INK)
        self.multi_cell(126, 5.8, value)


def build_programadores() -> Doc:
    pdf = Doc("Guía para programadores  ·  Envío, baja y supresión")
    pdf.add_page()
    pdf.h1("Contrato de envío, baja y supresión")
    pdf.lead(
        "Cómo deben integrarse los sistemas municipales que llaman a POST /api/mail "
        "y cómo un destinatario deja de recibir correos."
    )

    pdf.h2("1. Idea general")
    pdf.p(
        "Cada sistema está dado de alta en el Mail Service con su propia clave de API "
        "y una clasificación:"
    )
    pdf.bullet(
        "transaccional (turnos, expedientes, trámites): son avisos que la persona "
        "necesita. No llevan link de baja ni cabecera List-Unsubscribe."
    )
    pdf.bullet(
        "suscripción (novedades, recordatorios opcionales): llevan el pie de baja y "
        "List-Unsubscribe one-click. La baja corta solo ese sistema."
    )
    pdf.p(
        "Un rebote permanente o una queja de spam informada a Amazon SES bloquean todos "
        "los sistemas hacia esa dirección de correo."
    )

    pdf.h2("2. Autenticación")
    pdf.p(
        "Header x-api-key con la clave del sistema (formato mls_xxxxxxxx_...). La genera "
        "el administrador en la pantalla Sistemas y se muestra una sola vez. El origen "
        "sale de la credencial: no hace falta mandarlo y, si se manda distinto, la API "
        "responde 403."
    )
    pdf.p(
        "Guardá la clave como secreto del backend. No la uses desde el navegador. "
        "Para rotarla: se genera una nueva, se reemplaza en el sistema y se revoca la anterior."
    )

    pdf.h2("3. POST /api/mail")
    pdf.p(
        "Hay dos formas, nunca juntas: plantilla (tipo + data) o HTML libre (asunto + cuerpo). "
        "Los sistemas nuevos no tienen HTML libre: usá una plantilla. GET /api/plantillas "
        "lista los tipos, los campos y un ejemplo de data."
    )
    pdf.code(
        '{\n'
        '  "email": "vecino@ejemplo.com",\n'
        '  "nombre": "Nombre",\n'
        '  "tipo": "turno_confirmacion",\n'
        '  "data": {\n'
        '    "area": "Registro Civil",\n'
        '    "fecha": "25/09/2026",\n'
        '    "hora": "10:00",\n'
        '    "lugar": "San Martín 50"\n'
        '  },\n'
        '  "idempotency_key": "turno-12345-confirmacion"\n'
        "}"
    )
    pdf.p("Tipos actuales: turno_confirmacion, turno_recordatorio (solo origen turnos), expediente_actualizacion, documentacion_pendiente, novedad (suscripción).")
    pdf.p(
        "Para migrar desde HTML libre: reemplazá asunto + cuerpo por tipo + data, "
        "probá en /enviar y pedí que apaguen permiteRawHtml de tu sistema."
    )
    pdf.p("HTML libre (solo si el sistema lo tiene habilitado):")
    pdf.code(
        '{\n'
        '  "email": "vecino@ejemplo.com",\n'
        '  "nombre": "Nombre",\n'
        '  "asunto": "Asunto",\n'
        '  "cuerpo": "<p>HTML</p>",\n'
        '  "idempotency_key": "turno-12345-confirmacion",\n'
        '  "adjuntos": [{ "filename": "turno.pdf", "contentType": "application/pdf",\n'
        '                 "contentBase64": "..." }]\n'
        "}"
    )
    pdf.bullet(
        "idempotency_key: única por mail lógico (letras, números y . _ : -, hasta 200). "
        "Si reintentás por un timeout con la misma clave y el mismo contenido, no se "
        "envía dos veces: se devuelve el envío original con duplicado: true."
    )
    pdf.p("Respuestas:")
    pdf.kv("200", "Enviado en el momento: { ok, id, messageId }.")
    pdf.kv("202", "Aceptado y en cola: { ok, id, estado: \"en_cola\" }. Consultá el estado después.")
    pdf.kv("401 / 403", "Clave inválida o revocada / origen distinto al de la clave.")
    pdf.kv("409", "Misma idempotency_key con otro contenido. Es un error de integración.")
    pdf.kv("422", "Destinatario suprimido. Definitivo: no reintentar.")
    pdf.kv("5xx", "Falla temporal. Reintentar con la misma idempotency_key.")
    pdf.ln(2)
    pdf.code(
        '{\n'
        '  "error": "Destinatario en lista de supresión",\n'
        '  "motivo": "baja",\n'
        '  "origen": "recordatorio",\n'
        '  "detalle": "Destinatario suprimido para el origen \\"recordatorio\\" (motivo: baja)."\n'
        "}"
    )
    pdf.bullet(
        "motivo puede ser baja, rebote o queja. Si origen es \"*\", el bloqueo es para todos los sistemas."
    )

    pdf.h2("4. GET /api/mail/:id")
    pdf.p(
        "Con la misma clave, devuelve { id, estado, tipo, plantillaVersion, messageId, errorDetalle, intentos, eventos }. "
        "Solo muestra envíos del propio sistema (los de otros dan 404)."
    )
    pdf.p(
        "Estados: en_cola, enviando, enviado, entregado, abierto, rebotado, queja, "
        "rechazado, suprimido, error y revisar (quedó a mitad del envío; lo revisa el administrador)."
    )

    pdf.h2("5. Feedback-ID")
    pdf.p(
        "Cada envío lleva la cabecera Feedback-ID: tipo:origen:clasificacion:mlc "
        "(por ejemplo turno_confirmacion:turnos:transactional:mlc). Gmail la usa para "
        "separar la tasa de spam por sistema en Postmaster Tools. No lleva ids de mail "
        "ni de expediente: si cada mensaje es único, no hay volumen para mostrar datos. "
        "El HTML libre usa html en el primer campo."
    )

    pdf.h2("6. Cómo se da de baja un vecino (solo suscripción)")
    pdf.bullet("El servicio agrega al pie el link /baja/{{id}}?t={{token}}.")
    pdf.bullet(
        "Agrega los headers List-Unsubscribe y List-Unsubscribe-Post "
        "(one-click de Gmail / Yahoo)."
    )
    pdf.bullet("El vecino confirma en la página pública, o Gmail hace el POST one-click.")
    pdf.bullet("Se guarda en mail_supresion: email en minúsculas, origen del mail, motivo = baja.")
    pdf.p(
        "Los próximos envíos de ese sistema a ese email dan 422. Los demás sistemas siguen enviando."
    )

    pdf.h2("7. Rebote y queja (automático)")
    pdf.p("Los eventos de Amazon SES llegan firmados por SNS. No son una baja del vecino:")
    pdf.bullet("Bounce Permanent → supresión origen='*', motivo rebote.")
    pdf.bullet("Complaint → supresión origen='*', motivo queja.")
    pdf.bullet("Bounce Transient (buzón lleno, timeout) → solo se registra; no bloquea.")
    pdf.p(
        "Un Complaint significa que el proveedor del destinatario le informó una queja a "
        "Amazon SES. No todos lo hacen: Gmail casi nunca informa quejas individuales, y un "
        "correo que el proveedor manda solo a la carpeta de spam no genera ningún evento. "
        "Por eso el Mail Service no puede saber cada vez que un mail terminó en spam."
    )
    pdf.p(
        "La reputación hacia Gmail se sigue con Google Postmaster Tools, que da métricas "
        "agregadas por dominio (tasa de spam, reputación, SPF, DKIM, DMARC), no por destinatario."
    )
    pdf.p(
        "Un rebote o una queja no se reactivan solos: el administrador tiene que revisarlos, "
        "dejar una nota y quedar registrado como responsable."
    )

    pdf.h2("8. Checklist de integración")
    pdf.bullet("Pedir el alta del sistema y su clasificación; guardar la clave como secreto.")
    pdf.bullet("Enviar tipo + data (GET /api/plantillas). HTML libre solo si el sistema lo tiene habilitado.")
    pdf.bullet("Mandar idempotency_key en todos los envíos y reutilizarla al reintentar.")
    pdf.bullet("Aceptar 202 y consultar el estado con GET /api/mail/:id si hace falta.")
    pdf.bullet("Tratar el 422 como definitivo y el 409 como error de integración.")
    pdf.bullet(
        "No armar el link de baja en el HTML: lo agrega este servicio en los sistemas de suscripción."
    )
    pdf.bullet(
        "No enviar a listas compradas ni a direcciones sin relación con un trámite o servicio municipal."
    )
    pdf.ln(3)
    pdf.note(
        "Referencia de código: app/api/mail/route.ts, lib/mail/send-job.ts, "
        "lib/mail/suppression.ts, lib/mail/ses-events.ts y app/api/t/unsub/[id]/route.ts."
    )
    return pdf


def build_cliente() -> Doc:
    pdf = Doc("Guía para el municipio  ·  Cómo dejar de recibir correos")
    pdf.add_page()
    pdf.h1("Cómo dejar de recibir correos municipales")
    pdf.lead(
        "Municipalidad de Luján de Cuyo. Este documento explica, en lenguaje claro, "
        "cómo un vecino puede dejar de recibir avisos y qué correos no se pueden cancelar."
    )

    pdf.h2("Para qué sirve este servicio")
    pdf.p(
        "Los sistemas municipales envían dos tipos de correo:"
    )
    pdf.bullet(
        "Avisos de trámites: turnos, expedientes, documentación pendiente. Se disparan "
        "porque la persona pidió un trámite o figura en un expediente."
    )
    pdf.bullet(
        "Avisos opcionales: novedades o recordatorios a los que la persona se anotó."
    )
    pdf.p("No son newsletters comerciales ni publicidad.")

    pdf.h2("Cómo darse de baja (avisos opcionales)")
    pdf.p("Los avisos opcionales incluyen al pie un enlace “darse de baja”. Pasos:")
    pdf.bullet("Abrir el correo de la Municipalidad de Luján de Cuyo.")
    pdf.bullet("Ir al final del mensaje y hacer clic en “darse de baja”.")
    pdf.bullet(
        "En la página que se abre, revisar que figure su email y el sistema del aviso."
    )
    pdf.bullet("Pulsar “Dejar de recibir avisos de este sistema”.")
    pdf.bullet(
        "Verá una confirmación: ya no recibirá avisos de ese sistema en esa dirección."
    )
    pdf.p(
        "En Gmail u Outlook a veces aparece “Cancelar suscripción” en el encabezado "
        "del mail. Eso hace lo mismo, sin pasar por la página."
    )

    pdf.h2("Qué cubre la baja (y qué no)")
    pdf.p("La baja es solo de ese tipo de aviso.")
    pdf.p(
        "Ejemplo: si una vecina se da de baja de las novedades, puede seguir recibiendo "
        "confirmaciones de turno o actualizaciones de un expediente."
    )

    pdf.h2("Correos que no se pueden cancelar por este medio")
    pdf.p(
        "Los avisos de turnos, expedientes y otros trámites no traen link de baja: "
        "son parte del trámite que la persona inició y tiene que poder recibirlos."
    )
    pdf.note(
        "Ante dudas, el vecino puede escribir a registro@lujandecuyo.gob.ar o "
        "consultar en la oficina que tramitó el asunto."
    )

    pdf.h2("Marcar el mail como spam")
    pdf.p(
        "Si su proveedor de correo informa una queja de spam a nuestro servicio de envío, "
        "la dirección puede quedar bloqueada para futuros envíos municipales. Si solo desea "
        "dejar de recibir un tipo de aviso opcional, recomendamos utilizar el enlace "
        "“darse de baja” incluido en ese correo."
    )
    pdf.p(
        "Además, los proveedores de correo tienen en cuenta las quejas: si se acumulan, "
        "pueden empezar a mandar a spam los correos municipales de todos los vecinos."
    )

    pdf.h2("Si el vecino se arrepiente")
    pdf.p(
        "Una baja de un aviso opcional se reactiva a pedido del vecino, desde la pantalla "
        "Supresión del Mail Service."
    )
    pdf.p(
        "Una dirección bloqueada por rebote o por queja de spam no se reactiva automáticamente: "
        "el personal interno primero verifica que la dirección sea correcta y que el titular "
        "lo haya pedido, y deja registrado quién lo hizo y por qué."
    )
    pdf.p(
        "Hasta que no se reactive, los sistemas que intenten enviar a esa dirección "
        "y a ese origen no van a despachar el correo."
    )

    pdf.h2("Resumen para mostrarle al vecino")
    pdf.bullet(
        "No recibir más avisos opcionales → usar el link “darse de baja” al pie del mail."
    )
    pdf.bullet(
        "Seguir recibiendo turnos y expedientes → no hace falta nada: la baja de un aviso opcional no los corta."
    )
    pdf.bullet(
        "Dejar de recibir avisos de un trámite → consultar a la oficina o a registro@lujandecuyo.gob.ar."
    )
    pdf.bullet(
        "No usar “marcar como spam” para cortar un aviso: si el proveedor informa la queja, puede bloquear todos los correos municipales."
    )
    pdf.bullet(
        "El mail no llega / vuelve rebotado → el sistema deja de reenviar solo; hay que corregir la dirección de correo."
    )

    pdf.h2("Qué hace el personal interno")
    pdf.p("En el Mail Service, con el token de administración:")
    pdf.bullet("Dashboard: historial de envíos, incluido el estado “suprimido” (no enviado).")
    pdf.bullet("Supresión: lista de direcciones bloqueadas, motivo y origen.")
    pdf.bullet("Reactivar una baja: si fue un error o el vecino lo pidió.")
    pdf.bullet(
        "Reactivar un rebote o una queja: solo después de verificar la dirección y el pedido "
        "del titular, con una nota y el nombre del responsable."
    )
    pdf.bullet("Sistemas: alta de cada sistema, su clasificación y sus claves de API.")
    return pdf


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    prog = build_programadores()
    prog_path = OUT_DIR / "Protocolo-baja-programadores.pdf"
    prog.output(str(prog_path))

    cli = build_cliente()
    cli_path = OUT_DIR / "Protocolo-baja-cliente.pdf"
    cli.output(str(cli_path))

    print(prog_path)
    print(cli_path)


if __name__ == "__main__":
    main()
