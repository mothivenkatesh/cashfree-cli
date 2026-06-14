import { spawn, type ChildProcess } from "node:child_process";

export interface Tunnel {
  url: string;
  close: () => Promise<void>;
}

/** Poll the public URL until it actually round-trips to the local receiver. */
async function waitReachable(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { method: "GET" });
      // Our receiver answers 405 to GET; Cloudflare returns 5xx while the
      // tunnel edge is still registering. <500 means it's live end to end.
      if (r.status < 500) return;
    } catch {
      // connection not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * Open a public tunnel to a local port using cloudflared's quick tunnel
 * (no account, no config). Resolves only once the tunnel actually routes to the
 * local receiver, so callers don't create an order before webhooks can land.
 * Returns null if cloudflared is not installed or never comes up.
 *
 * This is what lets real-mode `verify`/`listen` receive live Cashfree webhooks
 * on localhost: point an order's notify_url at the returned URL.
 */
export function startTunnel(port: number, timeoutMs = 35000): Promise<Tunnel | null> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve(null);
      return;
    }

    let settled = false;
    let urlFound: string | null = null;
    const close = () =>
      new Promise<void>((done) => {
        proc.kill();
        done();
      });
    const finish = (t: Tunnel | null) => {
      if (settled) return;
      settled = true;
      resolve(t);
    };

    proc.on("error", () => finish(null)); // ENOENT = cloudflared not installed

    const scan = (buf: Buffer) => {
      if (urlFound) return;
      const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        urlFound = m[0];
        // Wait for the edge to route before handing the tunnel back.
        void waitReachable(urlFound, timeoutMs - 5000).then(() => finish({ url: urlFound as string, close }));
      }
    };
    proc.stdout?.on("data", scan);
    proc.stderr?.on("data", scan);

    setTimeout(() => {
      if (!settled) {
        proc.kill();
        finish(null);
      }
    }, timeoutMs);
  });
}
