import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createAccess } from "../server/access.js";
import { createBilling } from "../server/billing.js";
import {
  createServerAnalytics,
  revenueCatEvent,
  clientIdFor,
  validClientId,
  MP_URL,
} from "../server/analytics.js";
const quiet = { warn() {} };
const now = Date.parse("2026-11-07T00:00:00Z");
const env = { GA4_MEASUREMENT_ID: "G-APP12345", GA4_API_SECRET: "s3cret" };
function fixture(extraEnv = {}) {
  const store = new MemoryStore();
  const calls = [];
  let status = 204;
  const fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: status < 400, status };
  };
  const analytics = createServerAnalytics({
    env: { ...env, ...extraEnv },
    fetch,
    store,
    now: () => now,
    log: quiet.warn,
  });
  return { store, calls, analytics, setStatus: (s) => (status = s) };
}
test("client ids: the app's one when valid, else a stable one from the uid", () => {
  assert.equal(
    clientIdFor("alice", "1234567890.1700000000"),
    "1234567890.1700000000",
  );
  const derived = clientIdFor("alice", "<bad>");
  assert.ok(validClientId(derived), derived);
  assert.equal(clientIdFor("alice"), derived);
  assert.notEqual(clientIdFor("bob"), derived);
});
test("RevenueCat events map to GA4 purchase, renewal and lifecycle events without personal data", () => {
  const purchase = revenueCatEvent({
    type: "INITIAL_PURCHASE",
    app_user_id: "alice",
    product_id: "com.doyle.yumetan.starter.monthly",
    price: 3.3,
    currency: "JPY",
    price_in_purchased_currency: 490,
    transaction_id: "tx-1",
    store: "APP_STORE",
    environment: "PRODUCTION",
    period_type: "NORMAL",
    is_trial_conversion: false,
    subscriber_attributes: { $email: { value: "alice@example.com" } },
  });
  assert.equal(purchase.name, "purchase");
  assert.equal(purchase.sandbox, false);
  assert.deepEqual(purchase.params, {
    plan: "starter",
    cycle: "monthly",
    product_id: "com.doyle.yumetan.starter.monthly",
    store: "app_store",
    environment: "production",
    period_type: "normal",
    is_trial_conversion: 0,
    is_sandbox: 0,
    value: 490,
    currency: "JPY",
    transaction_id: "tx-1",
    items: [
      {
        item_id: "com.doyle.yumetan.starter.monthly",
        item_name: "starter (monthly)",
        item_category: "subscription",
        item_variant: "monthly",
        price: 490,
        quantity: 1,
      },
    ],
  });
  assert.ok(!JSON.stringify(purchase).includes("alice"));
  const renewal = revenueCatEvent({
    type: "RENEWAL",
    product_id: "com.doyle.yumetan.standard.yearly",
    price: 65,
    environment: "SANDBOX",
  });
  assert.equal(renewal.name, "subscription_renewal");
  assert.equal(renewal.sandbox, true);
  assert.equal(renewal.params.value, 65);
  assert.equal(renewal.params.currency, "USD");
  assert.equal(renewal.params.cycle, "yearly");
  const cancel = revenueCatEvent({
    type: "CANCELLATION",
    product_id: "com.doyle.yumetan.starter.monthly",
    cancel_reason: "UNSUBSCRIBE",
  });
  assert.equal(cancel.name, "subscription_cancel");
  assert.equal(cancel.params.cancel_reason, "unsubscribe");
  assert.equal("items" in cancel.params, false);
  assert.equal(revenueCatEvent({ type: "TEST" }), null);
  assert.equal(revenueCatEvent(null), null);
});
test("rememberClient stores a valid client id once per member and ignores junk", async () => {
  const { store, analytics } = fixture();
  assert.equal(await analytics.rememberClient("alice", "<script>"), false);
  assert.equal(
    await analytics.rememberClient("alice", "1234567890.1700000000", "ios"),
    true,
  );
  assert.equal(
    await analytics.rememberClient("alice", "1234567890.1700000000", "ios"),
    false,
  );
  assert.deepEqual((await store.get("memberships/alice")).analytics, {
    clientId: "1234567890.1700000000",
    platform: "ios",
    seenAt: now,
  });
  // A new device replaces it; other membership fields stay.
  await store.transaction(async (tx) =>
    tx.set("memberships/alice", {
      ...(await tx.get("memberships/alice")),
      plan: "starter",
    }),
  );
  assert.equal(
    await analytics.rememberClient("alice", "2222222222.1700000001", "web"),
    true,
  );
  const member = await store.get("memberships/alice");
  assert.equal(member.plan, "starter");
  assert.equal(member.analytics.clientId, "2222222222.1700000001");
  assert.equal(member.analytics.platform, "web");
});
test("send posts to the Measurement Protocol with the member's client id and user id", async () => {
  const { store, analytics, calls, setStatus } = fixture();
  await analytics.rememberClient("alice", "1234567890.1700000000", "ios");
  assert.equal(
    await analytics.send("alice", [
      { name: "subscription_cancel", params: { plan: "starter" } },
    ]),
    true,
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `${MP_URL}?measurement_id=G-APP12345&api_secret=s3cret`,
  );
  assert.deepEqual(calls[0].body, {
    client_id: "1234567890.1700000000",
    user_id: "alice",
    timestamp_micros: now * 1000,
    non_personalized_ads: true,
    events: [
      {
        name: "subscription_cancel",
        params: { engagement_time_msec: 1, plan: "starter" },
      },
    ],
  });
  // A member the app never reported: the derived id, still one user.
  await analytics.send("bob", [{ name: "subscription_expire", params: {} }]);
  assert.equal(calls[1].body.client_id, clientIdFor("bob"));
  assert.equal(calls[1].body.user_id, "bob");
  setStatus(500);
  assert.equal(
    await analytics.send("alice", [{ name: "x", params: {} }]),
    false,
  );
  assert.equal(await analytics.send("alice", []), false);
  assert.ok(store);
});
test("without configuration nothing is sent; sandbox events are skipped unless allowed", async () => {
  const off = fixture({ GA4_MEASUREMENT_ID: "", GA4_API_SECRET: "" });
  assert.equal(off.analytics.configured, false);
  assert.equal(
    await off.analytics.revenueCat(
      { type: "RENEWAL", product_id: "x.starter.monthly" },
      ["alice"],
    ),
    0,
  );
  assert.equal(off.calls.length, 0);
  const on = fixture();
  assert.equal(on.analytics.configured, true);
  const sandbox = {
    type: "INITIAL_PURCHASE",
    product_id: "x.starter.monthly",
    environment: "SANDBOX",
    price: 3,
  };
  assert.equal(await on.analytics.revenueCat(sandbox, ["alice"]), 0);
  const allowed = fixture({ GA4_SEND_SANDBOX: "1" });
  assert.equal(await allowed.analytics.revenueCat(sandbox, ["alice"]), 1);
  assert.equal(allowed.calls[0].body.events[0].name, "purchase");
  assert.equal(allowed.calls[0].body.events[0].params.is_sandbox, 1);
});
test("the RevenueCat webhook reports the lifecycle to GA4 after updating memberships", async () => {
  const { store, analytics, calls } = fixture();
  const access = createAccess({ store, now: () => now });
  const expires = new Date(now + 86400000 * 30).toISOString();
  const rcFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      request_date_ms: now,
      subscriber: {
        entitlements: {
          starter: {
            expires_date: expires,
            product_identifier: "com.doyle.yumetan.starter.monthly",
          },
        },
        subscriptions: {
          "com.doyle.yumetan.starter.monthly": {
            expires_date: expires,
            store: "app_store",
          },
        },
      },
    }),
  });
  const billing = createBilling({
    access,
    env: { REVENUECAT_SECRET_API_KEY: "sk", REVENUECAT_WEBHOOK_AUTH: "hook" },
    fetch: rcFetch,
    analytics,
  });
  await analytics.rememberClient("alice", "1234567890.1700000000", "ios");
  const r = await billing.webhook("hook", {
    event: {
      type: "RENEWAL",
      app_user_id: "alice",
      product_id: "com.doyle.yumetan.starter.monthly",
      price: 3.3,
      currency: "JPY",
      price_in_purchased_currency: 490,
      transaction_id: "tx-2",
      environment: "PRODUCTION",
    },
  });
  assert.deepEqual(r, { synced: 1 });
  // The send runs after the response; let it settle.
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.client_id, "1234567890.1700000000");
  assert.equal(calls[0].body.events[0].name, "subscription_renewal");
  assert.equal(calls[0].body.events[0].params.value, 490);
  assert.equal((await store.get("memberships/alice")).plan, "starter");
  // A transfer names both sides.
  await billing.webhook("hook", {
    event: {
      type: "TRANSFER",
      transferred_from: ["alice"],
      transferred_to: ["carol"],
      environment: "PRODUCTION",
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const transfer = calls
    .slice(1)
    .map((c) => [c.body.user_id, c.body.events[0].params.transferred]);
  assert.deepEqual(transfer.sort(), [
    ["alice", "from"],
    ["carol", "to"],
  ]);
  // Webhook TEST events and unconfigured analytics never reach GA4.
  const before = calls.length;
  await billing.webhook("hook", { event: { type: "TEST" } });
  assert.equal(calls.length, before);
});
