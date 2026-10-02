import { createSign, generateKeyPairSync } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSnsCertCache,
  stringToSign,
  verifySnsMessage,
  type SnsEnvelope,
} from '@/lib/aws/sns-verify';

const TOPIC = 'arn:aws:sns:eu-central-1:123456789012:mail-service-events';
const CERT_URL = 'https://sns.eu-central-1.amazonaws.com/SimpleNotificationService-abc.pem';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const fetcher = async () => publicPem;

function signed(overrides: Partial<SnsEnvelope> = {}, version: '1' | '2' = '2'): SnsEnvelope {
  const envelope: SnsEnvelope = {
    Type: 'Notification',
    MessageId: 'b1c2-msg',
    TopicArn: TOPIC,
    Message: JSON.stringify({ eventType: 'Complaint', mail: { messageId: 'x' } }),
    Timestamp: '2026-09-24T12:00:00.000Z',
    SignatureVersion: version,
    SigningCertURL: CERT_URL,
    ...overrides,
  };
  const signer = createSign(version === '2' ? 'RSA-SHA256' : 'RSA-SHA1');
  signer.update(stringToSign(envelope) as string, 'utf8');
  envelope.Signature = signer.sign(privateKey, 'base64');
  return envelope;
}

describe('verifySnsMessage', () => {
  beforeEach(() => clearSnsCertCache());

  it('acepta un mensaje firmado (SignatureVersion 1 y 2)', async () => {
    expect(await verifySnsMessage(signed({}, '2'), TOPIC, fetcher)).toEqual({ ok: true });
    expect(await verifySnsMessage(signed({}, '1'), TOPIC, fetcher)).toEqual({ ok: true });
  });

  it('rechaza un mensaje con el cuerpo alterado', async () => {
    const env = signed();
    env.Message = JSON.stringify({ eventType: 'Complaint', mail: { messageId: 'otro' } });
    expect(await verifySnsMessage(env, TOPIC, fetcher)).toMatchObject({ ok: false, reason: 'Firma inválida' });
  });

  it('rechaza certificados de hosts ajenos', async () => {
    for (const url of [
      'https://evil.example.com/cert.pem',
      'https://sns.eu-central-1.amazonaws.com.evil.com/cert.pem',
      'http://sns.eu-central-1.amazonaws.com/cert.pem',
      'https://sns.us-east-1.amazonaws.com/cert.pem',
    ]) {
      const env = signed({ SigningCertURL: url });
      expect(await verifySnsMessage(env, TOPIC, fetcher)).toMatchObject({ ok: false });
    }
  });

  it('rechaza un TopicArn distinto al permitido', async () => {
    const env = signed({ TopicArn: 'arn:aws:sns:eu-central-1:999999999999:otro' });
    expect(await verifySnsMessage(env, TOPIC, fetcher)).toMatchObject({ ok: false, reason: 'TopicArn no permitido' });
  });

  it('rechaza todo si no hay tópico configurado', async () => {
    expect(await verifySnsMessage(signed(), undefined, fetcher)).toMatchObject({ ok: false });
  });

  it('valida el host de SubscribeURL en confirmaciones', async () => {
    const good = signed({
      Type: 'SubscriptionConfirmation',
      Token: 'tok',
      SubscribeURL: 'https://sns.eu-central-1.amazonaws.com/?Action=ConfirmSubscription&Token=tok',
    });
    expect(await verifySnsMessage(good, TOPIC, fetcher)).toEqual({ ok: true });

    const bad = signed({
      Type: 'SubscriptionConfirmation',
      Token: 'tok',
      SubscribeURL: 'http://169.254.169.254/latest/meta-data/',
    });
    expect(await verifySnsMessage(bad, TOPIC, fetcher)).toMatchObject({
      ok: false,
      reason: 'SubscribeURL no pertenece a SNS',
    });
  });
});
