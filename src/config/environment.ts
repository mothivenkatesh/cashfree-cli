/**
 * Environments and base URLs. Verified against Cashfree public OpenAPI specs
 * (sandbox.cashfree.com vs api.cashfree.com, product path prefixes).
 */
export type Mode = "sandbox" | "live";

/** Current date-versioned API value. PG openapi info.version = 2025-01-01. */
export const API_VERSION = "2025-01-01";

interface Hosts {
  pg: string;
  payout: string;
  verification: string;
}

const HOSTS: Record<Mode, Hosts> = {
  sandbox: {
    pg: "https://sandbox.cashfree.com/pg",
    payout: "https://sandbox.cashfree.com/payout",
    verification: "https://sandbox.cashfree.com/verification",
  },
  live: {
    pg: "https://api.cashfree.com/pg",
    payout: "https://api.cashfree.com/payout",
    verification: "https://api.cashfree.com/verification",
  },
};

export function baseUrl(mode: Mode, product: keyof Hosts): string {
  return HOSTS[mode][product];
}
