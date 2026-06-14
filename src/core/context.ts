import type { Mode } from "../config/environment.js";
import { OutputWriter, type OutputFormat } from "./output.js";
import { CashfreeError } from "./errors.js";
import { getCredentials } from "../config/store.js";
import { HttpClient } from "../api/http-client.js";
import { MockClient } from "../api/mock-client.js";
import type { CashfreeClient } from "../api/client.js";

export interface GlobalFlags {
  json: boolean;
  output: OutputFormat;
  color: boolean;
  live: boolean;
  mock: boolean;
  profile: string;
  confirm: boolean;
  idempotencyKey?: string;
}

/**
 * Per-invocation context. Owns the output writer, the resolved mode, and the
 * lazily-built client. Centralizes the two safety rules every command inherits:
 * sandbox is the default, and live money-movement needs an explicit confirm.
 */
export class CommandContext {
  readonly out: OutputWriter;
  readonly mode: Mode;
  readonly mock: boolean;
  readonly profile: string;
  readonly confirm: boolean;
  readonly idempotencyKey?: string;
  private client?: CashfreeClient;

  constructor(flags: GlobalFlags) {
    this.out = new OutputWriter({
      format: flags.json ? "json" : flags.output,
      color: flags.color,
    });
    this.mode = flags.live ? "live" : "sandbox"; // G5: sandbox by default
    this.mock = flags.mock || process.env.CASHFREE_MOCK === "1";
    this.profile = flags.profile;
    this.confirm = flags.confirm;
    this.idempotencyKey = flags.idempotencyKey;
  }

  getClient(): CashfreeClient {
    if (this.client) return this.client;
    if (this.mock) {
      if (this.mode === "live") {
        throw CashfreeError.validation("--mock cannot be combined with --live.", "Drop one of them.");
      }
      this.client = new MockClient();
      return this.client;
    }
    const creds = getCredentials(this.profile, this.mode);
    if (!creds) throw CashfreeError.auth(`No ${this.mode} credentials for profile '${this.profile}'.`);
    this.client = new HttpClient(this.mode, creds, this.idempotencyKey);
    return this.client;
  }

  /** G2: refuse live money movement unless the caller explicitly confirmed. */
  guardLiveMoney(action: string): void {
    if (this.mode === "live" && !this.confirm) {
      throw CashfreeError.confirmationRequired(action);
    }
  }

  isLive(): boolean {
    return this.mode === "live";
  }
}
