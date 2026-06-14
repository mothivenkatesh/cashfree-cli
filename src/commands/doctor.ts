import type { CommandContext } from "../core/context.js";
import type { Input } from "./_args.js";
import { API_VERSION } from "../config/environment.js";
import { getCredentials } from "../config/store.js";

interface Check {
  name: string;
  ok: boolean | "warn";
  detail: string;
}

/** Preflight. Tells a developer (or an agent) why they are not live yet. */
export async function doctor(ctx: CommandContext, _input: Input): Promise<void> {
  const checks: Check[] = [];

  // 1. Credentials
  if (ctx.mock) {
    checks.push({ name: "credentials", ok: "warn", detail: "mock mode (no real credentials)" });
  } else {
    const creds = getCredentials(ctx.profile, ctx.mode);
    checks.push({
      name: "credentials",
      ok: !!creds,
      detail: creds ? `profile '${ctx.profile}', ${ctx.mode}` : "none, run `cashfree login`",
    });
  }

  // 2. API version pinned
  checks.push({ name: "api_version", ok: true, detail: API_VERSION });

  // 3. Connectivity + auth
  try {
    const ping = await ctx.getClient().ping();
    checks.push({ name: "connectivity", ok: ping.ok, detail: ping.detail });
  } catch (err) {
    checks.push({ name: "connectivity", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  // 4. Mode
  checks.push({
    name: "mode",
    ok: ctx.mode === "sandbox" ? true : "warn",
    detail: ctx.mode === "live" ? "LIVE (real money)" : "sandbox",
  });

  const ready = checks.every((c) => c.ok === true);

  ctx.out.heading(`Cashfree doctor (${ctx.mock ? "mock" : ctx.mode})`);
  for (const check of checks) ctx.out.step(check.ok, `${check.name}: ${check.detail}`);
  ctx.out.result({ mode: ctx.mock ? "sandbox-mock" : ctx.mode, ready, checks });
}
