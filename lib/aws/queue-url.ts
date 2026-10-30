/** Región de una URL pública de SQS: `https://sqs.<región>.amazonaws.com/<cuenta>/<nombre>`. */
export function regionFromQueueUrl(queueUrl: string): string | null {
  try {
    const host = new URL(queueUrl).hostname;
    const match = /^sqs\.([a-z0-9-]+)\.amazonaws\.com$/.exec(host);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
