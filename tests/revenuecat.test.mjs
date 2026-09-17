import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createAccess } from "../server/access.js";
import { createBilling } from "../server/billing.js";
import { createRevenueCat, subscriberPlan } from "../server/revenuecat.js";
import { packagePlan } from "../public/core/store-billing.js";
const now = Date.parse("2026-09-17T00:00:00Z");
const day = 86400000;
const iso = (offset) => new Date(now + offset).toISOString();
const env = {
  REVENUECAT_SECRET_API_KEY: "sk_test_fixture",
  REVENUECAT_WEBHOOK_AUTH: "Bearer hook-secret",
};
function fixture({ subscribers = {}, env: extra = {} } = {}) {
  const store = new MemoryStore(),
    access = createAccess({ store, now: () => now });
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init });
    const id = decodeURIComponent(url.split("/v1/subscribers/")[1]);
    if (subscribers[id] === "fail") return { ok: false, status: 500 };
    return {
      ok: true,
      json: async () => ({
        subscriber: subscribers[id] || { entitlements: {}, subscriptions: {} },
      }),
    };
  };
  const revenuecat = createRevenueCat({
    access,
    env: { ...env, ...extra },
    fetch,
  });
  return { store, access, revenuecat, requests, subscribers };
}
const paid = (plan, product, offset = 30 * day, sub = {}) => ({
  entitlements: {
    [plan]: { expires_date: iso(offset), product_identifier: product },
  },
  subscriptions: { [product]: { store: "app_store", ...sub } },
});
test("entitlements map to the best unexpired plan and the cycle comes from the product id", () => {
  assert.equal(
    subscriberPlan({ entitlements: {}, subscriptions: {} }, now).plan,
    "free",
  );
  const both = {
    entitlements: {
      starter: {
        expires_date: iso(10 * day),
        product_identifier: "yumetan_starter_monthly",
      },
      standard: {
        expires_date: iso(300 * day),
        product_identifier: "yumetan_standard_yearly",
      },
    },
    subscriptions: {
      yumetan_standard_yearly: {
        store: "play_store",
        unsubscribe_detected_at: iso(-day),
      },
    },
  };
  const state = subscriberPlan(both, now);
  assert.equal(state.plan, "standard");
  assert.equal(state.cycle, "yearly");
  assert.equal(state.paidUntil, now + 300 * day);
  assert.equal(state.willRenew, false);
  assert.equal(state.store, "play_store");
  both.entitlements.standard.expires_date = iso(-day);
  assert.equal(subscriberPlan(both, now).plan, "starter");
  assert.equal(subscriberPlan(both, now).cycle, "monthly");
  assert.equal(
    subscriberPlan(paid("starter", "p", day, { is_sandbox: true }), now, {
      acceptSandbox: false,
    }).plan,
    "free",
  );
  assert.deepEqual(packagePlan("yumetan_standard_yearly"), {
    plan: "standard",
    cycle: "yearly",
  });
  assert.deepEqual(packagePlan("yumetan_starter:monthly", "MONTHLY"), {
    plan: "starter",
    cycle: "monthly",
  });
  assert.equal(packagePlan("coins_100").plan, null);
});
test("sync reads the subscriber with the server key and grants, then revokes, a store plan", async () => {
  const s = fixture({
    subscribers: { alice: paid("starter", "yumetan_starter_monthly") },
  });
  const billing = createBilling({ access: s.access, env: {}, stripe: null });
  await s.revenuecat.sync("alice");
  assert.equal(
    s.requests[0].url,
    "https://api.revenuecat.com/v1/subscribers/alice",
  );
  assert.equal(
    s.requests[0].init.headers.Authorization,
    "Bearer sk_test_fixture",
  );
  let account = await billing.account("alice");
  assert.equal(account.plan, "starter");
  assert.equal(account.source, "revenuecat");
  assert.equal(account.store, "app_store");
  assert.equal(account.paidUntil, now + 30 * day);
  assert.equal((await s.access.paid("alice")).plan, "starter");
  s.subscribers.alice = { entitlements: {}, subscriptions: {} };
  await s.revenuecat.sync("alice");
  account = await billing.account("alice");
  assert.equal(account.plan, "free");
  assert.equal((await s.store.get("memberships/alice")).status, "expired");
});
test("sync never grants without RevenueCat, on API failure, or for invalid ids", async () => {
  const off = fixture({ env: { REVENUECAT_SECRET_API_KEY: "" } });
  assert.equal(off.revenuecat.configured, false);
  await assert.rejects(off.revenuecat.sync("alice"), (e) => e.status === 503);
  const s = fixture({ subscribers: { alice: "fail" } });
  await assert.rejects(s.revenuecat.sync("alice"), (e) => e.status === 503);
  assert.equal(await s.store.get("memberships/alice"), null);
  await assert.rejects(s.revenuecat.sync("../x"), (e) => e.status === 400);
  await assert.rejects(
    s.revenuecat.sync("$RCAnonymousID:abc"),
    (e) => e.status === 400,
  );
});
test("a paying Stripe member is never downgraded by a store sync; a higher store plan wins", async () => {
  const s = fixture({ subscribers: {} });
  const stripeMember = {
    customerId: "cus_a",
    subscriptionId: "sub_a",
    plan: "starter",
    cycle: "monthly",
    status: "active",
    paidUntil: now + 20 * day,
  };
  s.store.data.set("memberships/alice", stripeMember);
  await s.revenuecat.sync("alice");
  let member = await s.store.get("memberships/alice");
  assert.equal(member.plan, "starter");
  assert.equal(member.status, "active");
  assert.equal(member.source, undefined);
  assert.equal(member.revenuecat.plan, "free");
  s.subscribers.alice = paid("starter", "yumetan_starter_yearly", 365 * day);
  await s.revenuecat.sync("alice");
  member = await s.store.get("memberships/alice");
  assert.equal(member.cycle, "monthly", "equal rank keeps Stripe");
  assert.equal(member.source, undefined);
  s.subscribers.alice = paid("standard", "yumetan_standard_monthly");
  await s.revenuecat.sync("alice");
  member = await s.store.get("memberships/alice");
  assert.equal(member.plan, "standard");
  assert.equal(member.source, "revenuecat");
  assert.equal(member.subscriptionId, "sub_a", "Stripe mapping is preserved");
});
test("Stripe checkout refuses a second subscription for a store member; unpaid Stripe events keep the store plan", async () => {
  const s = fixture({
    subscribers: { alice: paid("starter", "yumetan_starter_monthly") },
  });
  await s.revenuecat.sync("alice");
  const stripeEnv = {
    STRIPE_WEBHOOK_SECRET: "whsec",
    PUBLIC_APP_URL: "https://example.test",
    STRIPE_PRICE_STARTER_MONTHLY: "p_sm",
    STRIPE_PRICE_STARTER_YEARLY: "p_sy",
    STRIPE_PRICE_STANDARD_MONTHLY: "p_tm",
    STRIPE_PRICE_STANDARD_YEARLY: "p_ty",
  };
  const price = {
    id: "p_sm",
    active: true,
    currency: "jpy",
    unit_amount: 490,
    recurring: { interval: "month", interval_count: 1 },
  };
  const stripe = {
    prices: { retrieve: async () => price },
    webhooks: {
      constructEvent: () => ({
        id: "evt_c",
        created: 5,
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_old" } },
      }),
    },
    subscriptions: {
      retrieve: async () => ({
        id: "sub_old",
        customer: "cus_a",
        status: "canceled",
        items: { data: [{ price, quantity: 1 }] },
        latest_invoice: { status: "paid" },
        cancel_at_period_end: false,
      }),
    },
  };
  const billing = createBilling({ access: s.access, env: stripeEnv, stripe });
  await assert.rejects(
    billing.checkout({ uid: "alice" }, { plan: "standard", cycle: "monthly" }),
    (e) => e.code === "manageSubscription",
  );
  const member = await s.store.get("memberships/alice");
  s.store.data.set("memberships/alice", { ...member, customerId: "cus_a" });
  s.store.data.set("billingCustomers/cus_a", { uid: "alice" });
  await billing.webhook(Buffer.from("{}"), "sig");
  assert.equal((await billing.account("alice")).plan, "starter");
});
test("webhook requires the configured Authorization value and re-reads every referenced subscriber", async () => {
  const s = fixture({
    subscribers: {
      alice: paid("standard", "yumetan_standard_yearly", 300 * day),
      bob: paid("starter", "yumetan_starter_monthly"),
    },
  });
  const event = (extra) => ({
    api_version: "1.0",
    event: {
      type: "INITIAL_PURCHASE",
      app_user_id: "alice",
      original_app_user_id: "$RCAnonymousID:zzz",
      aliases: ["alice", "$RCAnonymousID:zzz"],
      ...extra,
    },
  });
  await assert.rejects(
    s.revenuecat.webhook(event(), "Bearer wrong"),
    (e) => e.status === 401,
  );
  await assert.rejects(
    s.revenuecat.webhook(event(), undefined),
    (e) => e.status === 401,
  );
  assert.equal(await s.store.get("memberships/alice"), null);
  assert.deepEqual(await s.revenuecat.webhook(event(), "Bearer hook-secret"), {
    synced: ["alice"],
  });
  assert.equal((await s.store.get("memberships/alice")).plan, "standard");
  assert.deepEqual(
    await s.revenuecat.webhook(
      { event: { type: "TEST", app_user_id: "bob" } },
      "Bearer hook-secret",
    ),
    { synced: [] },
  );
  assert.equal(await s.store.get("memberships/bob"), null);
  await s.revenuecat.webhook(
    {
      event: {
        type: "TRANSFER",
        transferred_from: ["alice"],
        transferred_to: ["bob"],
      },
    },
    "Bearer hook-secret",
  );
  assert.equal((await s.store.get("memberships/bob")).plan, "starter");
  await assert.rejects(
    s.revenuecat.webhook({ nope: true }, "Bearer hook-secret"),
    (e) => e.status === 400,
  );
  const noHook = fixture({ env: { REVENUECAT_WEBHOOK_AUTH: "" } });
  await assert.rejects(
    noHook.revenuecat.webhook(event(), "Bearer hook-secret"),
    (e) => e.status === 503,
  );
});
