import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate the mock state file from the real user config. paths.configDir()
// reads this env on each call, so setting it before any client call is enough.
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "cf-test-"));

const { MockClient, resetMockState } = await import("../api/mock-client.js");

const customer = { customer_id: "c1", customer_phone: "9999999999" };

test("test-success VPA flips the order to PAID", async () => {
  resetMockState();
  const client = new MockClient();
  const order = await client.createOrder({ order_amount: 100, customer_details: customer });
  assert.equal(order.order_status, "ACTIVE");

  await client.orderPay({
    payment_session_id: order.payment_session_id,
    payment_method: { upi: { channel: "collect", upi_id: "testsuccess@gocash" } },
  });

  const fresh = await client.getOrder(order.order_id);
  assert.equal(fresh.order_status, "PAID");
});

test("test-failure VPA leaves the order ACTIVE", async () => {
  resetMockState();
  const client = new MockClient();
  const order = await client.createOrder({ order_amount: 100, customer_details: customer });
  await client.orderPay({
    payment_session_id: order.payment_session_id,
    payment_method: { upi: { channel: "collect", upi_id: "testfailure@gocash" } },
  });
  const fresh = await client.getOrder(order.order_id);
  assert.equal(fresh.order_status, "ACTIVE");
});

test("invalid VPA is rejected", async () => {
  resetMockState();
  const client = new MockClient();
  const order = await client.createOrder({ order_amount: 100, customer_details: customer });
  await assert.rejects(
    client.orderPay({
      payment_session_id: order.payment_session_id,
      payment_method: { upi: { channel: "collect", upi_id: "testinvalid@gocash" } },
    }),
    /Invalid VPA/,
  );
});

test("refund requires a PAID order", async () => {
  resetMockState();
  const client = new MockClient();
  const order = await client.createOrder({ order_amount: 100, customer_details: customer });
  await assert.rejects(client.createRefund(order.order_id, { refund_amount: 50, refund_id: "r1" }), /only PAID/);

  await client.orderPay({
    payment_session_id: order.payment_session_id,
    payment_method: { upi: { channel: "collect", upi_id: "testsuccess@gocash" } },
  });
  const refund = await client.createRefund(order.order_id, { refund_amount: 50, refund_id: "r1" });
  assert.equal(refund.refund_status, "SUCCESS");
});

test("fetching an unknown order is a not_found error", async () => {
  resetMockState();
  const client = new MockClient();
  await assert.rejects(client.getOrder("nope"), /not found/i);
});

test("PAN format drives the match result", async () => {
  const client = new MockClient();
  const ok = await client.verifyPan({ verification_id: "v1", pan: "ABCDE1234F", name: "Test", dob: "1990-01-01" });
  assert.equal(ok.status, "VALID");
  const bad = await client.verifyPan({ verification_id: "v2", pan: "NOTAPAN", name: "Test", dob: "1990-01-01" });
  assert.equal(bad.status, "INVALID");
});
