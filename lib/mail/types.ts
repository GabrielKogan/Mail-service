export type MailMessage = {
  to: string;
  toName: string;
  subject: string;
  html: string;
};

export type MailSendResult = {
  messageId: string;
};

export interface MailProvider {
  send(message: MailMessage): Promise<MailSendResult>;
}
