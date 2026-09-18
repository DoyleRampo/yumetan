import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createAccess } from "../server/access.js";
import { createRevenueCat } from "../server/revenuecat.js";
import { createNativeBilling } from "../public/core/native-billing.js";
import { activePlan, STORE_PRODUCTS } from "../public/core/plans.js";
const now = Date.parse("2026-09-18T12:00:00Z");
const AUTH = "shared-secret-value";
function fixture(env = {}) {
  const store = new MemoryStore(),
    access = createAccess({ store, now: () => now });
  const rc = createRevenueCat({
    access,
    env: { REVENUECAT_WEBHOOK_AUTH: AUTH, ...env },
  });
  let n = 0;
  const event = (type, extra = {}) => ({
    api_version: "1.0",
    event: {
      id: `evt_${++n}`,
      type,
      app_user_id: "alice",
      original_app_user_id: "alice",
      aliases: ["$RCAnonymousID:abc", "alice"],
      product_id: STORE_PRODUCTS.starter_monthly.appStore,
      entitlement_ids: ["starter"],
      store: "APP_STORE",
      environment: "PRODUCTION",
      period_type: "NORMAL",
      purchased_at_ms: now - 1000,
      expiration_at_ms: now + 30 * 86400000,
      event_timestamp_ms: now + n,
      ...extra,
    },
  });
  const member = () => store.get("memberships/alice");
  return { store, rc, event, member };
}
test("webhook needs the exact shared Authorization header and grants only known products", async () => {
  const f = fixture();
  await assert.rejects(
    f.rc.webhook(f.event("INITIAL_PURCHASE"), "wrong"),
    (e) => e.status === 401,
  );
  await assert.rejects(
    f.rc.webhook(f.event("INITIAL_PURCHASE"), `${AUTH}x`),
    (e) => e.status === 401,
  );
  assert.equal(await f.member(), null);
  const unknown = f.event("INITIAL_PURCHASE", { product_id: "com.other.app" });
  await f.rc.webhook(unknown, AUTH);
  assert.equal(activePlan(await f.member(), now), "free");
  const initial = f.event("INITIAL_PURCHASE");
  assert.deepEqual(await f.rc.webhook(initial, AUTH), { received: true });
  const m = await f.member();
  assert.equal(activePlan(m, now), "starter");
  assert.equal(m.cycle, "monthly");
  assert.equal(m.provider, "revenuecat");
  assert.equal(m.cancelAtPeriodEnd, false);
  // Replay of the same event id is a no-op.
  await f.rc.webhook(initial, AUTH);
  assert.deepEqual(await f.member(), m);
  // Ignored types are acknowledged without touching the member.
  const test = f.event("TEST");
  assert.deepEqual(await f.rc.webhook(test, AUTH), {
    received: true,
    ignored: true,
  });
  assert.deepEqual(await f.member(), m);
});
test("cancellation keeps access until expiry, expiration and refunds revoke, stale events lose", async () => {
  const f = fixture();
  await f.rc.webhook(
    f.event("INITIAL_PURCHASE", {
      product_id: STORE_PRODUCTS.standard_yearly.appStore,
      expiration_at_ms: now + 365 * 86400000,
    }),
    AUTH,
  );
  assert.equal(activePlan(await f.member(), now), "standard");
  await f.rc.webhook(
    f.event("CANCELLATION", {
      product_id: STORE_PRODUCTS.standard_yearly.appStore,
      cancel_reason: "UNSUBSCRIBE",
      expiration_at_ms: now + 365 * 86400000,
    }),
    AUTH,
  );
  let m = await f.member();
  assert.equal(activePlan(m, now), "standard");
  assert.equal(m.cancelAtPeriodEnd, true);
  await f.rc.webhook(
    f.event("UNCANCELLATION", {
      product_id: STORE_PRODUCTS.standard_yearly.appStore,
      expiration_at_ms: now + 365 * 86400000,
    }),
    AUTH,
  );
  assert.equal((await f.member()).cancelAtPeriodEnd, false);
  // A stale event (older timestamp) never overwrites newer state.
  await f.rc.webhook(
    f.event("EXPIRATION", { expiration_at_ms: now - 1, event_timestamp_ms: 1 }),
    AUTH,
  );
  assert.equal(activePlan(await f.member(), now), "standard");
  // Refund: RevenueCat sets expiration to the refund time.
  await f.rc.webhook(
    f.event("CANCELLATION", {
      product_id: STORE_PRODUCTS.standard_yearly.appStore,
      cancel_reason: "CUSTOMER_SUPPORT",
      expiration_at_ms: now - 10,
    }),
    AUTH,
  );
  m = await f.member();
  assert.equal(activePlan(m, now), "free");
  assert.equal(m.paidUntil, 0);
  await f.rc.webhook(
    f.event("EXPIRATION", { expiration_at_ms: now + 5000 }),
    AUTH,
  );
  assert.equal(activePlan(await f.member(), now), "free");
});
test("sandbox events are ignored unless allowed; anonymous IDs never map to members; Stripe access is not shortened", async () => {
  const f = fixture();
  await f.rc.webhook(
    f.event("INITIAL_PURCHASE", { environment: "SANDBOX" }),
    AUTH,
  );
  assert.equal(await f.member(), null);
  const sandbox = fixture({ REVENUECAT_ALLOW_SANDBOX: "true" });
  await sandbox.rc.webhook(
    sandbox.event("INITIAL_PURCHASE", { environment: "SANDBOX" }),
    AUTH,
  );
  assert.equal(activePlan(await sandbox.member(), now), "starter");
  await f.rc.webhook(
    f.event("INITIAL_PURCHASE", {
      app_user_id: "$RCAnonymousID:zzz",
      original_app_user_id: "$RCAnonymousID:zzz",
      aliases: ["$RCAnonymousID:zzz"],
    }),
    AUTH,
  );
  assert.equal(await f.member(), null);
  assert.equal(await f.store.get("memberships/$RCAnonymousID:zzz"), null);
  // A Stripe subscription valid for a year keeps access when a shorter store event arrives.
  f.store.data.set("memberships/alice", {
    plan: "standard",
    status: "active",
    subscriptionId: "sub_x",
    customerId: "cus_x",
    paidUntil: now + 300 * 86400000,
  });
  await f.rc.webhook(
    f.event("EXPIRATION", { expiration_at_ms: now - 1 }),
    AUTH,
  );
  const m = await f.member();
  assert.equal(activePlan(m, now), "standard");
  assert.equal(m.subscriptionId, "sub_x");
  // Store purchase that outlasts the Stripe period does take over.
  await f.rc.webhook(
    f.event("INITIAL_PURCHASE", {
      product_id: STORE_PRODUCTS.starter_yearly.appStore,
      expiration_at_ms: now + 400 * 86400000,
    }),
    AUTH,
  );
  const taken = await f.member();
  assert.equal(taken.provider, "revenuecat");
  assert.equal(taken.plan, "starter");
  assert.equal(taken.customerId, "cus_x");
});
test("unconfigured webhook refuses; native billing is inert outside iOS and needs a signed-in member", async () => {
  const off = createRevenueCat({
    access: createAccess({ store: new MemoryStore(), now: () => now }),
    env: {},
  });
  assert.equal(off.configured, false);
  await assert.rejects(off.webhook({}, ""), (e) => e.status === 503);
  const web = createNativeBilling({ cap: undefined, config: {} });
  assert.equal(web.available(), false);
  await web.identify("alice");
  await assert.rejects(
    web.purchase("starter", "monthly"),
    (e) => e.code === "billingUnavailable",
  );
  const calls = [];
  const plugin = {
    configure: async (o) => calls.push(["configure", o]),
    logIn: async (o) => calls.push(["logIn", o]),
    logOut: async () => calls.push(["logOut"]),
    getOfferings: async () => ({
      current: {
        availablePackages: [
          {
            identifier: "$rc_monthly",
            product: { identifier: STORE_PRODUCTS.standard_monthly.appStore },
          },
        ],
      },
      all: {
        default: {
          availablePackages: [
            {
              identifier: "starter_yearly",
              product: { identifier: STORE_PRODUCTS.starter_yearly.appStore },
            },
          ],
        },
      },
    }),
    purchasePackage: async (o) => {
      calls.push(["purchase", o.aPackage.identifier]);
      if (o.aPackage.identifier === "starter_yearly")
        throw { code: "1", message: "Purchase was cancelled." };
      return {};
    },
    restorePurchases: async () => calls.push(["restore"]),
  };
  const cap = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    registerPlugin: () => plugin,
  };
  const ios = createNativeBilling({
    cap,
    config: { revenuecatApiKey: "appl_x" },
  });
  assert.equal(ios.available(), true);
  await assert.rejects(
    ios.purchase("standard", "monthly"),
    (e) => e.code === "loginRequired",
  );
  await ios.identify(null);
  assert.deepEqual(calls[0], ["configure", { apiKey: "appl_x" }]);
  await ios.identify("alice");
  assert.deepEqual(calls[1], ["logIn", { appUserID: "alice" }]);
  await ios.identify("alice");
  assert.equal(calls.length, 2);
  await ios.purchase("standard", "monthly");
  assert.deepEqual(calls[2], ["purchase", "$rc_monthly"]);
  await assert.rejects(
    ios.purchase("starter", "yearly"),
    (e) => e.code === "purchaseCancelled",
  );
  await assert.rejects(
    ios.purchase("starter", "monthly"),
    (e) => e.code === "billingUnavailable",
  );
  await ios.restore();
  await ios.identify(null);
  assert.deepEqual(calls.at(-1), ["logOut"]);
  assert.equal(ios.user(), null);
});
