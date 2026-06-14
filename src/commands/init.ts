import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CommandContext } from "../core/context.js";
import { type Input, flagStr } from "./_args.js";
import { ENV_EXAMPLE, NODE_WEBHOOK_HANDLER, agentsMd } from "../scaffold/templates.js";

const SUPPORTED = ["node"];

/**
 * Scaffold a working integration: env template, a webhook handler with REAL
 * signature verification, and an AGENTS.md so coding agents stop hallucinating
 * the API. The fastest path from nothing to a correct starting point.
 */
export async function init(ctx: CommandContext, input: Input): Promise<void> {
  const lang = (flagStr(input.values, "lang") ?? "node").toLowerCase();
  const dir = resolve(flagStr(input.values, "dir") ?? process.cwd());
  mkdirSync(dir, { recursive: true });

  const written: string[] = [];
  const write = (name: string, contents: string) => {
    const path = join(dir, name);
    if (existsSync(path)) {
      ctx.out.step("warn", `skipped ${name} (already exists)`);
      return;
    }
    writeFileSync(path, contents);
    written.push(name);
    ctx.out.step(true, `wrote ${name}`);
  };

  write(".env.example", ENV_EXAMPLE);
  write("AGENTS.md", agentsMd());

  if (lang === "node") {
    write("cashfree-webhook.mjs", NODE_WEBHOOK_HANDLER);
  } else {
    ctx.out.step("warn", `language '${lang}' scaffolds env + AGENTS.md only for now (supported: ${SUPPORTED.join(", ")}).`);
  }

  ctx.out.result({ dir, lang, files: written, next: "cashfree verify --mock" });
}
