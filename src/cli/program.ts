import { parseArgs } from "node:util";
import { CommandContext, type GlobalFlags } from "../core/context.js";
import { toCashfreeError, CashfreeError } from "../core/errors.js";
import type { OutputFormat } from "../core/output.js";
import type { Input } from "../commands/_args.js";
import { login, logout, whoami } from "../commands/auth.js";
import {
  ordersCreate,
  ordersGet,
  paymentsList,
  refundsCreate,
  refundsGet,
  linksCreate,
  linksGet,
  settlementsGet,
  settlementsToday,
} from "../commands/resources.js";
import { simulatePayment } from "../commands/simulate.js";
import { payoutsTransfer, payoutsGet, payoutsBalance } from "../commands/payouts.js";
import { disputesByOrder, disputesGet } from "../commands/disputes.js";
import { secureidPan, secureidBankAccount } from "../commands/secureid.js";
import {
  subscriptionsCreatePlan,
  subscriptionsCreate,
  subscriptionsGet,
  subscriptionsCancel,
  subscriptionsPayments,
} from "../commands/subscriptions.js";
import { verify } from "../commands/verify.js";
import { listen } from "../commands/listen.js";
import { init } from "../commands/init.js";
import { doctor } from "../commands/doctor.js";
import { serveMcp } from "../mcp/server.js";

export const VERSION = "0.1.0";

type Handler = (ctx: CommandContext, input: Input) => Promise<void>;

const ROUTES: Record<string, Handler> = {
  login,
  logout,
  whoami,
  "orders create": ordersCreate,
  "orders get": ordersGet,
  "payments list": paymentsList,
  "refunds create": refundsCreate,
  "refunds get": refundsGet,
  "links create": linksCreate,
  "links get": linksGet,
  "settlements get": settlementsGet,
  "settlements today": settlementsToday,
  "disputes order": disputesByOrder,
  "disputes get": disputesGet,
  "simulate payment": simulatePayment,
  "payouts transfer": payoutsTransfer,
  "payouts get": payoutsGet,
  "payouts balance": payoutsBalance,
  "secureid pan": secureidPan,
  "secureid bank-account": secureidBankAccount,
  "subscriptions create-plan": subscriptionsCreatePlan,
  "subscriptions create": subscriptionsCreate,
  "subscriptions get": subscriptionsGet,
  "subscriptions cancel": subscriptionsCancel,
  "subscriptions payments": subscriptionsPayments,
  verify,
  listen,
  init,
  doctor,
};

const OPTIONS = {
  json: { type: "boolean" },
  output: { type: "string" },
  "no-color": { type: "boolean" },
  live: { type: "boolean" },
  mock: { type: "boolean" },
  profile: { type: "string" },
  confirm: { type: "boolean" },
  "idempotency-key": { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  // command flags
  "client-id": { type: "string" },
  "client-secret": { type: "string" },
  amount: { type: "string" },
  currency: { type: "string" },
  "customer-id": { type: "string" },
  phone: { type: "string" },
  email: { type: "string" },
  "order-id": { type: "string" },
  order: { type: "string" },
  note: { type: "string" },
  "notify-url": { type: "string" },
  "refund-id": { type: "string" },
  "link-id": { type: "string" },
  purpose: { type: "string" },
  "payment-id": { type: "string" },
  status: { type: "string" },
  method: { type: "string" },
  outcome: { type: "string" },
  "forward-to": { type: "string" },
  port: { type: "string" },
  lang: { type: "string" },
  dir: { type: "string" },
  "transfer-id": { type: "string" },
  mode: { type: "string" },
  account: { type: "string" },
  ifsc: { type: "string" },
  vpa: { type: "string" },
  "bene-id": { type: "string" },
  pan: { type: "string" },
  name: { type: "string" },
  dob: { type: "string" },
  "verification-id": { type: "string" },
  "plan-id": { type: "string" },
  "plan-name": { type: "string" },
  type: { type: "string" },
  "interval-type": { type: "string" },
  interval: { type: "string" },
  "max-amount": { type: "string" },
  "subscription-id": { type: "string" },
  "dispute-id": { type: "string" },
} as const;

const HELP = `cashfree ${VERSION} - agent-native CLI for Cashfree Payments

USAGE
  cashfree <command> [options]        sandbox by default; add --mock to run offline

THE LOOP (the reason this exists)
  init                                scaffold a working integration + AGENTS.md
  simulate payment --payment-id <id> --status SUCCESS
  listen --forward-to <url>           forward webhooks to localhost, verify locally
  verify [--outcome success|failure]  prove it works end to end, emit an artifact
  doctor                              preflight: why you are not live yet

RESOURCES
  orders create --amount 100          orders get <id>
  payments list <order_id>
  refunds create --order <id> --amount 50
  links create --amount 100           links get <id>
  settlements get <order_id>          settlements today
  disputes order <order_id>           disputes get <id>
  payouts transfer --amount 500 --vpa name@bank    payouts get <id>    payouts balance
  secureid pan --pan ABCDE1234F --name "Name"
  secureid bank-account --account 001020 --ifsc HDFC0001234
  subscriptions create-plan --amount 499 --interval-type MONTH
  subscriptions create --plan-id <id>     subscriptions get <id>

AUTH
  login --client-id <id> --client-secret <secret>   logout    whoami

AGENTS
  mcp serve                           expose the same surface to an AI agent

GLOBAL
  --json            machine output (auto-on when piped)
  --mock            offline sandbox simulator (no credentials)
  --live            target production (money commands also need --confirm)
  --profile <name>  isolate credentials (handy for agencies)
  -h, --help        -v, --version
`;

export async function run(argv: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: false });
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 3;
    return;
  }
  const { values, positionals } = parsed;

  if (values.version) {
    process.stdout.write(VERSION + "\n");
    return;
  }

  const flags: GlobalFlags = {
    json: !!values.json,
    output: normalizeFormat(values.output),
    color: !values["no-color"],
    live: !!values.live,
    mock: !!values.mock,
    profile: (values.profile as string) ?? "default",
    confirm: !!values.confirm,
    idempotencyKey: values["idempotency-key"] as string | undefined,
  };

  if (positionals.length === 0 || (values.help && positionals.length === 0)) {
    process.stderr.write(HELP);
    return;
  }

  const ctx = new CommandContext(flags);

  // mcp serve is special: it owns stdout for the JSON-RPC protocol.
  if (positionals[0] === "mcp" && positionals[1] === "serve") {
    await serveMcp(ctx);
    return;
  }

  const twoWord = positionals.slice(0, 2).join(" ");
  const oneWord = positionals[0] ?? "";
  let handler: Handler | undefined;
  let rest: string[];
  if (ROUTES[twoWord]) {
    handler = ROUTES[twoWord];
    rest = positionals.slice(2);
  } else if (ROUTES[oneWord]) {
    handler = ROUTES[oneWord];
    rest = positionals.slice(1);
  } else {
    ctx.out.error(
      new CashfreeError({
        code: "unknown_command",
        message: `Unknown command: ${[oneWord, positionals[1]].filter(Boolean).join(" ")}`,
        exitCode: 3,
        suggestedFix: "Run `cashfree --help` to see commands.",
      }).toEnvelope(),
    );
    process.exitCode = 3;
    return;
  }

  if (values.help) {
    process.stderr.write(HELP);
    return;
  }

  const input: Input = { positionals: rest, values };
  try {
    await handler(ctx, input);
  } catch (err) {
    const e = toCashfreeError(err);
    ctx.out.error(e.toEnvelope());
    process.exitCode = e.exitCode;
  }
}

function normalizeFormat(v: unknown): OutputFormat {
  return v === "json" || v === "table" ? v : "auto";
}
