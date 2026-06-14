import { createInterface } from "node:readline";
import type { CommandContext } from "../core/context.js";
import { CashfreeError } from "../core/errors.js";
import type { CashfreeClient } from "../api/client.js";

/**
 * MCP server over stdio, hand-rolled (no SDK dependency). Exposes the same
 * capability surface as the CLI, so an agent calls Cashfree as a tool with the
 * exact same safety gates. One binary, two consumers.
 *
 * stdio transport = newline-delimited JSON-RPC 2.0. stdout is the protocol
 * channel; we never print anything else there.
 */

const PROTOCOL_VERSION = "2024-11-05";
const SERVER = { name: "cashfree-cli", version: "0.1.0" };

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  money?: boolean;
  run: (client: CashfreeClient, args: Record<string, unknown>) => Promise<unknown>;
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v === "") throw CashfreeError.validation(`Missing '${key}'.`);
  return v;
}
function num(args: Record<string, unknown>, key: string): number {
  const v = Number(args[key]);
  if (!Number.isFinite(v)) throw CashfreeError.validation(`'${key}' must be a number.`);
  return v;
}
function optStr(args: Record<string, unknown>, key: string): string | undefined {
  return typeof args[key] === "string" ? (args[key] as string) : undefined;
}

const TOOLS: Tool[] = [
  {
    name: "cashfree_create_order",
    description: "Create a sandbox payment order. Returns the order with payment_session_id.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "order amount, >= 1" },
        currency: { type: "string", default: "INR" },
        customer_phone: { type: "string" },
      },
      required: ["amount"],
    },
    run: (client, args) =>
      client.createOrder({
        order_amount: num(args, "amount"),
        order_currency: optStr(args, "currency") ?? "INR",
        customer_details: { customer_id: `mcp_${Date.now()}`, customer_phone: optStr(args, "customer_phone") ?? "9999999999" },
      }),
  },
  {
    name: "cashfree_get_order",
    description: "Fetch an order by id. Use this to confirm true status, not the webhook.",
    inputSchema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] },
    run: (client, args) => client.getOrder(str(args, "order_id")),
  },
  {
    name: "cashfree_get_payments",
    description: "List payments for an order.",
    inputSchema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] },
    run: (client, args) => client.getPayments(str(args, "order_id")),
  },
  {
    name: "cashfree_simulate_payment",
    description: "Sandbox only. Force a payment outcome for a cf_payment_id.",
    inputSchema: {
      type: "object",
      properties: {
        cf_payment_id: { type: "string" },
        status: { type: "string", enum: ["SUCCESS", "FAILED", "PENDING", "USER_DROPPED"] },
      },
      required: ["cf_payment_id"],
    },
    run: (client, args) =>
      client.simulate({
        entity: "PAYMENTS",
        entity_id: str(args, "cf_payment_id"),
        entity_simulation: { payment_status: (optStr(args, "status") ?? "SUCCESS") as "SUCCESS" },
      }),
  },
  {
    name: "cashfree_create_refund",
    description: "Refund a paid order. Money movement: in live mode requires confirm=true.",
    money: true,
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string" }, amount: { type: "number" }, confirm: { type: "boolean" } },
      required: ["order_id", "amount"],
    },
    run: (client, args) =>
      client.createRefund(str(args, "order_id"), {
        refund_amount: num(args, "amount"),
        refund_id: `mcp_rfnd_${Date.now()}`,
      }),
  },
  {
    name: "cashfree_create_payment_link",
    description: "Create a payment link.",
    inputSchema: {
      type: "object",
      properties: { amount: { type: "number" }, purpose: { type: "string" } },
      required: ["amount"],
    },
    run: (client, args) =>
      client.createLink({
        link_id: `mcp_link_${Date.now()}`,
        link_amount: num(args, "amount"),
        link_currency: "INR",
        link_purpose: optStr(args, "purpose") ?? "MCP link",
        customer_details: { customer_id: `mcp_${Date.now()}`, customer_phone: "9999999999" },
      }),
  },
  {
    name: "cashfree_verify_pan",
    description: "Secure ID: verify a PAN. Returns match booleans.",
    inputSchema: {
      type: "object",
      properties: { pan: { type: "string" }, name: { type: "string" }, dob: { type: "string" } },
      required: ["pan", "name"],
    },
    run: (client, args) =>
      client.verifyPan({
        verification_id: `mcp_${Date.now()}`,
        pan: str(args, "pan"),
        name: str(args, "name"),
        dob: optStr(args, "dob") ?? "1990-01-01",
      }),
  },
  {
    name: "cashfree_verify_bank_account",
    description: "Secure ID: verify a bank account (penny-less).",
    inputSchema: {
      type: "object",
      properties: { account: { type: "string" }, ifsc: { type: "string" }, name: { type: "string" } },
      required: ["account", "ifsc"],
    },
    run: (client, args) =>
      client.verifyBankAccount({ bank_account: str(args, "account"), ifsc: str(args, "ifsc"), name: optStr(args, "name") }),
  },
];

export async function serveMcp(ctx: CommandContext): Promise<void> {
  process.stderr.write(`cashfree mcp server ready (${ctx.mock ? "mock" : ctx.mode}). ${TOOLS.length} tools.\n`);

  const send = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + "\n");
  const rl = createInterface({ input: process.stdin });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let req: { id?: unknown; method?: string; params?: Record<string, unknown> };
    try {
      req = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const { id, method, params } = req;

    try {
      if (method === "initialize") {
        send({ jsonrpc: "2.0", id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER } });
      } else if (method === "notifications/initialized" || method === "notifications/cancelled") {
        // notification, no response
      } else if (method === "ping") {
        send({ jsonrpc: "2.0", id, result: {} });
      } else if (method === "tools/list") {
        send({ jsonrpc: "2.0", id, result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } });
      } else if (method === "tools/call") {
        const name = params?.name as string;
        const args = (params?.arguments as Record<string, unknown>) ?? {};
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) throw CashfreeError.validation(`Unknown tool '${name}'.`);
        if (tool.money && ctx.isLive() && args.confirm !== true) {
          throw CashfreeError.confirmationRequired(`call ${name}`);
        }
        const result = await tool.run(ctx.getClient(), args);
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
      } else {
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
      }
    } catch (err) {
      const envelope = err instanceof CashfreeError ? err.toEnvelope() : { code: "runtime_error", message: String(err), type: "" };
      if (id !== undefined) {
        // Return as a tool error result so the agent can read and self-correct.
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify({ ok: false, error: envelope }, null, 2) }], isError: true } });
      }
    }
  }
}
