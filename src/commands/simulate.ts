import type { CommandContext } from "../core/context.js";
import { type Input, flagStr } from "./_args.js";
import { CashfreeError } from "../core/errors.js";
import type { SimulateRequest } from "../api/types.js";

const VALID = ["SUCCESS", "FAILED", "PENDING", "USER_DROPPED"] as const;

/** `cashfree simulate payment --payment-id <cf_payment_id> --status SUCCESS` */
export async function simulatePayment(ctx: CommandContext, input: Input): Promise<void> {
  if (ctx.isLive()) {
    throw CashfreeError.validation(
      "simulate is a sandbox-only operation.",
      "Drop --live. Simulation forces test outcomes; it has no meaning against real money.",
    );
  }

  let paymentId = flagStr(input.values, "payment-id") ?? input.positionals[0];

  // Convenience: resolve the latest payment for an order if no id is given.
  const orderId = flagStr(input.values, "order");
  if (!paymentId && orderId) {
    const payments = await ctx.getClient().getPayments(orderId);
    paymentId = payments[payments.length - 1]?.cf_payment_id;
    if (!paymentId) throw CashfreeError.validation(`No payment found for order '${orderId}'. Pay it first.`);
  }
  if (!paymentId) {
    throw CashfreeError.validation("Provide --payment-id (cf_payment_id) or --order.");
  }

  const statusRaw = (flagStr(input.values, "status") ?? "SUCCESS").toUpperCase();
  if (!VALID.includes(statusRaw as (typeof VALID)[number])) {
    throw CashfreeError.validation(`--status must be one of ${VALID.join(", ")}.`);
  }

  const req: SimulateRequest = {
    entity: "PAYMENTS",
    entity_id: paymentId,
    entity_simulation: { payment_status: statusRaw as SimulateRequest["entity_simulation"]["payment_status"] },
  };
  await ctx.getClient().simulate(req);
  ctx.out.step(true, `Simulated ${statusRaw} on ${paymentId}.`);
  ctx.out.result({ entity_id: paymentId, simulated_status: statusRaw, status: "OK" });
}
