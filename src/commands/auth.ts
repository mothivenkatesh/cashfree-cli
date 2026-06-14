import type { CommandContext } from "../core/context.js";
import { type Input, requireStr, flagStr } from "./_args.js";
import { setCredentials, clearCredentials, getCredentials, mask } from "../config/store.js";
import { CashfreeError } from "../core/errors.js";

export async function login(ctx: CommandContext, input: Input): Promise<void> {
  if (ctx.mock) {
    ctx.out.note("Mock mode needs no credentials. You can run commands with --mock right away.");
    ctx.out.result({ mode: "sandbox-mock", status: "ready" });
    return;
  }
  const clientId =
    flagStr(input.values, "client-id") ??
    process.env.CASHFREE_CLIENT_ID ??
    requireStr(input.values, "client-id", "Pass --client-id and --client-secret, or set CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET.");
  const clientSecret =
    flagStr(input.values, "client-secret") ??
    process.env.CASHFREE_CLIENT_SECRET ??
    requireStr(input.values, "client-secret");

  setCredentials(ctx.profile, ctx.mode, { clientId, clientSecret });
  ctx.out.step(true, `Saved ${ctx.mode} credentials for profile '${ctx.profile}'.`);
  ctx.out.result({
    profile: ctx.profile,
    mode: ctx.mode,
    client_id: clientId,
    secret: mask(clientSecret),
    status: "saved",
  });
}

export async function logout(ctx: CommandContext, _input: Input): Promise<void> {
  clearCredentials(ctx.profile);
  ctx.out.result({ profile: ctx.profile, status: "cleared" });
}

export async function whoami(ctx: CommandContext, _input: Input): Promise<void> {
  if (ctx.mock) {
    ctx.out.result({ profile: ctx.profile, mode: "sandbox-mock", authenticated: true });
    return;
  }
  const creds = getCredentials(ctx.profile, ctx.mode);
  if (!creds) throw CashfreeError.auth(`No ${ctx.mode} credentials for profile '${ctx.profile}'.`);
  ctx.out.result({
    profile: ctx.profile,
    mode: ctx.mode,
    client_id: creds.clientId,
    secret: mask(creds.clientSecret),
    authenticated: true,
  });
}
