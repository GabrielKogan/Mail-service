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
    pdf = Doc("Guía para programadores  ·  Protocolo de baja y supresión")
    pdf.add_page()
    pdf.h1("Protocolo de baja y supresión")
    pdf.lead(
        "Cómo un destinatario deja de recibir correos del Mail Service y cómo "
        "deben integrarse los sistemas municipales que llaman a POST /api/mail."
    )

    pdf.h2("1. Idea general")
    pdf.p(
        "La baja no es global. Se da de baja de un origen: el sistema que envió "
        "el mail (recordatorio, novedades, etc.)."
    )
    pdf.p(
        "Los orígenes críticos (por defecto turnos y expediente) son notificaciones "
        "oficiales: el pie de baja aparece igual, pero confirmarla no corta esos avisos."
    )
    pdf.p(
        "Un rebote permanente o una queja de spam sí bloquean todos los orígenes "
        "hacia esa dirección de correo."
    )

    pdf.h2("2. Contrato para sistemas que envían")
    pdf.p("POST /api/mail, autenticado con el token interno:")
    pdf.code(
        '{\n'
        '  "email": "vecino@ejemplo.com",\n'
        '  "nombre": "Nombre",\n'
        '  "asunto": "Asunto",\n'
        '  "cuerpo": "<p>HTML</p>",\n'
        '  "origen": "nombre-del-sistema"\n'
        "}"
    )
    pdf.p("Reglas de integración:")
    pdf.bullet(
        "origen identifica a tu sistema. Usá siempre el mismo string "
        "(recordatorio, no Recordatorio un día y recordatorios al otro). "
        "La baja se guarda con ese valor exacto."
    )
    pdf.bullet(
        "Si el destinatario está suprimido, la API no envía a SES y responde HTTP 422."
    )
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
    pdf.bullet(
        "Ante 422: no reintentar el envío. Registrá el error. Un 422 no es un fallo de Amazon SES."
    )

    pdf.h2("3. Cómo se da de baja un vecino")
    pdf.p(
        "Al enviar, si hay APP_BASE_URL, el servicio agrega el pie en todos los mails:"
    )
    pdf.bullet("Agrega un pie de página con el link /baja/{{id}}?t={{token}}.")
    pdf.bullet(
        "Agrega los headers List-Unsubscribe y List-Unsubscribe-Post "
        "(one-click de Gmail / Yahoo)."
    )
    pdf.p("Flujo:")
    pdf.bullet("El vecino abre el link del mail, o Gmail hace POST one-click.")
    pdf.bullet("Página pública /baja/[id] (sin login del Mail Service).")
    pdf.bullet("Confirma: “Dejar de recibir avisos de este sistema”.")
    pdf.bullet("POST /api/t/unsub/{{id}}?t=… guarda en mail_supresion:")
    pdf.bullet("email en minúsculas", indent=10)
    pdf.bullet("origen del mail original", indent=10)
    pdf.bullet("motivo = baja, activo = true", indent=10)
    pdf.p(
        "Los próximos POST /api/mail con ese email + ese origen dan 422. "
        "Otros orígenes (incluido un crítico) siguen enviando."
    )

    pdf.h2("4. Orígenes críticos")
    pdf.p(
        "Variable de entorno MAIL_ORIGENES_CRITICOS. Si no está definida, "
        "el default es turnos,expediente."
    )
    pdf.p(
        "Todos los mails llevan pie de baja y List-Unsubscribe. En orígenes críticos, "
        "si alguien entra a /baja/... se explica que es notificación oficial y no se suprime."
    )

    pdf.h2("5. Rebote y queja (automático)")
    pdf.p("Eventos Amazon SES en POST /api/webhooks/ses. Esto no es una “baja” del vecino:")
    pdf.bullet("Bounce Permanent → supresión origen='*', motivo rebote.")
    pdf.bullet("Complaint (spam) → supresión origen='*', motivo queja.")
    pdf.bullet("Bounce Transient (buzón lleno, timeout) → solo se registra; no bloquea.")
    pdf.p(
        "Un mailbox inexistente o “marcar como spam” corta todo el envío a esa "
        "dirección, de cualquier sistema municipal."
    )

    pdf.h2("6. Tabla mail_supresion")
    pdf.kv("email", "Normalizado con trim() y minúsculas.")
    pdf.kv("origen", "\"*\" = todos los sistemas; si no, el origen de la API.")
    pdf.kv("motivo", "rebote | queja | baja")
    pdf.kv("activo", "false = reactivado desde la pantalla /supresion.")
    pdf.kv("unique", "(email, origen)")
    pdf.ln(2)
    pdf.p(
        "Al enviar se busca una fila activa con origen='*' o con el origen exacto del request."
    )

    pdf.h2("7. Endpoints")
    pdf.kv("POST /api/mail", "Token interno. Enviar. 422 si está suprimido.")
    pdf.kv("GET /api/t/unsub/:id?t=", "Pública (HMAC). Datos para la página de baja.")
    pdf.kv("POST /api/t/unsub/:id?t=", "Pública (HMAC). Confirmar baja / one-click.")
    pdf.kv("GET /baja/:id?t=", "Pública. UI de confirmación.")
    pdf.kv("GET /api/dashboard/supresion", "Token interno. Listar bloqueos.")
    pdf.kv("PATCH /api/dashboard/supresion", "Token interno. {{ id, activo }} para reactivar.")
    pdf.ln(2)
    pdf.p(
        "El token t es un HMAC de unsub:{{mailLogId}}. No es el INTERNAL_API_TOKEN. "
        "Se firma con TRACKING_SECRET o, si falta, con el token interno."
    )

    pdf.h2("8. Checklist de integración")
    pdf.bullet("Mandar un origen estable y documentado.")
    pdf.bullet("Manejar HTTP 422 y no reintentar.")
    pdf.bullet(
        "Si el sistema es notificación oficial, pedir que el origen esté en MAIL_ORIGENES_CRITICOS."
    )
    pdf.bullet(
        "El pie de baja lo agrega este servicio en todos los mails: "
        "no hace falta armar el link en el HTML del origen."
    )
    pdf.bullet(
        "No enviar a listas compradas ni a direcciones sin relación con un trámite o servicio municipal."
    )
    pdf.ln(3)
    pdf.note(
        "Referencia de código: lib/mail/suppression.ts, app/api/mail/route.ts, "
        "app/api/t/unsub/[id]/route.ts, app/baja/[id]/page.tsx y app/api/webhooks/ses/route.ts."
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
        "Los sistemas municipales envían correos transaccionales: turnos, expedientes, "
        "recordatorios de documentación y avisos similares."
    )
    pdf.p(
        "No son newsletters ni publicidad. Cada mail se dispara porque la persona pidió "
        "un trámite, sacó un turno o figura en un expediente."
    )

    pdf.h2("Cómo darse de baja (avisos opcionales)")
    pdf.p(
        "Algunos correos (por ejemplo recordatorios o avisos informativos) incluyen "
        "al pie un enlace “darse de baja”."
    )
    pdf.p("Pasos para el vecino:")
    pdf.bullet("Abrir el correo de la Municipalidad de Luján de Cuyo.")
    pdf.bullet("Ir al final del mensaje y hacer clic en “darse de baja”.")
    pdf.bullet(
        "En la página que se abre, revisar que figure su email y el sistema del aviso "
        "(por ejemplo “recordatorio”)."
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
        "Ejemplo: si una vecina se da de baja de recordatorios, puede seguir recibiendo "
        "confirmaciones de turno o actualizaciones de un expediente, porque son "
        "notificaciones oficiales del trámite."
    )
    pdf.p(
        "No existe un botón único “no me escriban nunca más desde el municipio” para "
        "todos los sistemas. Eso es a propósito: un turno o un expediente tiene que "
        "poder avisarse."
    )

    pdf.h2("Correos que no se pueden cancelar por este medio")
    pdf.p(
        "Los mails de turnos y expedientes (y otros que la Municipalidad marque como "
        "oficiales) también traen el link de baja."
    )
    pdf.p(
        "Si alguien lo usa en ese tipo de correo, la página explica que es una "
        "notificación oficial y no se cancela: el turno o el expediente se sigue avisando."
    )
    pdf.note(
        "Ante dudas, el vecino puede escribir a registro@lujandecuyo.gob.ar o "
        "consultar en la oficina que tramitó el asunto."
    )

    pdf.h2("Marcar el mail como spam")
    pdf.p(
        "Si el vecino marca el mail como spam, el sistema deja de escribirle desde "
        "todos los sistemas municipales a esa dirección. No es lo mismo que “darse "
        "de baja” de un solo aviso."
    )
    pdf.p(
        "Conviene usar el link de baja cuando solo quiere cortar recordatorios, "
        "y no el botón de spam."
    )

    pdf.h2("Si el vecino se arrepiente")
    pdf.p(
        "Personal interno puede reactivar una dirección desde la pantalla Supresión "
        "del Mail Service (con el token interno)."
    )
    pdf.p(
        "Hasta que no se reactive, los sistemas que intenten enviar a esa dirección "
        "y a ese origen no van a despachar el correo."
    )

    pdf.h2("Resumen para mostrarle al vecino")
    pdf.bullet(
        "No recibir más recordatorios u avisos opcionales → usar el link “darse de baja” al pie del mail."
    )
    pdf.bullet(
        "Seguir recibiendo turnos y expedientes → no hace falta nada: la baja de un aviso opcional no los corta."
    )
    pdf.bullet(
        "Cancelar un mail de turno o expediente → no se puede por este medio; consultar a la oficina o a registro@lujandecuyo.gob.ar."
    )
    pdf.bullet(
        "El mail no llega / vuelve rebotado → el sistema deja de reenviar solo; hay que corregir la dirección de correo."
    )

    pdf.h2("Qué hace el personal interno")
    pdf.p("En el Mail Service, con el token interno:")
    pdf.bullet("Dashboard: historial de envíos, incluido el estado “suprimido” (no enviado).")
    pdf.bullet("Supresión: lista de direcciones bloqueadas, motivo y origen.")
    pdf.bullet("Reactivar: si una baja fue un error o el vecino lo pidió.")
    pdf.ln(2)
    pdf.p(
        "Los sistemas que envían (turnos, expediente, etc.) no tienen que armar el "
        "link de baja: lo agrega el Mail Service en todos los correos."
    )
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
