import type { CommandContext } from "../core/context.js";
import { type Input, flagStr, flagNum } from "./_args.js";
import { startReceiver, type ReceivedWebhook } from "../core/receiver.js";
import { registerSubscription, unregisterSubscription, MOCK_WEBHOOK_SECRET } from "../api/mock-client.js";
import { getCredentials } from "../config/store.js";
import { CashfreeError } from "../core/errors.js";

/**
 * Forward webhooks to localhost, verify signatures locally, no ngrok. The
 * feature developers praise most about Stripe's CLI, and that no Indian PG
 * ships. In mock mode it wires straight to the simulator. In real mode it
 * receives once a tunnel points at it (the platform dependency we are honest
 * about).
 */
export async function listen(ctx: CommandContext, input: Input): Promise<void> {
  const forwardTo = flagStr(input.values, "forward-to");
  const port = flagNum(input.values, "port") ?? 4422;

  const secret = ctx.mock ? MOCK_WEBHOOK_SECRET : credsSecret(ctx);

  let count = 0;
  const onEvent = async (event: ReceivedWebhook) => {
    count += 1;
    printEvent(ctx, event);
    if (forwardTo) {
      await fetch(forwardTo, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: event.rawBody,
      }).catch((err) => ctx.out.note(`  forward failed: ${err.message}`));
    }
  };

  const receiver = await startReceiver({ secret, port, onEvent });

  if (ctx.mock) {
    registerSubscription(receiver.url);
    ctx.out.heading(`Listening on ${receiver.url} (mock sandbox)`);
    ctx.out.note("In another terminal run `cashfree simulate payment ...` or `cashfree verify --mock`.");
  } else {
    ctx.out.heading(`Listening on ${receiver.url} (${ctx.mode})`);
    ctx.out.note("Point a tunnel (cloudflared/ngrok) or your registered webhook URL at this address.");
  }
  if (forwardTo) ctx.out.note(`Forwarding verified events to ${forwardTo}`);

  await new Promise<void>((resolveWait) => {
    const shutdown = async () => {
      if (ctx.mock) unregisterSubscription(receiver.url);
      await receiver.close();
      ctx.out.note(`\nStopped after ${count} event(s).`);
      resolveWait();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

function credsSecret(ctx: CommandContext): string {
  const creds = getCredentials(ctx.profile, ctx.mode);
  if (!creds) throw CashfreeError.auth(`No ${ctx.mode} credentials for profile '${ctx.profile}'.`);
  return creds.clientSecret;
}

function printEvent(ctx: CommandContext, event: ReceivedWebhook): void {
  if (ctx.out.isJson) {
    // stream-json: one JSON object per line.
    process.stdout.write(
      JSON.stringify({
        type: "webhook",
        signature_valid: event.signatureValid,
        reason: event.reason,
        received_at: event.receivedAt,
        body: event.json,
      }) + "\n",
    );
    return;
  }
  const data = event.json as { type?: string; data?: { payment?: { payment_status?: string }; order?: { order_id?: string } } };
  ctx.out.step(
    event.signatureValid,
    `${data.type ?? "event"}  order=${data.data?.order?.order_id ?? "?"}  payment=${data.data?.payment?.payment_status ?? "?"}  sig=${event.signatureValid ? "valid" : event.reason}`,
  );
}
