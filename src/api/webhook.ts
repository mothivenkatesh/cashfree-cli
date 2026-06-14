import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cashfree webhook signature. Verified against cashfree-pg-webhook samples and
 * the signature-verification docs:
 *   signature = base64( HMAC-SHA256( timestamp + rawBody, clientSecret ) )
 * The string signed is the timestamp concatenated with the RAW body, never the
 * parsed JSON. Headers: x-webhook-signature, x-webhook-timestamp.
 */
export function signWebhook(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret)
    .update(timestamp + rawBody)
    .digest("base64");
}

export interface WebhookVerifyResult {
  valid: boolean;
  reason?: string;
}

/** Default freshness window. Docs do not mandate one; 5 min is the safe default. */
const DEFAULT_TOLERANCE_SECONDS = 300;

export function verifyWebhook(opts: {
  secret: string;
  signature: string;
  timestamp: string;
  rawBody: string;
  toleranceSeconds?: number;
  now?: number;
}): WebhookVerifyResult {
  const expected = signWebhook(opts.secret, opts.timestamp, opts.rawBody);

  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "signature_mismatch" };
  }

  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const ts = Number(opts.timestamp);
  if (Number.isFinite(ts)) {
    const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
    // Cashfree timestamps are milliseconds; normalize either form.
    const tsSec = ts > 1e12 ? Math.floor(ts / 1000) : ts;
    if (Math.abs(nowSec - tsSec) > tolerance) {
      return { valid: false, reason: "timestamp_outside_tolerance" };
    }
  }

  return { valid: true };
}
