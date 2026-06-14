import type { ErrorEnvelope } from "./errors.js";

/**
 * Dual-consumer output.
 *
 * Results go to stdout. Human progress chatter goes to stderr. So `cashfree
 * orders create --json | jq` gets clean JSON even while a human watching the
 * terminal still sees the step-by-step. JSON mode is auto-on when stdout is not
 * a TTY (piped, CI, spawned by an agent), matching the agent-native contract.
 */
export type OutputFormat = "auto" | "json" | "table";

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

export class OutputWriter {
  private readonly json: boolean;
  private readonly color: boolean;

  constructor(opts: { format: OutputFormat; color: boolean }) {
    this.json = opts.format === "json" || (opts.format === "auto" && !process.stdout.isTTY);
    this.color = opts.color && process.stdout.isTTY && !process.env.NO_COLOR;
  }

  get isJson(): boolean {
    return this.json;
  }

  private paint(code: string, s: string): string {
    return this.color ? `${code}${s}${c.reset}` : s;
  }

  /** The command's primary result. Goes to stdout. */
  result(data: unknown): void {
    if (this.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    } else {
      process.stdout.write(render(data, this.color ? c : null) + "\n");
    }
  }

  /** Human progress line. Suppressed in JSON mode; otherwise to stderr. */
  note(message: string): void {
    if (!this.json) process.stderr.write(this.paint(c.dim, message) + "\n");
  }

  /** A check line for verify/doctor. Suppressed in JSON mode. */
  step(ok: boolean | "warn", label: string): void {
    if (this.json) return;
    const mark = ok === true ? this.paint(c.green, "✓") : ok === "warn" ? this.paint(c.yellow, "!") : this.paint(c.red, "✗");
    process.stderr.write(`  ${mark} ${label}\n`);
  }

  heading(message: string): void {
    if (!this.json) process.stderr.write(this.paint(c.bold, message) + "\n");
  }

  /** Structured error. JSON envelope to stderr in JSON mode, else a human block. */
  error(env: ErrorEnvelope): void {
    if (this.json) {
      process.stderr.write(JSON.stringify({ ok: false, error: env }, null, 2) + "\n");
      return;
    }
    process.stderr.write(this.paint(c.red, `Error: ${env.message}`) + "\n");
    if (env.detail) process.stderr.write(this.paint(c.dim, `  ${env.detail}`) + "\n");
    if (env.suggested_fix) process.stderr.write(`  ${this.paint(c.cyan, "fix:")} ${env.suggested_fix}\n`);
    if (env.retry_after) process.stderr.write(this.paint(c.dim, `  retry after: ${env.retry_after}s`) + "\n");
    if (env.docs) process.stderr.write(this.paint(c.dim, `  docs: ${env.docs}`) + "\n");
  }
}

type Palette = typeof c;

/** Minimal human renderer: key/value for objects, a simple table for arrays. */
function render(data: unknown, palette: Palette | null): string {
  const dim = (s: string) => (palette ? `${palette.dim}${s}${palette.reset}` : s);

  if (Array.isArray(data)) {
    if (data.length === 0) return dim("(none)");
    if (typeof data[0] !== "object" || data[0] === null) {
      return data.map((v) => String(v)).join("\n");
    }
    const rows = data as Record<string, unknown>[];
    const cols = Object.keys(rows[0] ?? {});
    const widths = cols.map((col) =>
      Math.max(col.length, ...rows.map((r) => String(r[col] ?? "").length)),
    );
    const head = cols.map((col, i) => col.padEnd(widths[i] ?? 0)).join("  ");
    const body = rows
      .map((r) => cols.map((col, i) => String(r[col] ?? "").padEnd(widths[i] ?? 0)).join("  "))
      .join("\n");
    return `${dim(head)}\n${body}`;
  }

  if (data && typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    const keyWidth = Math.max(...entries.map(([k]) => k.length));
    return entries
      .map(([k, v]) => {
        const value = v !== null && typeof v === "object" ? JSON.stringify(v) : String(v);
        return `${dim(k.padEnd(keyWidth))}  ${value}`;
      })
      .join("\n");
  }

  return String(data);
}
