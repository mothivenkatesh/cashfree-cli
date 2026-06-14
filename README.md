# Cashfree CLI

**Prove a Cashfree integration works end to end — from your terminal, or from your AI agent.**

Built by [Mothi Venkatesh](https://github.com/mothivenkatesh) — Product Marketing at [Cashfree Payments](https://www.cashfree.com). An agent-native CLI for the developer (and the coding agent) who would rather never open the dashboard.

> Most payment CLIs fetch objects. This one proves the loop: create an order, pay it,
> catch the webhook, verify the signature, and cross-check the API before it says "done."
> Sandbox by default. Runs fully offline with `--mock` — no keys, no setup.

```bash
git clone https://github.com/mothivenkatesh/cashfree-cli-oss
cd cashfree-cli-oss && npm install && npm run build
node dist/index.js verify --mock
```

```
Verifying upi success (mock)
  ✓ order created  order_d5f8…ae97 (ACTIVE)
  ✓ payment initiated  MOCK_pay_db0f…01a0
  ✓ webhook received  signature valid
  ✓ api cross-check  order_status=PAID (expected PAID)
  ✓ artifact  .cashfree/verify-….json
```

**Zero runtime dependencies · Node 20+ · one binary that is also an MCP server.**

---

## What it does

- **Closes the integration loop in five commands** — `init` → `simulate` → `listen` → `verify` → `doctor`. The slow part of a payment integration is testing webhooks and proving it works; this is built for exactly that.
- **One binary, two consumers** — a human at a terminal, and an AI agent over MCP. Same commands, same safety, both ways.
- **Runs offline** — `--mock` boots a built-in sandbox simulator that signs and delivers real webhooks, so the whole loop runs with no credentials.
- **Agent-native by default** — `--json` output (auto-on when piped), semantic exit codes, and structured errors with `suggested_fix` so an agent self-corrects.
- **A webhook is a signal, not the truth** — `verify` always cross-checks the authoritative API before declaring success. Never the webhook payload alone.
- **Grounded in the real API** — `x-api-version: 2025-01-01`, real endpoints, HMAC-SHA256 webhook verification. No invented shapes.

## What works today

- ✅ **`verify` — the full loop, validated against the live Cashfree sandbox**: real order → pay → simulate → webhook → signature match → API cross-check → typed artifact.
- ✅ **Payment Gateway, live-validated**: `orders create/get`, `payments list`, `links create/get`, order pay, `simulate`, `refunds create`, `settlements get`.
- ✅ **Signed webhook delivery confirmed live** — the sandbox delivers signed webhooks; this CLI's signature verification matches Cashfree's exactly.
- ✅ **`listen`** — forward webhooks to localhost and verify signatures locally, no ngrok (mock + cross-process proven).
- ✅ **`init`** — scaffolds `.env.example`, a webhook handler with real signature verification, and an `AGENTS.md` so coding agents stop guessing the API.
- ✅ **`doctor`** — preflight: credentials, API version, connectivity, mode.
- ✅ **`mcp serve`** — exposes the surface as 8 MCP tools over stdio JSON-RPC.
- ✅ **10/10 tests, clean TypeScript build, zero runtime dependencies.**

## Roadmap — not done yet

- ⏳ **Secure ID** (PAN, bank account, UPI verification) — client built; needs signature auth + IP allowlisting handled for a CLI context; live validation pending.
- ⏳ **Payouts** (transfers, beneficiaries) — client built; needs IP allowlisting + V2 body finalized; live validation pending.
- ⏳ **Subscriptions** (UPI Autopay, plans, mandates) — commands built and grounded in the docs; pending sandbox product enablement; live validation pending.
- ⏳ **Real-mode `listen` auto-tunnel** — so live webhooks reach localhost without a manual tunnel (delivery + signature already proven).
- ⏳ **Distribution** — publish to npm for `npx cashfree-cli`, add a Homebrew tap.
- ⏳ **Codegen** — generate the API client from the OpenAPI spec so it never drifts.
- ⏳ **More `init` languages** — Python and PHP scaffolds.

## The commands

```bash
# the loop
cashfree init                                  # scaffold a working integration + AGENTS.md
cashfree simulate payment --payment-id <id> --status SUCCESS
cashfree listen --forward-to http://localhost:3000/webhook
cashfree verify --outcome success              # prove it works, emit an artifact
cashfree doctor                                # why you are not live yet

# resources (Payment Gateway)
cashfree orders create --amount 100            # orders get <id>
cashfree payments list <order_id>
cashfree refunds create --order <id> --amount 50
cashfree links create --amount 100             # links get <id>
cashfree settlements get <order_id>

# roadmap surfaces (built, validation pending)
cashfree payouts transfer --amount 500 --vpa name@bank
cashfree secureid pan --pan ABCDE1234F --name "Name"
cashfree subscriptions create-plan --amount 499 --interval-type MONTH

# auth + agents
cashfree login --client-id <id> --client-secret <secret>
cashfree mcp serve
```

Add `--mock` to run any of it offline. Add `--json` for machine output.

## For AI agents

- `--json` on every command, auto-on when stdout is piped (TTY detection).
- Semantic exit codes: `0` ok · `2` auth · `3` validation · `4` confirmation-required · `6` not-found · `7` rate-limited · `8` network. Branch on them; don't scrape text.
- Structured errors with `suggested_fix` and `retry_after`.
- `cashfree mcp serve` — the same surface as MCP tools, same gates.
- `cashfree init` writes `AGENTS.md` with the pinned API version, base URLs, and the "webhook is not the truth" rule.

## Safety

- **Sandbox by default.** `--live` is required for production.
- **Live money movement** (payouts, refunds) also needs `--confirm`, so a script or agent never moves real money by accident.
- **Credentials** live in a `0600` file (OS keychain hardening on the roadmap), never in argv, never logged.

## How it's built

- **TypeScript**, compiled with `tsc`, **zero runtime dependencies** — even the MCP server is a hand-rolled JSON-RPC stdio loop. Fast, reliable `npm install`.
- The real HTTP client and an offline **mock sandbox** implement one `CashfreeClient` interface, so the CLI and the MCP server share logic and the whole thing is testable without a network.
- API shapes are grounded in Cashfree's public SDKs and OpenAPI specs.

---

Status: **community project, not an official Cashfree product (yet).** Payment Gateway is validated against the live sandbox; the rest is on the roadmap above. Issues and PRs welcome.

MIT © Mothi Venkatesh
