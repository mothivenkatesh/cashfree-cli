import { randomBytes } from "node:crypto";
import type { CommandContext } from "../core/context.js";
import { type Input, requireStr, flagStr } from "./_args.js";

/** `cashfree secureid pan --pan ABCDE1234F --name "..." --dob 1990-01-01` */
export async function secureidPan(ctx: CommandContext, input: Input): Promise<void> {
  const res = await ctx.getClient().verifyPan({
    verification_id: flagStr(input.values, "verification-id") ?? `vrf_${randomBytes(6).toString("hex")}`,
    pan: requireStr(input.values, "pan").toUpperCase(),
    name: requireStr(input.values, "name"),
    dob: flagStr(input.values, "dob") ?? "1990-01-01",
  });
  ctx.out.step(res.status === "VALID", `PAN ${res.pan}: ${res.status} (name_match=${res.name_match}).`);
  ctx.out.result(res);
}

/** `cashfree secureid bank-account --account 0001020 --ifsc HDFC0001234 --name "..."` */
export async function secureidBankAccount(ctx: CommandContext, input: Input): Promise<void> {
  const res = await ctx.getClient().verifyBankAccount({
    bank_account: requireStr(input.values, "account"),
    ifsc: requireStr(input.values, "ifsc").toUpperCase(),
    name: flagStr(input.values, "name"),
    phone: flagStr(input.values, "phone"),
  });
  ctx.out.step(res.account_status === "VALID", `Account: ${res.account_status} (${res.name_match_result ?? "n/a"}).`);
  ctx.out.result(res);
}
