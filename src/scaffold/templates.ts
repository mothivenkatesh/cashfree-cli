import { API_VERSION } from "../config/environment.js";

export const ENV_EXAMPLE = `# Cashfree credentials (sandbox). Get them from the merchant dashboard.
CASHFREE_CLIENT_ID=your_sandbox_app_id
CASHFREE_CLIENT_SECRET=your_sandbox_secret_key
CASHFREE_API_VERSION=${API_VERSION}
`;

/** A working, framework-agnostic webhook verifier the developer can ship. */
export const NODE_WEBHOOK_HANDLER = `import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Cashfree webhook signature.
 * signature = base64( HMAC-SHA256( timestamp + rawBody, clientSecret ) )
 * IMPORTANT: sign the RAW body, never the parsed JSON.
 */
export function verifyCashfreeSignature({ secret, signature, timestamp, rawBody }) {
  const expected = createHmac("sha256", secret)
    .update(timestamp + rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Express example ---
// app.post("/webhook", express.raw({ type: "*/*" }), (req, res) => {
//   const rawBody = req.body.toString("utf8");
//   const ok = verifyCashfreeSignature({
//     secret: process.env.CASHFREE_CLIENT_SECRET,
//     signature: req.header("x-webhook-signature"),
//     timestamp: req.header("x-webhook-timestamp"),
//     rawBody,
//   });
//   if (!ok) return res.status(401).send("bad signature");
//
//   // A webhook is a signal, not the truth. Before you fulfill an order,
//   // confirm status via the API (GET /orders/{order_id}). Do not trust the
//   // payload's status alone.
//   res.sendStatus(200);
// });
`;

export function agentsMd(): string {
  return `# Cashfree integration notes (for AI coding agents)

This file is read by Claude Code / Cursor / other agents. Keep it accurate.

## API
- Base URL (sandbox): https://sandbox.cashfree.com/pg
- Base URL (live): https://api.cashfree.com/pg
- Pin the header \`x-api-version: ${API_VERSION}\`. Do not guess a version.
- Auth headers: \`x-client-id\`, \`x-client-secret\`. Never hardcode them; read from env.

## Webhooks (read this before writing a handler)
- Signature = base64(HMAC-SHA256(\`x-webhook-timestamp\` + RAW_BODY, client_secret)).
- Headers: \`x-webhook-signature\`, \`x-webhook-timestamp\`.
- Sign the RAW request body, never the parsed JSON.
- A webhook is a SIGNAL, NOT THE TRUTH. Before fulfilling an order, confirm
  status with GET /orders/{order_id}. Never settle on the webhook payload alone.

## Order status enum
ACTIVE, PAID, EXPIRED, TERMINATED, TERMINATION_REQUESTED. Only PAID is "paid".

## CLI you can drive (non-interactive, JSON out)
- \`cashfree init\`            scaffold this integration
- \`cashfree simulate payment --payment-id <id> --status SUCCESS\`
- \`cashfree listen --forward-to http://localhost:3000/webhook\`
- \`cashfree verify --mock\`   prove an integration works end to end
- \`cashfree doctor\`          preflight, why you are not live yet
- Add \`--json\` for machine output. Add \`--mock\` to run offline.

## Exit codes
0 ok, 1 runtime, 2 auth, 3 validation, 4 confirmation-required, 5 api,
6 not-found, 7 rate-limited, 8 network. Branch on these, do not scrape text.
`;
}
