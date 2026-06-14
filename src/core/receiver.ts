import { createServer, type Server } from "node:http";
import { verifyWebhook } from "../api/webhook.js";

export interface ReceivedWebhook {
  rawBody: string;
  json: unknown;
  signatureValid: boolean;
  reason?: string;
  receivedAt: string;
}

export interface Receiver {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/**
 * A local HTTP endpoint that receives webhooks, verifies the signature against
 * `secret`, and hands the result to `onEvent`. Used by both `listen` (long
 * running) and `verify` (one shot). Binds to 127.0.0.1 only.
 */
export function startReceiver(opts: {
  secret: string;
  path?: string;
  port?: number;
  onEvent: (event: ReceivedWebhook) => void;
}): Promise<Receiver> {
  const path = opts.path ?? "/cashfree-webhook";

  return new Promise((resolvePromise, reject) => {
    const server: Server = createServer((req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("method not allowed");
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const signature = String(req.headers["x-webhook-signature"] ?? "");
        const timestamp = String(req.headers["x-webhook-timestamp"] ?? "");
        const result = verifyWebhook({ secret: opts.secret, signature, timestamp, rawBody });
        let json: unknown;
        try {
          json = JSON.parse(rawBody);
        } catch {
          json = { raw: rawBody };
        }
        opts.onEvent({
          rawBody,
          json,
          signatureValid: result.valid,
          reason: result.reason,
          receivedAt: new Date().toISOString(),
        });
        res.statusCode = 200;
        res.end("ok");
      });
    });

    server.on("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolvePromise({
        url: `http://127.0.0.1:${port}${path}`,
        port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
