/**
 * Types grounded in Cashfree's public OpenAPI specs and SDKs. Field names match
 * the wire format exactly (snake_case), so `verify` checks the real status enum,
 * not an invented one.
 */

export type OrderStatus =
  | "ACTIVE"
  | "PAID"
  | "EXPIRED"
  | "TERMINATED"
  | "TERMINATION_REQUESTED";

export type PaymentStatus =
  | "SUCCESS"
  | "FAILED"
  | "PENDING"
  | "NOT_ATTEMPTED"
  | "USER_DROPPED"
  | "FLAGGED"
  | "CANCELLED"
  | "VOID";

export interface CustomerDetails {
  customer_id: string;
  customer_phone: string;
  customer_email?: string;
  customer_name?: string;
}

export interface OrderMeta {
  return_url?: string;
  notify_url?: string;
  payment_methods?: string;
}

export interface CreateOrderRequest {
  order_amount: number;
  order_currency?: string;
  customer_details: CustomerDetails;
  order_id?: string;
  order_note?: string;
  order_expiry_time?: string;
  order_meta?: OrderMeta;
}

export interface OrderEntity {
  cf_order_id: string;
  order_id: string;
  entity: "order";
  order_currency: string;
  order_amount: number;
  order_status: OrderStatus;
  payment_session_id: string;
  order_expiry_time?: string;
  created_at: string;
  customer_details: CustomerDetails;
  order_meta?: OrderMeta;
}

export interface PaymentEntity {
  cf_payment_id: string;
  order_id: string;
  entity: "payment";
  payment_status: PaymentStatus;
  payment_amount: number;
  payment_currency: string;
  payment_method?: string;
  payment_group?: string;
  payment_message?: string;
  payment_time?: string;
  bank_reference?: string;
}

/** One UPI channel of the Order Pay request (the one we drive in sandbox). */
export interface OrderPayRequest {
  payment_session_id: string;
  payment_method: {
    upi: {
      channel: "collect" | "link" | "qrcode";
      upi_id?: string;
    };
  };
}

export interface OrderPayResponse {
  action: string;
  cf_payment_id: string;
  payment_method: string;
  channel?: string;
  data?: Record<string, unknown>;
}

export interface SimulateRequest {
  entity: "PAYMENTS" | "SUBS_PAYMENTS";
  entity_id: string; // cf_payment_id for PAYMENTS
  entity_simulation: {
    payment_status: "SUCCESS" | "FAILED" | "PENDING" | "USER_DROPPED";
    payment_error_code?: string;
  };
}

export interface CreateRefundRequest {
  refund_amount: number;
  refund_id: string;
  refund_note?: string;
}

export type RefundStatus = "PENDING" | "SUCCESS" | "CANCELLED" | "ONHOLD";

export interface RefundEntity {
  cf_refund_id: string;
  order_id: string;
  refund_id: string;
  entity: "refund";
  refund_amount: number;
  refund_currency: string;
  refund_status: RefundStatus;
  refund_note?: string;
  created_at: string;
}

export interface CreateLinkRequest {
  link_id: string;
  link_amount: number;
  link_currency: string;
  link_purpose: string;
  customer_details: CustomerDetails;
}

export interface LinkEntity {
  cf_link_id: string;
  link_id: string;
  link_status: string;
  link_amount: number;
  link_amount_paid: number;
  link_currency: string;
  link_purpose: string;
  link_url: string;
  customer_details: CustomerDetails;
  link_created_at: string;
}

export interface SettlementEntity {
  cf_settlement_id: string;
  order_id: string;
  settlement_amount: number;
  settlement_currency: string;
  payment_time?: string;
  transfer_utr?: string;
}

// ---- Payouts ----

export type TransferMode = "banktransfer" | "imps" | "neft" | "rtgs" | "upi";

export interface CreateTransferRequest {
  transfer_id: string;
  transfer_amount: number;
  transfer_mode?: TransferMode;
  beneficiary_details: {
    beneficiary_id?: string;
    bank_account_number?: string;
    bank_ifsc?: string;
    vpa?: string;
  };
  remarks?: string;
}

export type TransferStatus =
  | "SUCCESS"
  | "PENDING"
  | "FAILED"
  | "REVERSED"
  | "REJECTED"
  | "QUEUED"
  | "RECEIVED";

export interface TransferEntity {
  cf_transfer_id: string;
  transfer_id: string;
  status: TransferStatus;
  transfer_utr?: string;
  added_on?: string;
}

// ---- Secure ID / Verification ----

export interface PanVerifyRequest {
  verification_id: string;
  pan: string;
  name: string;
  dob: string;
}

export interface PanVerifyResponse {
  reference_id: number;
  verification_id: string;
  pan: string;
  name: string;
  name_match: "Y" | "N";
  dob_match: "Y" | "N";
  status: "VALID" | "INVALID";
}

export interface BankAccountVerifyRequest {
  bank_account: string;
  ifsc: string;
  name?: string;
  phone?: string;
}

export interface BankAccountVerifyResponse {
  reference_id: number;
  name_at_bank: string;
  bank_name: string;
  name_match_result?: string;
  account_status: "VALID" | "INVALID";
  account_status_code?: string;
}

/** Cashfree PG webhook payload (the shape we emit and verify). */
export interface WebhookEvent {
  type: string;
  event_time: string;
  data: {
    order?: Pick<OrderEntity, "order_id" | "order_amount" | "order_currency"> & {
      order_status?: OrderStatus;
    };
    payment?: Pick<
      PaymentEntity,
      "cf_payment_id" | "payment_status" | "payment_amount" | "payment_currency" | "payment_method"
    >;
  };
}

// ---- Subscriptions (under the PG base, same auth + x-api-version) ----

export type PlanType = "PERIODIC" | "ON_DEMAND";
export type PlanIntervalType = "DAY" | "WEEK" | "MONTH" | "YEAR";

export type SubscriptionStatus =
  | "INITIALIZED"
  | "BANK_APPROVAL_PENDING"
  | "ACTIVE"
  | "ON_HOLD"
  | "PAUSED"
  | "CANCELLED"
  | "COMPLETED"
  | "EXPIRED"
  | "FAILED";

export interface CreatePlanRequest {
  plan_id: string;
  plan_name: string;
  plan_type: PlanType;
  plan_currency?: string;
  plan_recurring_amount?: number; // note: /plans uses plan_recurring_amount
  plan_max_amount?: number;
  plan_intervals?: number;
  plan_interval_type?: PlanIntervalType;
  plan_note?: string;
}

export interface PlanEntity {
  plan_id: string;
  plan_name: string;
  plan_type: PlanType;
  plan_currency: string;
  plan_recurring_amount?: number;
  plan_max_amount?: number;
  plan_status: string;
}

export interface CreateSubscriptionRequest {
  subscription_id: string;
  customer_details: {
    customer_email: string;
    customer_phone: string;
    customer_name?: string;
  };
  plan_details: {
    plan_id?: string;
    plan_name?: string;
    plan_type?: PlanType;
    plan_amount?: number; // note: inline plan uses plan_amount (not plan_recurring_amount)
    plan_currency?: string;
    plan_intervals?: number;
    plan_interval_type?: PlanIntervalType;
    plan_max_amount?: number;
  };
  authorization_details?: { payment_methods?: string[]; authorization_amount?: number };
  subscription_meta?: { return_url?: string };
}

export interface SubscriptionEntity {
  cf_subscription_id: string;
  subscription_id: string;
  subscription_status: SubscriptionStatus;
  subscription_session_id?: string;
  customer_details?: { customer_email: string; customer_phone: string; customer_name?: string };
  next_schedule_date?: string | null;
}

export interface SubscriptionPaymentEntity {
  cf_payment_id: string;
  payment_id: string;
  subscription_id: string;
  payment_amount: number;
  payment_status: string;
  payment_type: "AUTH" | "CHARGE";
}
