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
} from "./types.js";

/**
 * The capability surface. The CLI commands and the MCP server both program
 * against this interface, so a real HTTP client and the offline mock are
 * interchangeable. One interface, two consumers, two implementations.
 */
export interface CashfreeClient {
  // Payment Gateway
  createOrder(req: CreateOrderRequest): Promise<OrderEntity>;
  getOrder(orderId: string): Promise<OrderEntity>;
  getPayments(orderId: string): Promise<PaymentEntity[]>;
  orderPay(req: OrderPayRequest): Promise<OrderPayResponse>;
  simulate(req: SimulateRequest): Promise<{ status: string }>;

  // Refunds
  createRefund(orderId: string, req: CreateRefundRequest): Promise<RefundEntity>;
  getRefund(orderId: string, refundId: string): Promise<RefundEntity>;

  // Payment Links
  createLink(req: CreateLinkRequest): Promise<LinkEntity>;
  getLink(linkId: string): Promise<LinkEntity>;

  // Settlements
  getSettlements(orderId: string): Promise<SettlementEntity[]>;

  // Payouts
  createTransfer(req: CreateTransferRequest): Promise<TransferEntity>;
  getTransfer(transferId: string): Promise<TransferEntity>;

  // Secure ID
  verifyPan(req: PanVerifyRequest): Promise<PanVerifyResponse>;
  verifyBankAccount(req: BankAccountVerifyRequest): Promise<BankAccountVerifyResponse>;

  // Subscriptions
  createPlan(req: CreatePlanRequest): Promise<PlanEntity>;
  getPlan(planId: string): Promise<PlanEntity>;
  createSubscription(req: CreateSubscriptionRequest): Promise<SubscriptionEntity>;
  getSubscription(subscriptionId: string): Promise<SubscriptionEntity>;
  cancelSubscription(subscriptionId: string): Promise<SubscriptionEntity>;
  getSubscriptionPayments(subscriptionId: string): Promise<SubscriptionPaymentEntity[]>;

  /** Lightweight reachability check for `doctor`. */
  ping(): Promise<{ ok: boolean; detail: string }>;
}
