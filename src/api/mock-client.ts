import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ensureConfigDir, mockStatePath } from "../config/paths.js";
import { CashfreeError } from "../core/errors.js";
import { signWebhook } from "./webhook.js";
import type { CashfreeClient } from "./client.js";
import type {
  CreateOrderRequest,
  OrderEntity,
  PaymentEntity,
  OrderPayRequest,
  OrderPayResponse,
  SimulateRequest,
  CreateRefundRequest,
  RefundEntity,
  CreateLinkRequest,
  LinkEntity,
  SettlementEntity,
  CreateTransferRequest,
  TransferEntity,
  PanVerifyRequest,
  PanVerifyResponse,
  BankAccountVerifyRequest,
  BankAccountVerifyResponse,
  CreatePlanRequest,
  PlanEntity,
  CreateSubscriptionRequest,
  SubscriptionEntity,
  SubscriptionPaymentEntity,
  DisputeEntity,
  PayoutBalance,
  PaymentStatus,
  OrderStatus,
  WebhookEvent,
} from "./types.js";

/**
 * Offline sandbox simulator. It mirrors the real Cashfree sandbox closely
 * enough to drive the full verify loop with no credentials and no network:
 * orders move ACTIVE -> PAID, payments resolve by test VPA, and on a terminal
 * outcome it SIGNS and DELIVERS a webhook to any registered local listener.
 *
 * State is persisted so `cashfree listen` (one process) and `cashfree simulate`
 * (another) interact, exactly like the real thing.
 */

/** Fixed secret used to sign webhooks in mock mode (real mode uses client_secret). */
export const MOCK_WEBHOOK_SECRET = "mock_sandbox_webhook_secret";

interface Subscription {
  url: string;
}

interface MockState {
  seq: number;
  orders: Record<string, OrderEntity>;
  payments: Record<string, PaymentEntity & { order_id: string }>;
  refunds: Record<string, RefundEntity>;
  links: Record<string, LinkEntity>;
  transfers: Record<string, TransferEntity>;
  plans: Record<string, PlanEntity>;
  subs: Record<string, SubscriptionEntity>;
  subscriptions: Subscription[];
}

const EMPTY: MockState = {
  seq: 0,
  orders: {},
  payments: {},
  refunds: {},
  links: {},
  transfers: {},
  plans: {},
  subs: {},
  subscriptions: [],
};

function load(): MockState {
  const p = mockStatePath();
  if (!existsSync(p)) return structuredClone(EMPTY);
  try {
    return { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(p, "utf8")) };
  } catch {
    return structuredClone(EMPTY);
  }
}

function save(state: MockState): void {
  ensureConfigDir();
  writeFileSync(mockStatePath(), JSON.stringify(state, null, 2), { mode: 0o600 });
}

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** A listener (listen/verify) registers its local URL to receive webhooks. */
export function registerSubscription(url: string): void {
  const state = load();
  if (!state.subscriptions.some((s) => s.url === url)) {
    state.subscriptions.push({ url });
    save(state);
  }
}

export function unregisterSubscription(url: string): void {
  const state = load();
  state.subscriptions = state.subscriptions.filter((s) => s.url !== url);
  save(state);
}

export function resetMockState(): void {
  save(structuredClone(EMPTY));
}

/** Map the well-known sandbox test VPAs to outcomes. */
function outcomeForVpa(vpa: string | undefined): PaymentStatus | undefined {
  switch (vpa) {
    case "testsuccess@gocash":
      return "SUCCESS";
    case "testfailure@gocash":
      return "FAILED";
    case "testinvalid@gocash":
      return undefined; // handled as a validation error by the caller
    default:
      return undefined;
  }
}

async function deliverWebhook(state: MockState, event: WebhookEvent): Promise<void> {
  if (state.subscriptions.length === 0) return;
  const rawBody = JSON.stringify(event);
  const timestamp = String(Date.now());
  const signature = signWebhook(MOCK_WEBHOOK_SECRET, timestamp, rawBody);
  await Promise.allSettled(
    state.subscriptions.map((sub) =>
      fetch(sub.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-signature": signature,
          "x-webhook-timestamp": timestamp,
        },
        body: rawBody,
      }).catch(() => undefined),
    ),
  );
}

function paymentWebhook(payment: PaymentEntity, orderStatus: OrderStatus): WebhookEvent {
  const type =
    payment.payment_status === "SUCCESS"
      ? "PAYMENT_SUCCESS_WEBHOOK"
      : payment.payment_status === "FAILED"
        ? "PAYMENT_FAILED_WEBHOOK"
        : "PAYMENT_USER_DROPPED_WEBHOOK";
  return {
    type,
    event_time: nowIso(),
    data: {
      order: {
        order_id: payment.order_id,
        order_amount: payment.payment_amount,
        order_currency: payment.payment_currency,
        order_status: orderStatus,
      },
      payment: {
        cf_payment_id: payment.cf_payment_id,
        payment_status: payment.payment_status,
        payment_amount: payment.payment_amount,
        payment_currency: payment.payment_currency,
        payment_method: payment.payment_method,
      },
    },
  };
}

/** Resolve a payment to a terminal status, flip the order, deliver the webhook. */
async function resolvePayment(
  state: MockState,
  cfPaymentId: string,
  status: PaymentStatus,
): Promise<void> {
  const payment = state.payments[cfPaymentId];
  if (!payment) return;
  payment.payment_status = status;
  payment.payment_time = nowIso();
  const order = state.orders[payment.order_id];
  let orderStatus: OrderStatus = order?.order_status ?? "ACTIVE";
  if (order && status === "SUCCESS") {
    order.order_status = "PAID";
    orderStatus = "PAID";
  }
  save(state);
  await deliverWebhook(state, paymentWebhook(payment, orderStatus));
}

export class MockClient implements CashfreeClient {
  async createOrder(req: CreateOrderRequest): Promise<OrderEntity> {
    if (!req.order_amount || req.order_amount < 1) {
      throw CashfreeError.validation("order_amount must be >= 1.", "Pass --amount with a positive value.");
    }
    const state = load();
    const orderId = req.order_id ?? id("order");
    const order: OrderEntity = {
      cf_order_id: id("MOCK"),
      order_id: orderId,
      entity: "order",
      order_amount: req.order_amount,
      order_currency: req.order_currency ?? "INR",
      order_status: "ACTIVE",
      payment_session_id: `session_${randomBytes(12).toString("hex")}`,
      created_at: nowIso(),
      customer_details: req.customer_details,
      order_meta: req.order_meta,
    };
    state.orders[orderId] = order;
    save(state);
    return order;
  }

  async getOrder(orderId: string): Promise<OrderEntity> {
    const order = load().orders[orderId];
    if (!order) throw CashfreeError.notFound("Order", orderId);
    return order;
  }

  async getPayments(orderId: string): Promise<PaymentEntity[]> {
    const state = load();
    if (!state.orders[orderId]) throw CashfreeError.notFound("Order", orderId);
    return Object.values(state.payments).filter((p) => p.order_id === orderId);
  }

  async orderPay(req: OrderPayRequest): Promise<OrderPayResponse> {
    const state = load();
    const order = Object.values(state.orders).find(
      (o) => o.payment_session_id === req.payment_session_id,
    );
    if (!order) {
      throw CashfreeError.validation(
        "Unknown payment_session_id.",
        "Create an order first; use its payment_session_id.",
      );
    }
    const vpa = req.payment_method.upi.upi_id;
    if (vpa === "testinvalid@gocash") {
      throw CashfreeError.validation(`Invalid VPA '${vpa}'.`, "Use testsuccess@gocash or testfailure@gocash in sandbox.");
    }
    const cfPaymentId = id("MOCK_pay");
    const payment: PaymentEntity & { order_id: string } = {
      cf_payment_id: cfPaymentId,
      order_id: order.order_id,
      entity: "payment",
      payment_status: "PENDING",
      payment_amount: order.order_amount,
      payment_currency: order.order_currency,
      payment_method: "upi",
      payment_group: "upi",
    };
    state.payments[cfPaymentId] = payment;
    save(state);

    // Known test VPA resolves immediately and emits a webhook, like the sandbox.
    const outcome = outcomeForVpa(vpa);
    if (outcome) {
      await resolvePayment(load(), cfPaymentId, outcome);
    }

    return {
      action: "custom",
      cf_payment_id: cfPaymentId,
      payment_method: "upi",
      channel: req.payment_method.upi.channel,
    };
  }

  async simulate(req: SimulateRequest): Promise<{ status: string }> {
    const state = load();
    if (!state.payments[req.entity_id]) {
      throw CashfreeError.notFound("Payment", req.entity_id);
    }
    await resolvePayment(state, req.entity_id, req.entity_simulation.payment_status);
    return { status: "OK" };
  }

  async createRefund(orderId: string, req: CreateRefundRequest): Promise<RefundEntity> {
    const state = load();
    const order = state.orders[orderId];
    if (!order) throw CashfreeError.notFound("Order", orderId);
    if (order.order_status !== "PAID") {
      throw CashfreeError.validation(
        `Order '${orderId}' is ${order.order_status}, only PAID orders can be refunded.`,
      );
    }
    const refund: RefundEntity = {
      cf_refund_id: id("MOCK_rfnd"),
      order_id: orderId,
      refund_id: req.refund_id,
      entity: "refund",
      refund_amount: req.refund_amount,
      refund_currency: order.order_currency,
      refund_status: "SUCCESS",
      refund_note: req.refund_note,
      created_at: nowIso(),
    };
    state.refunds[`${orderId}:${req.refund_id}`] = refund;
    save(state);
    return refund;
  }

  async getRefund(orderId: string, refundId: string): Promise<RefundEntity> {
    const refund = load().refunds[`${orderId}:${refundId}`];
    if (!refund) throw CashfreeError.notFound("Refund", refundId);
    return refund;
  }

  async createLink(req: CreateLinkRequest): Promise<LinkEntity> {
    const state = load();
    const link: LinkEntity = {
      cf_link_id: id("MOCK_link"),
      link_id: req.link_id,
      link_status: "ACTIVE",
      link_amount: req.link_amount,
      link_amount_paid: 0,
      link_currency: req.link_currency,
      link_purpose: req.link_purpose,
      link_url: `https://payments-test.cashfree.com/links/${req.link_id}`,
      customer_details: req.customer_details,
      link_created_at: nowIso(),
    };
    state.links[req.link_id] = link;
    save(state);
    return link;
  }

  async getLink(linkId: string): Promise<LinkEntity> {
    const link = load().links[linkId];
    if (!link) throw CashfreeError.notFound("Payment link", linkId);
    return link;
  }

  async getSettlements(orderId: string): Promise<SettlementEntity[]> {
    const state = load();
    const order = state.orders[orderId];
    if (!order) throw CashfreeError.notFound("Order", orderId);
    if (order.order_status !== "PAID") return [];
    return [
      {
        cf_settlement_id: id("MOCK_setl"),
        order_id: orderId,
        settlement_amount: order.order_amount,
        settlement_currency: order.order_currency,
        payment_time: nowIso(),
        transfer_utr: id("UTR"),
      },
    ];
  }

  async getRecentSettlements(): Promise<SettlementEntity[]> {
    // Derive a "today" view from paid orders in the mock state.
    const state = load();
    return Object.values(state.orders)
      .filter((o) => o.order_status === "PAID")
      .map((o) => ({
        cf_settlement_id: id("MOCK_setl"),
        order_id: o.order_id,
        settlement_amount: Math.round(o.order_amount * 0.98 * 100) / 100,
        settlement_currency: o.order_currency,
        settlement_service_charge: Math.round(o.order_amount * 0.02 * 100) / 100,
        settlement_status: "SETTLED",
      }));
  }

  async getDisputesByOrder(orderId: string): Promise<DisputeEntity[]> {
    return [
      {
        dispute_id: "MOCK_dispute_1",
        order_id: orderId,
        dispute_amount: 500,
        dispute_status: "DISPUTE_CREATED",
        reason_description: "Product not received",
        respond_by: "2026-07-01",
      },
    ];
  }

  async getDispute(disputeId: string): Promise<DisputeEntity> {
    return {
      dispute_id: disputeId,
      order_id: "order_mock_paid",
      dispute_amount: 500,
      dispute_status: "DISPUTE_CREATED",
      reason_description: "Product not received",
      respond_by: "2026-07-01",
    };
  }

  async getPayoutBalance(): Promise<PayoutBalance> {
    return { availableBalance: 100000 };
  }

  async createTransfer(req: CreateTransferRequest): Promise<TransferEntity> {
    if (!req.transfer_amount || req.transfer_amount < 1) {
      throw CashfreeError.validation("transfer_amount must be >= 1.");
    }
    const state = load();
    const transfer: TransferEntity = {
      cf_transfer_id: id("MOCK_txn"),
      transfer_id: req.transfer_id,
      status: "SUCCESS",
      transfer_utr: id("UTR"),
      added_on: nowIso(),
    };
    state.transfers[req.transfer_id] = transfer;
    save(state);
    return transfer;
  }

  async getTransfer(transferId: string): Promise<TransferEntity> {
    const transfer = load().transfers[transferId];
    if (!transfer) throw CashfreeError.notFound("Transfer", transferId);
    return transfer;
  }

  async verifyPan(req: PanVerifyRequest): Promise<PanVerifyResponse> {
    const valid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(req.pan);
    return {
      reference_id: Math.floor(Math.random() * 1e6),
      verification_id: req.verification_id,
      pan: req.pan,
      name: req.name,
      name_match: valid ? "Y" : "N",
      dob_match: valid ? "Y" : "N",
      status: valid ? "VALID" : "INVALID",
    };
  }

  async verifyBankAccount(req: BankAccountVerifyRequest): Promise<BankAccountVerifyResponse> {
    const valid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(req.ifsc);
    return {
      reference_id: Math.floor(Math.random() * 1e6),
      name_at_bank: req.name ?? "TEST ACCOUNT HOLDER",
      bank_name: "TEST BANK",
      name_match_result: valid ? "DIRECT_MATCH" : "NO_MATCH",
      account_status: valid ? "VALID" : "INVALID",
      account_status_code: valid ? "ACCOUNT_IS_VALID" : "INVALID_IFSC_FAIL",
    };
  }

  async createPlan(req: CreatePlanRequest): Promise<PlanEntity> {
    const state = load();
    const plan: PlanEntity = {
      plan_id: req.plan_id,
      plan_name: req.plan_name,
      plan_type: req.plan_type,
      plan_currency: req.plan_currency ?? "INR",
      plan_recurring_amount: req.plan_recurring_amount,
      plan_max_amount: req.plan_max_amount,
      plan_status: "ACTIVE",
    };
    state.plans[req.plan_id] = plan;
    save(state);
    return plan;
  }

  async getPlan(planId: string): Promise<PlanEntity> {
    const plan = load().plans[planId];
    if (!plan) throw CashfreeError.notFound("Plan", planId);
    return plan;
  }

  async createSubscription(req: CreateSubscriptionRequest): Promise<SubscriptionEntity> {
    const state = load();
    const sub: SubscriptionEntity = {
      cf_subscription_id: id("MOCK_sub"),
      subscription_id: req.subscription_id,
      subscription_status: "INITIALIZED",
      subscription_session_id: `subs_session_${randomBytes(10).toString("hex")}`,
      customer_details: req.customer_details,
      next_schedule_date: null,
    };
    state.subs[req.subscription_id] = sub;
    save(state);
    return sub;
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionEntity> {
    const sub = load().subs[subscriptionId];
    if (!sub) throw CashfreeError.notFound("Subscription", subscriptionId);
    return sub;
  }

  async cancelSubscription(subscriptionId: string): Promise<SubscriptionEntity> {
    const state = load();
    const sub = state.subs[subscriptionId];
    if (!sub) throw CashfreeError.notFound("Subscription", subscriptionId);
    sub.subscription_status = "CANCELLED";
    save(state);
    return sub;
  }

  async getSubscriptionPayments(subscriptionId: string): Promise<SubscriptionPaymentEntity[]> {
    if (!load().subs[subscriptionId]) throw CashfreeError.notFound("Subscription", subscriptionId);
    return [];
  }

  async ping(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: "mock sandbox (offline)" };
  }
}
