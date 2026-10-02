import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs';
import { config } from '@/lib/config';

let client: SQSClient | null = null;

/** Credenciales por la cadena estándar del SDK (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY). */
export function sqsClient(): SQSClient {
  client ??= new SQSClient({ region: config().awsRegion });
  return client;
}

export function setSqsClientForTests(c: SQSClient | null): void {
  client = c;
}

export type SendJobMessage = { mailLogId: number };

export async function enqueue(
  queueUrl: string,
  body: unknown,
  opts: { delaySeconds?: number } = {}
): Promise<void> {
  await sqsClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
      DelaySeconds: opts.delaySeconds,
    })
  );
}

export async function enqueueSendJob(mailLogId: number): Promise<void> {
  const url = config().sqsSendQueueUrl;
  if (!url) throw new Error('SQS_SEND_QUEUE_URL no está configurado');
  await enqueue(url, { mailLogId } satisfies SendJobMessage);
}

export type ReceivedMessage = {
  messageId: string;
  body: string;
  receiptHandle: string;
  /** Veces que SQS entregó este mensaje (1 en el primer intento). */
  receiveCount: number;
};

function toReceived(m: Message): ReceivedMessage | null {
  if (!m.ReceiptHandle || m.Body == null) return null;
  return {
    messageId: m.MessageId ?? '',
    body: m.Body,
    receiptHandle: m.ReceiptHandle,
    receiveCount: Number(m.Attributes?.ApproximateReceiveCount ?? '1') || 1,
  };
}

export async function receiveBatch(
  queueUrl: string,
  opts: { max?: number; waitSeconds?: number; abortSignal?: AbortSignal } = {}
): Promise<ReceivedMessage[]> {
  const res = await sqsClient().send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: Math.min(10, Math.max(1, opts.max ?? 10)),
      WaitTimeSeconds: opts.waitSeconds ?? 20,
      MessageSystemAttributeNames: ['ApproximateReceiveCount'],
    }),
    { abortSignal: opts.abortSignal }
  );
  return (res.Messages ?? []).map(toReceived).filter((m): m is ReceivedMessage => m !== null);
}

export async function deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
  await sqsClient().send(
    new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle })
  );
}

async function delayRetry(queueUrl: string, receiptHandle: string, seconds: number): Promise<void> {
  try {
    await sqsClient().send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: Math.min(43_200, Math.max(0, Math.round(seconds))),
      })
    );
  } catch {
    // Si falla, el mensaje vuelve a verse cuando vence la visibilidad de la cola.
  }
}

export type PollOptions = {
  concurrency: number;
  waitSeconds?: number;
  /** Segundos hasta el próximo intento cuando el handler falla (según el número de intento). */
  retryDelaySeconds?: (receiveCount: number) => number;
  onError?: (err: unknown, msg: ReceivedMessage) => void;
};

export type Poller = {
  /** Deja de leer y espera los mensajes en curso, como mucho `timeoutMs`. */
  stop(timeoutMs?: number): Promise<void>;
  readonly done: Promise<void>;
};

/**
 * Lee la cola en forma continua con hasta `concurrency` mensajes en paralelo.
 * Cada mensaje se borra solo si el handler termina sin error; si falla, SQS lo
 * vuelve a entregar y, tras `maxReceiveCount`, lo manda a la cola de fallidos.
 */
export function poll(
  queueUrl: string,
  handler: (msg: ReceivedMessage) => Promise<void>,
  opts: PollOptions
): Poller {
  const concurrency = Math.max(1, opts.concurrency);
  const inFlight = new Set<Promise<void>>();
  const abort = new AbortController();
  let stopped = false;

  const run = async (msg: ReceivedMessage) => {
    try {
      await handler(msg);
      await deleteMessage(queueUrl, msg.receiptHandle);
    } catch (err) {
      opts.onError?.(err, msg);
      if (opts.retryDelaySeconds) {
        await delayRetry(queueUrl, msg.receiptHandle, opts.retryDelaySeconds(msg.receiveCount));
      }
    }
  };

  const loop = async () => {
    while (!stopped) {
      if (inFlight.size >= concurrency) {
        await Promise.race(inFlight);
        continue;
      }
      let batch: ReceivedMessage[];
      try {
        batch = await receiveBatch(queueUrl, {
          max: concurrency - inFlight.size,
          waitSeconds: opts.waitSeconds ?? 20,
          abortSignal: abort.signal,
        });
      } catch (err) {
        if (stopped) break;
        console.error('[sqs] error al leer la cola', queueUrl, err);
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      for (const msg of batch) {
        const p: Promise<void> = run(msg).finally(() => inFlight.delete(p));
        inFlight.add(p);
      }
    }
  };

  const done = loop();

  return {
    done,
    async stop(timeoutMs = 30_000) {
      stopped = true;
      abort.abort();
      await Promise.race([
        Promise.allSettled([done, ...inFlight]),
        new Promise((r) => setTimeout(r, timeoutMs)),
      ]);
    },
  };
}
