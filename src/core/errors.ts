import { ExitCode, type ExitCodeValue } from "./exit-codes.js";

/**
 * Structured, dual-consumer error.
 *
 * A human reads `message` + `suggestedFix`. An agent reads `code` (stable),
 * `exitCode` (branch on it), and `suggestedFix` (self-correct without a human).
 * This is the thing Stripe's CLI does not give you.
 */
export interface ErrorEnvelope {
  code: string;
  type: string;
  message: string;
  detail?: string;
  suggested_fix?: string;
  retry_after?: number;
  docs?: string;
}

export class CashfreeError extends Error {
  readonly code: string;
  readonly exitCode: ExitCodeValue;
  readonly detail?: string;
  readonly suggestedFix?: string;
  readonly retryAfter?: number;
  readonly docs?: string;

  constructor(opts: {
    code: string;
    message: string;
    exitCode: ExitCodeValue;
    detail?: string;
    suggestedFix?: string;
    retryAfter?: number;
    docs?: string;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = "CashfreeError";
    this.code = opts.code;
    this.exitCode = opts.exitCode;
    this.detail = opts.detail;
    this.suggestedFix = opts.suggestedFix;
    this.retryAfter = opts.retryAfter;
    this.docs = opts.docs;
  }

  toEnvelope(): ErrorEnvelope {
    return {
      code: this.code,
      type: `https://errors.cashfree.dev/${this.code}`,
      message: this.message,
      detail: this.detail,
      suggested_fix: this.suggestedFix,
      retry_after: this.retryAfter,
      docs: this.docs,
    };
  }

  // ---- common constructors, so call sites stay short and consistent ----

  static auth(message = "Not authenticated."): CashfreeError {
    return new CashfreeError({
      code: "auth_failed",
      message,
      exitCode: ExitCode.AUTH,
      suggestedFix: "Run `cashfree login --client-id <id> --client-secret <secret>`, or set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET. To try offline, add --mock.",
      docs: "https://www.cashfree.com/docs/api-reference/payments/authentication",
    });
  }

  static validation(message: string, suggestedFix?: string): CashfreeError {
    return new CashfreeError({
      code: "validation_error",
      message,
      exitCode: ExitCode.VALIDATION,
      suggestedFix,
    });
  }

  static notFound(resource: string, id: string): CashfreeError {
    return new CashfreeError({
      code: "not_found",
      message: `${resource} '${id}' was not found.`,
      exitCode: ExitCode.NOT_FOUND,
      suggestedFix: "Check the id and the mode. Sandbox and live data are separate; a live id will not resolve in sandbox.",
    });
  }

  static confirmationRequired(action: string): CashfreeError {
    return new CashfreeError({
      code: "confirmation_required",
      message: `Refusing to ${action} in LIVE mode without confirmation.`,
      exitCode: ExitCode.CONFIRMATION_REQUIRED,
      suggestedFix: "Re-run with --confirm (and an --idempotency-key) once you are sure. This guard exists so an agent or a script never moves real money by accident.",
    });
  }

  static network(detail: string): CashfreeError {
    return new CashfreeError({
      code: "network_error",
      message: "Could not reach the Cashfree API.",
      exitCode: ExitCode.NETWORK,
      detail,
      suggestedFix: "Check connectivity. If you are offline, add --mock to run against the built-in sandbox simulator.",
    });
  }
}

/** Coerce anything thrown into a CashfreeError so the top level always has an envelope. */
export function toCashfreeError(err: unknown): CashfreeError {
  if (err instanceof CashfreeError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new CashfreeError({
    code: "runtime_error",
    message,
    exitCode: ExitCode.RUNTIME,
    cause: err,
  });
}
