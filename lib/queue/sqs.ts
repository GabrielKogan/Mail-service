import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs';
import { regionFromQueueUrl } from '@/lib/aws/queue-url';
import { config } from '@/lib/config';

const ENQUEUE_TIMEOUT_MS = 8_000;

const clients = new Map<string, SQSClient>();
let testClient: SQSClient | null = null;

/** Cliente de la región que indica la URL. Cada región tiene el suyo. */
export function sqsClientFor(queueUrl: string): SQSClient {
  if (testClient) return testClient;
  const region = regionFromQueueUrl(queueUrl) ?? config().awsRegion;
  if (!region) throw new Error(`No se pudo determinar la región de la cola ${queueUrl}`);
  let client = clients.get(region);
  if (!client) {
    client = new SQSClient({ region });
    clients.set(region, client);
  }
  return client;
}

export function setSqsClientForTests(c: SQSClient | null): void {
  testClient = c;
  clients.clear();
}

export type SendJobMessage = { mailLogId: number };

export async function enqueue(
  queueUrl: string,
  body: unknown,
  opts: { delaySeconds?: number } = {}
): Promise<void> {
  await sqsClientFor(queueUrl).send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
      DelaySeconds: opts.delaySeconds,
    }),
    { abortSignal: AbortSignal.timeout(ENQUEUE_TIMEOUT_MS) }
  );
}

/** Colas de envío: la principal y, si está configurada, la de respaldo. */
export function sendQueueUrls(): string[] {
  const { sqsSendQueueUrl, sqsSendQueueUrlSecondary } = config();
  return [sqsSendQueueUrl, sqsSendQueueUrlSecondary].filter((url): url is string => Boolean(url));
}

/**
 * Encola en la región principal. Si no responde, usa la de respaldo.
 * El worker lee las dos, y el envío real lo toma una sola vez.
 */
export async function enqueueSendJob(mailLogId: number): Promise<void> {
  const urls = sendQueueUrls();
  if (!urls.length) throw new Error('SQS_SEND_QUEUE_URL no está configurado');
  let last: unknown;
  for (const url of urls) {
    try {
      await enqueue(url, { mailLogId } satisfies SendJobMessage);
      if (url !== urls[0]) console.warn('[sqs] envío encolado en la región de respaldo');
      return;
    } catch (err) {
      last = err;
      if (urls.length > 1) {
        console.warn('[sqs] no se pudo encolar', err instanceof Error ? err.message : err);
      }
    }
  }
  throw last instanceof Error ? last : new Error('No se pudo encolar el envío');
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
  const res = await sqsClientFor(queueUrl).send(
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
  await sqsClientFor(queueUrl).send(
    new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle })
  );
}

async function delayRetry(queueUrl: string, receiptHandle: string, seconds: number): Promise<void> {
  try {
    await sqsClientFor(queueUrl).send(
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
