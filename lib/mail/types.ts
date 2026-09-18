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
  /** Headers extra (p. ej. X-SES-CONFIGURATION-SET, X-SES-MESSAGE-TAGS). */
  headers?: Record<string, string>;
  attachments?: MailAttachment[];
};

export type MailSendResult = {
  messageId: string;
};

export interface MailProvider {
  send(message: MailMessage): Promise<MailSendResult>;
}
