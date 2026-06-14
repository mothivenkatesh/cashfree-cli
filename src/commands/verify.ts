import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { CommandContext } from "../core/context.js";
import { type Input, flagStr, flagNum, flagBool } from "./_args.js";
import { CashfreeError } from "../core/errors.js";
import { startReceiver, type ReceivedWebhook } from "../core/receiver.js";
import { startTunnel, type Tunnel } from "../core/tunnel.js";
import {
  registerSubscription,
  unregisterSubscription,
  MOCK_WEBHOOK_SECRET,
} from "../api/mock-client.js";
import { getCredentials } from "../config/store.js";

/**
 * The wedge. Proves an integration works end to end:
 *   create order -> pay -> receive the webhook locally -> verify its signature
 *   -> CROSS-CHECK status against the API (never trust the webhook) -> artifact.
 *
 * Stripe's CLI fetches objects. This proves the loop. The API cross-check is the
 * non-negotiable step (gate G3): a webhook is a signal, the API is the truth.
 */
export async function verify(ctx: CommandContext, input: Input): Promise<void> {
  const method = (flagStr(input.values, "method") ?? "upi").toLowerCase();
  if (method !== "upi") {
    throw CashfreeError.validation(`--method '${method}' not supported yet (try: upi).`);
  }
  const outcome = (flagStr(input.values, "outcome") ?? "success").toLowerCase();
  if (outcome !== "success" && outcome !== "failure") {
    throw CashfreeError.validation("--outcome must be 'success' or 'failure'.");
  }
  const amount = flagNum(input.values, "amount") ?? 100;
  const expectPaid = outcome === "success";
  const vpa = expectPaid ? "testsuccess@gocash" : "testfailure@gocash";

  const client = ctx.getClient();
  const secret = ctx.mock ? MOCK_WEBHOOK_SECRET : credsSecret(ctx);

  ctx.out.heading(`Verifying ${method} ${outcome} (${ctx.mock ? "mock" : ctx.mode})`);

  // 1. Catch the webhook locally.
  let captured: ReceivedWebhook | null = null;
  let settle: (e: ReceivedWebhook | null) => void = () => {};
  const webhookPromise = new Promise<ReceivedWebhook | null>((r) => (settle = r));
  const receiver = await startReceiver({
    secret,
    onEvent: (e) => {
      captured = e;
      settle(e);
    },
  });
  if (ctx.mock) registerSubscription(receiver.url);

  // Real mode: open a public tunnel so live webhooks reach this local receiver.
  let tunnel: Tunnel | null = null;
  let notifyUrl = flagStr(input.values, "notify-url");
  if (!ctx.mock && flagBool(input.values, "tunnel")) {
    tunnel = await startTunnel(receiver.port);
    if (tunnel) {
      notifyUrl = `${tunnel.url}/cashfree-webhook`;
      ctx.out.step(true, `tunnel  ${tunnel.url}`);
    } else {
      ctx.out.step("warn", "tunnel  unavailable (cloudflared missing or rate-limited); webhook leg will be skipped");
    }
  }
  const expectWebhook = ctx.mock || tunnel !== null;

  try {
    // 2. Create the order (notify_url routes the webhook back through the tunnel).
    const order = await client.createOrder({
      order_amount: amount,
      order_currency: "INR",
      customer_details: { customer_id: `vrf_${randomBytes(4).toString("hex")}`, customer_phone: "9999999999" },
      order_meta: notifyUrl ? { notify_url: notifyUrl } : undefined,
    });
    ctx.out.step(true, `order created  ${order.order_id} (${order.order_status})`);

    // 3. Pay. Mock resolves + delivers the webhook; real mode then forces the
    //    outcome via /simulate so it works with no live payer.
    const pay = await client.orderPay({
      payment_session_id: order.payment_session_id,
      payment_method: { upi: { channel: "collect", upi_id: vpa } },
    });
    ctx.out.step(true, `payment initiated  ${pay.cf_payment_id}`);

    if (!ctx.mock) {
      await client.simulate({
        entity: "PAYMENTS",
        entity_id: pay.cf_payment_id,
        entity_simulation: { payment_status: expectPaid ? "SUCCESS" : "FAILED" },
      });
    }

    // 4. Wait for the webhook. Mock delivers locally; real mode delivers through
    //    the tunnel if one was opened. Otherwise the leg is skipped honestly.
    let webhookReceived = false;
    let signatureValid: boolean | null = null;
    if (expectWebhook) {
      const timeout = setTimeout(() => settle(null), tunnel ? 35000 : 5000);
      const event = await webhookPromise;
      clearTimeout(timeout);
      webhookReceived = !!event;
      signatureValid = event ? event.signatureValid : null;
      ctx.out.step(
        webhookReceived && !!signatureValid,
        `webhook received  signature ${signatureValid ? "valid" : event ? event.reason : "not received (timed out)"}`,
      );
    } else {
      ctx.out.step("warn", "webhook  skipped locally (add --tunnel with cloudflared installed, or run `cashfree listen`)");
    }

    // 5. Cross-check the authoritative API. This is the truth, not the webhook.
    const fresh = await client.getOrder(order.order_id);
    const isPaid = fresh.order_status === "PAID";
    const apiCrosscheckPassed = isPaid === expectPaid;
    ctx.out.step(apiCrosscheckPassed, `api cross-check  order_status=${fresh.order_status} (expected ${expectPaid ? "PAID" : "not PAID"})`);

    // 6. Verdict + artifact.
    const passed = apiCrosscheckPassed && (expectWebhook ? webhookReceived && signatureValid === true : true);
    const artifact = {
      tool: "cashfree verify",
      mode: ctx.mock ? "sandbox-mock" : ctx.mode,
      method,
      expected_outcome: outcome,
      order_id: order.order_id,
      cf_payment_id: pay.cf_payment_id,
      webhook_received: webhookReceived,
      webhook_signature_valid: signatureValid,
      tunnel_url: tunnel?.url ?? null,
      api_order_status: fresh.order_status,
      api_crosscheck_passed: apiCrosscheckPassed,
      passed,
      generated_at: new Date().toISOString(),
    };

    const dir = join(process.cwd(), ".cashfree");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `verify-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(artifact, null, 2));
    ctx.out.step(true, `artifact  ${file}`);
    ctx.out.result(artifact);

    if (!passed) {
      throw new CashfreeError({
        code: "verification_failed",
        message: "Verification did not pass.",
        exitCode: 1,
        detail: JSON.stringify(artifact),
        suggestedFix: "Read the failing step above. The artifact has the full trace.",
      });
    }
  } finally {
    if (ctx.mock) unregisterSubscription(receiver.url);
    if (tunnel) await tunnel.close();
    await receiver.close();
  }
}

function credsSecret(ctx: CommandContext): string {
  const creds = getCredentials(ctx.profile, ctx.mode);
  if (!creds) throw CashfreeError.auth(`No ${ctx.mode} credentials for profile '${ctx.profile}'.`);
  return creds.clientSecret;
}
