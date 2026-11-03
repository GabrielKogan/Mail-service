import { MailProviderError, isRetryableError, mailErrorMessage } from '../errors';
import { isSesAvailabilityError } from './ses-api';
import type { MailMessage, MailProvider, MailSendResult } from '../types';

/**
 * SES primero (el global endpoint reparte entre las dos regiones). Si esa
 * llamada cae por disponibilidad, el mismo mensaje sale por Brevo.
 */
export class SesWithBrevoFallback implements MailProvider {
  constructor(
    private readonly ses: MailProvider,
    private readonly brevo: MailProvider
  ) {}

  async send(message: MailMessage): Promise<MailSendResult> {
    try {
      return await this.ses.send(message);
    } catch (err) {
      if (!isSesAvailabilityError(err)) throw err;
      console.warn(
        '[mail] SES no disponible tras las dos regiones, enviando con Brevo:',
        mailErrorMessage(err)
      );
      try {
        const result = await this.brevo.send(message);
        return { messageId: result.messageId, proveedor: 'brevo' };
      } catch (brevoErr) {
        throw new MailProviderError(
          `SES no disponible (${mailErrorMessage(err)}); Brevo: ${mailErrorMessage(brevoErr)}`,
          { retryable: isRetryableError(brevoErr), cause: brevoErr }
        );
      }
    }
  }
}
