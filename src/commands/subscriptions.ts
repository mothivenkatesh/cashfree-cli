import { randomBytes } from "node:crypto";
import type { CommandContext } from "../core/context.js";
import { type Input, requireNum, flagStr, flagNum } from "./_args.js";
import { CashfreeError } from "../core/errors.js";
import type { CreatePlanRequest, CreateSubscriptionRequest, PlanType, PlanIntervalType } from "../api/types.js";

function rid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

/** `cashfree subscriptions create-plan --amount 499 --interval-type MONTH` */
export async function subscriptionsCreatePlan(ctx: CommandContext, input: Input): Promise<void> {
  const type = (flagStr(input.values, "type") ?? "PERIODIC").toUpperCase() as PlanType;
  const amount = type === "PERIODIC" ? requireNum(input.values, "amount") : flagNum(input.values, "amount");
  const req: CreatePlanRequest = {
    plan_id: flagStr(input.values, "plan-id") ?? rid("plan"),
    plan_name: flagStr(input.values, "plan-name") ?? "CLI Plan",
    plan_type: type,
    plan_currency: flagStr(input.values, "currency") ?? "INR",
    plan_recurring_amount: amount,
    plan_max_amount: flagNum(input.values, "max-amount") ?? amount,
    plan_intervals: flagNum(input.values, "interval") ?? 1,
    plan_interval_type: (flagStr(input.values, "interval-type") ?? "MONTH").toUpperCase() as PlanIntervalType,
  };
  const plan = await ctx.getClient().createPlan(req);
  ctx.out.step(true, `Plan ${plan.plan_id} created (${plan.plan_status}).`);
  ctx.out.result(plan);
}

/** `cashfree subscriptions create --plan-id <id> --email a@b.com --phone 9999999999` */
export async function subscriptionsCreate(ctx: CommandContext, input: Input): Promise<void> {
  const planId = flagStr(input.values, "plan-id");
  const plan_details = planId
    ? { plan_id: planId }
    : {
        plan_name: flagStr(input.values, "plan-name") ?? "CLI Inline Plan",
        plan_type: "PERIODIC" as PlanType,
        plan_amount: requireNum(input.values, "amount"),
        plan_currency: "INR",
        plan_intervals: flagNum(input.values, "interval") ?? 1,
        plan_interval_type: (flagStr(input.values, "interval-type") ?? "MONTH").toUpperCase() as PlanIntervalType,
        plan_max_amount: flagNum(input.values, "max-amount"),
      };

  const req: CreateSubscriptionRequest = {
    subscription_id: flagStr(input.values, "subscription-id") ?? rid("sub"),
    customer_details: {
      customer_email: flagStr(input.values, "email") ?? "test@cashfree.com",
      customer_phone: flagStr(input.values, "phone") ?? "9999999999",
      customer_name: flagStr(input.values, "name"),
    },
    plan_details,
    authorization_details: { payment_methods: ["upi"] },
  };

  const sub = await ctx.getClient().createSubscription(req);
  ctx.out.step(true, `Subscription ${sub.subscription_id} created (${sub.subscription_status}).`);
  ctx.out.note("Authorize it with subscription_session_id in the Cashfree.js SDK to activate the mandate.");
  ctx.out.result(sub);
}

export async function subscriptionsGet(ctx: CommandContext, input: Input): Promise<void> {
  const subId = input.positionals[0] ?? flagStr(input.values, "subscription-id");
  if (!subId) throw CashfreeError.validation("Provide a subscription id (positional) or --subscription-id.");
  ctx.out.result(await ctx.getClient().getSubscription(subId));
}

export async function subscriptionsCancel(ctx: CommandContext, input: Input): Promise<void> {
  const subId = input.positionals[0] ?? flagStr(input.values, "subscription-id");
  if (!subId) throw CashfreeError.validation("Provide a subscription id (positional) or --subscription-id.");
  const sub = await ctx.getClient().cancelSubscription(subId);
  ctx.out.step(true, `Subscription ${subId} -> ${sub.subscription_status}.`);
  ctx.out.result(sub);
}

export async function subscriptionsPayments(ctx: CommandContext, input: Input): Promise<void> {
  const subId = input.positionals[0] ?? flagStr(input.values, "subscription-id");
  if (!subId) throw CashfreeError.validation("Provide a subscription id (positional) or --subscription-id.");
  ctx.out.result(await ctx.getClient().getSubscriptionPayments(subId));
}
