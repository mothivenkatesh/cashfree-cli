import { randomBytes } from "node:crypto";
import type { CommandContext } from "../core/context.js";
import { type Input, requireNum, flagStr } from "./_args.js";
import { CashfreeError } from "../core/errors.js";
import type { CreateTransferRequest, TransferMode } from "../api/types.js";

/** `cashfree payouts transfer --amount 500 --vpa someone@bank` (sandbox by default). */
export async function payoutsTransfer(ctx: CommandContext, input: Input): Promise<void> {
  ctx.guardLiveMoney("send a payout"); // G2: the strictest money-movement guard

  const beneId = flagStr(input.values, "bene-id");
  const account = flagStr(input.values, "account");
  const ifsc = flagStr(input.values, "ifsc");
  const vpa = flagStr(input.values, "vpa");

  if (!beneId && !vpa && !(account && ifsc)) {
    throw CashfreeError.validation(
      "Provide a beneficiary: --bene-id, or --vpa, or both --account and --ifsc.",
    );
  }

  const req: CreateTransferRequest = {
    transfer_id: flagStr(input.values, "transfer-id") ?? `txn_${randomBytes(6).toString("hex")}`,
    transfer_amount: requireNum(input.values, "amount"),
    transfer_mode: (flagStr(input.values, "mode") as TransferMode | undefined) ?? "banktransfer",
    beneficiary_details: {
      beneficiary_id: beneId,
      bank_account_number: account,
      bank_ifsc: ifsc,
      vpa,
    },
    remarks: flagStr(input.values, "note"),
  };

  if (ctx.isLive() && !ctx.idempotencyKey) {
    ctx.out.note("Tip: pass --idempotency-key for live transfers so a retry never double-pays.");
  }

  const transfer = await ctx.getClient().createTransfer(req);
  ctx.out.step(true, `Transfer ${transfer.transfer_id} (${transfer.status}).`);
  ctx.out.result(transfer);
}

export async function payoutsGet(ctx: CommandContext, input: Input): Promise<void> {
  const transferId = input.positionals[0] ?? flagStr(input.values, "transfer-id");
  if (!transferId) throw CashfreeError.validation("Provide a transfer id (positional) or --transfer-id.");
  ctx.out.result(await ctx.getClient().getTransfer(transferId));
}
