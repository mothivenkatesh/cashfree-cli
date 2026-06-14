import { test } from "node:test";
import assert from "node:assert/strict";
import { signWebhook, verifyWebhook } from "../api/webhook.js";

const SECRET = "test_secret";
const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "o1" } } });
const ts = String(Date.now());

test("valid signature round-trips", () => {
  const sig = signWebhook(SECRET, ts, body);
  assert.equal(verifyWebhook({ secret: SECRET, signature: sig, timestamp: ts, rawBody: body }).valid, true);
});

test("tampered body is rejected", () => {
  const sig = signWebhook(SECRET, ts, body);
  const r = verifyWebhook({ secret: SECRET, signature: sig, timestamp: ts, rawBody: body + " " });
  assert.equal(r.valid, false);
  assert.equal(r.reason, "signature_mismatch");
});

test("wrong secret is rejected", () => {
  const sig = signWebhook(SECRET, ts, body);
  assert.equal(verifyWebhook({ secret: "other", signature: sig, timestamp: ts, rawBody: body }).valid, false);
});

test("stale timestamp is rejected (replay window)", () => {
  const oldTs = "1000"; // epoch seconds, ancient
  const sig = signWebhook(SECRET, oldTs, body);
  const r = verifyWebhook({ secret: SECRET, signature: sig, timestamp: oldTs, rawBody: body, now: Date.now() });
  assert.equal(r.valid, false);
  assert.equal(r.reason, "timestamp_outside_tolerance");
});
