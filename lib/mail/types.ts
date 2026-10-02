export type MailAttachment = {
  filename: string;
  contentType: string;
  /** Contenido en Base64 (sin prefijo data:). */
  contentBase64: string;
};

export type MailMessage = {
  to: string;
  toName: string;
  subject: string;
  html: string;
  /** Parte de texto plano (el mensaje sale multipart/alternative). */
  text?: string;
  /** Headers extra (p. ej. List-Unsubscribe, Feedback-ID). */
  headers?: Record<string, string>;
  /** Etiquetas del envío (p. ej. mail_log_id). Cada proveedor las traduce a su formato. */
  tags?: Record<string, string>;
  attachments?: MailAttachment[];
};

export type MailSendResult = {
  messageId: string;
};

export interface MailProvider {
  send(message: MailMessage): Promise<MailSendResult>;
}
