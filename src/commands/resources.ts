import { randomBytes } from "node:crypto";
import type { CommandContext } from "../core/context.js";
import { type Input, requireNum, flagStr, flagNum, requireStr } from "./_args.js";
import { CashfreeError } from "../core/errors.js";

function rid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function orderIdFrom(input: Input, flag = "order"): string {
  const v = input.positionals[0] ?? flagStr(input.values, flag);
  if (!v) throw CashfreeError.validation(`Provide an order id (positional) or --${flag}.`);
  return v;
}

// ---- Orders ----

export async function ordersCreate(ctx: CommandContext, input: Input): Promise<void> {
  const amount = requireNum(input.values, "amount");
  const notifyUrl = flagStr(input.values, "notify-url");
  const order = await ctx.getClient().createOrder({
    order_amount: amount,
    order_currency: flagStr(input.values, "currency") ?? "INR",
    order_id: flagStr(input.values, "order-id"),
    order_note: flagStr(input.values, "note"),
    customer_details: {
      customer_id: flagStr(input.values, "customer-id") ?? rid("cust"),
      customer_phone: flagStr(input.values, "phone") ?? "9999999999",
      customer_email: flagStr(input.values, "email"),
    },
    order_meta: notifyUrl ? { notify_url: notifyUrl } : undefined,
  });
  ctx.out.step(true, `Order ${order.order_id} created (${order.order_status}).`);
  ctx.out.result(order);
}

export async function ordersGet(ctx: CommandContext, input: Input): Promise<void> {
  const order = await ctx.getClient().getOrder(orderIdFrom(input));
  ctx.out.result(order);
}

// ---- Payments ----

export async function paymentsList(ctx: CommandContext, input: Input): Promise<void> {
  const payments = await ctx.getClient().getPayments(orderIdFrom(input));
  ctx.out.result(payments);
}

// ---- Refunds ----

export async function refundsCreate(ctx: CommandContext, input: Input): Promise<void> {
  ctx.guardLiveMoney("issue a refund"); // G2
  const orderId = orderIdFrom(input);
  const refund = await ctx.getClient().createRefund(orderId, {
    refund_amount: requireNum(input.values, "amount"),
    refund_id: flagStr(input.values, "refund-id") ?? rid("rfnd"),
    refund_note: flagStr(input.values, "note"),
  });
  ctx.out.step(true, `Refund ${refund.refund_id} created (${refund.refund_status}).`);
  ctx.out.result(refund);
}

export async function refundsGet(ctx: CommandContext, input: Input): Promise<void> {
  const orderId = orderIdFrom(input);
  const refund = await ctx.getClient().getRefund(orderId, requireStr(input.values, "refund-id"));
  ctx.out.result(refund);
}

// ---- Payment Links ----

export async function linksCreate(ctx: CommandContext, input: Input): Promise<void> {
  const link = await ctx.getClient().createLink({
    link_id: flagStr(input.values, "link-id") ?? rid("link"),
    link_amount: requireNum(input.values, "amount"),
    link_currency: flagStr(input.values, "currency") ?? "INR",
    link_purpose: flagStr(input.values, "purpose") ?? "CLI test link",
    customer_details: {
      customer_id: flagStr(input.values, "customer-id") ?? rid("cust"),
      customer_phone: flagStr(input.values, "phone") ?? "9999999999",
      customer_email: flagStr(input.values, "email"),
    },
  });
  ctx.out.step(true, `Link ${link.link_id} created: ${link.link_url}`);
  ctx.out.result(link);
}

export async function linksGet(ctx: CommandContext, input: Input): Promise<void> {
  const linkId = input.positionals[0] ?? flagStr(input.values, "link-id");
  if (!linkId) throw CashfreeError.validation("Provide a link id (positional) or --link-id.");
  ctx.out.result(await ctx.getClient().getLink(linkId));
}

// ---- Settlements ----

export async function settlementsGet(ctx: CommandContext, input: Input): Promise<void> {
  const settlements = await ctx.getClient().getSettlements(orderIdFrom(input));
  ctx.out.result(settlements);
}
