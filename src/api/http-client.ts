import { randomUUID } from "node:crypto";
import { API_VERSION, baseUrl, type Mode } from "../config/environment.js";
import { CashfreeError } from "../core/errors.js";
import { ExitCode } from "../core/exit-codes.js";
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
} from "./types.js";

export interface Credentials {
  clientId: string;
  clientSecret: string;
}

type Product = "pg" | "payout" | "verification";

/**
 * Real Cashfree client. One generic request() carries the auth headers,
 * x-api-version, and idempotency, and maps HTTP status to our semantic errors
 * so an agent can branch on exitCode without scraping the body.
 */
export class HttpClient implements CashfreeClient {
  constructor(
    private readonly mode: Mode,
    private readonly creds: Credentials,
    private readonly idempotencyKey?: string,
  ) {}

  private async request<T>(
    product: Product,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${baseUrl(this.mode, product)}${path}`;
    const headers: Record<string, string> = {
      "x-client-id": this.creds.clientId,
      "x-client-secret": this.creds.clientSecret,
      "x-api-version": API_VERSION,
      "x-request-id": randomUUID(),
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.idempotencyKey && method !== "GET") {
      headers["x-idempotency-key"] = this.idempotencyKey;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw CashfreeError.network(err instanceof Error ? err.message : String(err));
    }

    const text = await res.text();
    const payload = text ? safeJson(text) : undefined;

    if (!res.ok) throw mapHttpError(res, payload, path);
    return payload as T;
  }

  createOrder(req: CreateOrderRequest) {
    return this.request<OrderEntity>("pg", "POST", "/orders", req);
  }
  getOrder(orderId: string) {
    return this.request<OrderEntity>("pg", "GET", `/orders/${encodeURIComponent(orderId)}`);
  }
  getPayments(orderId: string) {
    return this.request<PaymentEntity[]>("pg", "GET", `/orders/${encodeURIComponent(orderId)}/payments`);
  }
  orderPay(req: OrderPayRequest) {
    return this.request<OrderPayResponse>("pg", "POST", "/orders/sessions", req);
  }
  simulate(req: SimulateRequest) {
    return this.request<{ status: string }>("pg", "POST", "/simulate", req);
  }
  createRefund(orderId: string, req: CreateRefundRequest) {
    return this.request<RefundEntity>("pg", "POST", `/orders/${encodeURIComponent(orderId)}/refunds`, req);
  }
  getRefund(orderId: string, refundId: string) {
    return this.request<RefundEntity>(
      "pg",
      "GET",
      `/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`,
    );
  }
  createLink(req: CreateLinkRequest) {
    return this.request<LinkEntity>("pg", "POST", "/links", req);
  }
  getLink(linkId: string) {
    return this.request<LinkEntity>("pg", "GET", `/links/${encodeURIComponent(linkId)}`);
  }
  getSettlements(orderId: string) {
    return this.request<SettlementEntity[]>(
      "pg",
      "GET",
      `/orders/${encodeURIComponent(orderId)}/settlements`,
    );
  }
  async getRecentSettlements(): Promise<SettlementEntity[]> {
    // Account-level settlements = POST /settlements with a date filter (today).
    const now = new Date();
    const day = (h: number, m: number, s: number) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, s)).toISOString();
    const r = await this.request<unknown>("pg", "POST", "/settlements", {
      pagination: { limit: 100, cursor: null },
      filters: { start_date: day(0, 0, 0), end_date: day(23, 59, 59) },
    });
    return normalizeList<SettlementEntity>(r);
  }
  async getDisputesByOrder(orderId: string): Promise<DisputeEntity[]> {
    // No list-all-disputes endpoint exists; disputes are fetched per order.
    const r = await this.request<unknown>("pg", "GET", `/orders/${encodeURIComponent(orderId)}/disputes`);
    return normalizeList<DisputeEntity>(r);
  }
  getDispute(disputeId: string) {
    return this.request<DisputeEntity>("pg", "GET", `/disputes/${encodeURIComponent(disputeId)}`);
  }
  createTransfer(req: CreateTransferRequest) {
    return this.request<TransferEntity>("payout", "POST", "/transfers", req);
  }
  getTransfer(transferId: string) {
    return this.request<TransferEntity>(
      "payout",
      "GET",
      `/transfers?transfer_id=${encodeURIComponent(transferId)}`,
    );
  }
  async getPayoutBalance(): Promise<PayoutBalance> {
    // Payouts use a separate host + a two-step bearer-token flow (authorize -> getBalance).
    const host = this.mode === "live" ? "https://payout-api.cashfree.com" : "https://payout-gamma.cashfree.com";
    let token: string;
    try {
      const a = await fetch(`${host}/payout/v1/authorize`, {
        method: "POST",
        headers: { "X-Client-Id": this.creds.clientId, "X-Client-Secret": this.creds.clientSecret },
      });
      const aj = (await a.text().then((t) => (t ? JSON.parse(t) : {}))) as { data?: { token?: string }; message?: string };
      if (!a.ok || !aj?.data?.token) {
        throw CashfreeError.auth(`Payout authorize failed: ${aj?.message ?? a.status}. Payouts needs IP whitelisting + valid payout keys.`);
      }
      token = aj.data.token;
    } catch (err) {
      if (err instanceof CashfreeError) throw err;
      throw CashfreeError.network(err instanceof Error ? err.message : String(err));
    }
    const b = await fetch(`${host}/payout/v1/getBalance`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await b.text();
    const bj = text ? JSON.parse(text) : {};
    if (!b.ok) {
      throw new CashfreeError({ code: "api_error", message: `Payout balance error (${b.status}).`, exitCode: ExitCode.API, detail: text });
    }
    return (bj?.data ?? bj) as PayoutBalance;
  }
  verifyPan(req: PanVerifyRequest) {
    return this.request<PanVerifyResponse>("verification", "POST", "/pan-lite", req);
  }
  verifyBankAccount(req: BankAccountVerifyRequest) {
    return this.request<BankAccountVerifyResponse>("verification", "POST", "/bank-account/sync", req);
  }

  createPlan(req: CreatePlanRequest) {
    return this.request<PlanEntity>("pg", "POST", "/plans", req);
  }
  getPlan(planId: string) {
    return this.request<PlanEntity>("pg", "GET", `/plans/${encodeURIComponent(planId)}`);
  }
  createSubscription(req: CreateSubscriptionRequest) {
    return this.request<SubscriptionEntity>("pg", "POST", "/subscriptions", req);
  }
  getSubscription(id: string) {
    return this.request<SubscriptionEntity>("pg", "GET", `/subscriptions/${encodeURIComponent(id)}`);
  }
  cancelSubscription(id: string) {
    return this.request<SubscriptionEntity>("pg", "POST", `/subscriptions/${encodeURIComponent(id)}/manage`, {
      action: "CANCEL",
    });
  }
  getSubscriptionPayments(id: string) {
    return this.request<SubscriptionPaymentEntity[]>("pg", "GET", `/subscriptions/${encodeURIComponent(id)}/payments`);
  }

  async ping() {
    try {
      // A cheap authenticated GET; 404 still proves auth + reachability.
      await this.request("pg", "GET", "/orders/__cashfree_cli_ping__");
      return { ok: true, detail: `reachable (${this.mode})` };
    } catch (err) {
      if (err instanceof CashfreeError && err.exitCode === ExitCode.NOT_FOUND) {
        return { ok: true, detail: `reachable, auth OK (${this.mode})` };
      }
      if (err instanceof CashfreeError && err.exitCode === ExitCode.AUTH) {
        return { ok: false, detail: "credentials rejected" };
      }
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Cashfree list endpoints sometimes wrap the array as {items} or {data}. */
function normalizeList<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  const obj = r as { items?: T[]; data?: T[] } | null;
  return obj?.items ?? obj?.data ?? [];
}

function mapHttpError(res: Response, payload: unknown, path: string): CashfreeError {
  const apiMessage =
    (payload as { message?: string } | undefined)?.message ??
    (payload as { error_description?: string } | undefined)?.error_description ??
    res.statusText;

  switch (res.status) {
    case 401:
    case 403:
      return CashfreeError.auth(`Cashfree rejected the credentials (${res.status}).`);
    case 404:
      return new CashfreeError({
        code: "not_found",
        message: `Not found: ${path}`,
        exitCode: ExitCode.NOT_FOUND,
        detail: apiMessage,
      });
    case 409:
      return CashfreeError.validation(`Conflict: ${apiMessage}`, "If this was a retry, reuse the same --idempotency-key.");
    case 422:
      return CashfreeError.validation(apiMessage);
    case 429: {
      const retry = Number(res.headers.get("x-ratelimit-retry") ?? res.headers.get("retry-after"));
      return new CashfreeError({
        code: "rate_limited",
        message: "Rate limited by Cashfree.",
        exitCode: ExitCode.RATE_LIMIT,
        retryAfter: Number.isFinite(retry) ? retry : undefined,
        suggestedFix: "Back off and retry after retry_after seconds.",
      });
    }
    default:
      if (res.status >= 500) {
        return new CashfreeError({
          code: "api_unavailable",
          message: `Cashfree API error (${res.status}).`,
          exitCode: ExitCode.API,
          detail: apiMessage,
          suggestedFix: "Transient server error. Safe to retry an idempotent call.",
        });
      }
      return new CashfreeError({
        code: "api_error",
        message: `Cashfree API error (${res.status}): ${apiMessage}`,
        exitCode: ExitCode.API,
        detail: typeof payload === "string" ? payload : JSON.stringify(payload),
      });
  }
}
