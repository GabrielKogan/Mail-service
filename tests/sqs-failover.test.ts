import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({
  value: {
    awsRegion: 'eu-central-1',
    sqsSendQueueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/mail-send' as string | undefined,
    sqsSendQueueUrlSecondary: 'https://sqs.eu-west-1.amazonaws.com/123456789012/mail-send' as
      | string
      | undefined,
  },
}));

vi.mock('@/lib/config', () => ({ config: () => cfg.value }));

const { enqueueSendJob, setSqsClientForTests } = await import('@/lib/queue/sqs');

type Sent = { input: { QueueUrl: string; MessageBody: string } };

beforeEach(() => {
  cfg.value = {
    awsRegion: 'eu-central-1',
    sqsSendQueueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/mail-send',
    sqsSendQueueUrlSecondary: 'https://sqs.eu-west-1.amazonaws.com/123456789012/mail-send',
  };
  setSqsClientForTests(null);
});

describe('enqueueSendJob', () => {
  it('se queda en la región principal si responde', async () => {
    const send = vi.fn(async (_cmd: Sent) => ({}));
    setSqsClientForTests({ send } as never);
    await enqueueSendJob(7);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].input.QueueUrl).toContain('eu-central-1');
  });

  it('encola en la región de respaldo si la principal falla', async () => {
    const send = vi.fn(async (cmd: Sent) => {
      if (cmd.input.QueueUrl.includes('eu-central-1')) throw new Error('region caida');
      return {};
    });
    setSqsClientForTests({ send } as never);
    await enqueueSendJob(7);
    expect(send).toHaveBeenCalledTimes(2);
    const queued = send.mock.calls[1]?.[0];
    const body = JSON.parse(queued?.input.MessageBody ?? '{}') as { mailLogId: number };
    expect(body.mailLogId).toBe(7);
    expect(queued?.input.QueueUrl).toContain('eu-west-1');
  });

  it('falla si ninguna región acepta el mensaje', async () => {
    const send = vi.fn(async () => {
      throw new Error('region caida');
    });
    setSqsClientForTests({ send } as never);
    await expect(enqueueSendJob(7)).rejects.toThrow('region caida');
    expect(send).toHaveBeenCalledTimes(2);
  });
});
