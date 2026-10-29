import { createHmac, timingSafeEqual } from 'node:crypto';

const hmac = (secret: string, timestamp: number, payload: string | Buffer) =>
  createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest('hex');

/** Create a "t=<unix>,v1=<hex hmac>" signature header (the scheme Stripe uses). */
export function signWebhook(payload: string | Buffer, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${hmac(secret, timestamp, payload)}`;
}

export interface VerifyWebhookOptions {
  /** The raw request body, exactly as received. Re-serialized JSON will not verify. */
  payload: string | Buffer;
  header: string | undefined;
  secret: string;
  toleranceSeconds?: number;
  now?: number;
}

/**
 * Verify a "t=...,v1=..." HMAC-SHA256 webhook signature in constant time and reject stale
 * timestamps (replays). Compatible with Stripe's scheme; prefer your provider's SDK when it has one.
 * Pair with storing processed event IDs. Control PAY-C3.
 */
export function verifyWebhookSignature(opts: VerifyWebhookOptions): boolean {
  if (!opts.header) return false;
  const parts = opts.header.split(',').map((p) => p.trim().split('=') as [string, string]);
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isInteger(timestamp) || signatures.length === 0) return false;

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > (opts.toleranceSeconds ?? 300)) return false;

  const expected = Buffer.from(hmac(opts.secret, timestamp, opts.payload), 'hex');
  return signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
