import type { CommandContext } from "../core/context.js";
import { type Input, flagStr } from "./_args.js";
import { CashfreeError } from "../core/errors.js";

/**
 * `cashfree disputes order <order_id>` — list disputes for an order.
 * Cashfree has no list-all-disputes API, disputes are fetched per order or by id.
 */
export async function disputesByOrder(ctx: CommandContext, input: Input): Promise<void> {
  const orderId = input.positionals[0] ?? flagStr(input.values, "order");
  if (!orderId) {
    throw CashfreeError.validation(
      "Provide an order id (positional) or --order.",
      "Cashfree has no list-all-disputes API; disputes are fetched per order or by dispute id (`disputes get <id>`).",
    );
  }
  const disputes = await ctx.getClient().getDisputesByOrder(orderId);
  if (!ctx.out.isJson) {
    ctx.out.heading(`Disputes for ${orderId} (${disputes.length})`);
    for (const d of disputes) {
      ctx.out.step(
        "warn",
        `${d.dispute_id}  ₹${d.dispute_amount ?? "?"}  ${d.dispute_status ?? ""}  respond_by=${d.respond_by ?? "?"}`,
      );
    }
  }
  ctx.out.result(disputes);
}

export async function disputesGet(ctx: CommandContext, input: Input): Promise<void> {
  const id = input.positionals[0] ?? flagStr(input.values, "dispute-id");
  if (!id) throw CashfreeError.validation("Provide a dispute id (positional) or --dispute-id.");
  ctx.out.result(await ctx.getClient().getDispute(id));
}
