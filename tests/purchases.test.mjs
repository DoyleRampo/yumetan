import test from "node:test";
import assert from "node:assert/strict";
import {
  createPurchases,
  usableApiKey,
  planFromCustomerInfo,
  planFromProduct,
} from "../public/core/purchases.js";

const cap = (platform = "ios") => ({
  isNativePlatform: () => true,
  getPlatform: () => platform,
});
const fakePlugin = () => {
  const calls = [];
  return {
    calls,
    async configure(o) {
      calls.push(["configure", o]);
    },
    async logIn(o) {
      calls.push(["logIn", o]);
    },
    async restorePurchases() {
      calls.push(["restore"]);
    },
  };
};

test("usableApiKey only accepts public SDK keys unless Test Store is opted in", () => {
  assert.equal(usableApiKey("appl_abc"), "appl_abc");
  assert.equal(usableApiKey("goog_abc"), "goog_abc");
  assert.equal(usableApiKey("sk_secret"), "");
  assert.equal(usableApiKey("test_HuMAXx"), "");
  assert.equal(usableApiKey("test_HuMAXx", true), "test_HuMAXx");
  assert.equal(usableApiKey(""), "");
  assert.equal(usableApiKey(undefined), "");
});

test("a Test Store key never reaches the SDK in a normal build", async () => {
  const Purchases = fakePlugin();
  const p = createPurchases({
    cap: cap(),
    plugins: { Purchases },
    config: { revenueCat: { ios: "test_HuMAXx" } },
  });
  assert.equal(p.available(), false);
  await assert.rejects(p.restore("uid1"), { code: "billingUnavailable" });
  assert.deepEqual(Purchases.calls, []);
});

test("a Test Store key is used only when the build opted in", async () => {
  const Purchases = fakePlugin();
  const p = createPurchases({
    cap: cap(),
    plugins: { Purchases },
    config: { revenueCat: { ios: "test_HuMAXx", allowTestStore: true } },
  });
  assert.equal(p.available(), true);
  await p.restore("uid1");
  assert.deepEqual(Purchases.calls[0], [
    "configure",
    { apiKey: "test_HuMAXx", appUserID: "uid1" },
  ]);
});

test("a public key configures once per user and logs in on user change", async () => {
  const Purchases = fakePlugin();
  const p = createPurchases({
    cap: cap(),
    plugins: { Purchases },
    config: { revenueCat: { ios: "appl_public" } },
  });
  assert.equal(p.available(), true);
  await p.restore("uid1");
  await p.restore("uid1");
  await p.restore("uid2");
  assert.deepEqual(
    Purchases.calls.map((c) => c[0]),
    ["configure", "restore", "restore", "logIn", "restore"],
  );
  assert.equal(Purchases.calls[0][1].apiKey, "appl_public");
});

test("a purchase resolves to the store's customer info, a cancellation to false", async () => {
  const info = { activeSubscriptions: ["com.doyle.yumetan.starter.monthly"] };
  let cancel = false;
  const Purchases = {
    ...fakePlugin(),
    async getOfferings() {
      return {
        current: {
          availablePackages: [
            { product: { identifier: "com.doyle.yumetan.starter.monthly" } },
          ],
        },
      };
    },
    async purchasePackage() {
      if (cancel) throw { code: "1", data: { userCancelled: true } };
      return { customerInfo: info };
    },
  };
  const p = createPurchases({
    cap: cap(),
    plugins: { Purchases },
    config: { revenueCat: { ios: "appl_public" } },
  });
  assert.equal(await p.buy("uid1", "starter", "monthly"), info);
  cancel = true;
  assert.equal(await p.buy("uid1", "starter", "monthly"), false);
});

test("the plan the store confirmed is read from entitlements or active products", () => {
  const now = Date.parse("2026-09-22T00:00:00Z"),
    later = now + 86400000 * 30;
  assert.equal(
    planFromProduct("com.doyle.yumetan.standard.yearly"),
    "standard",
  );
  assert.equal(planFromProduct("yumetan_starter_monthly"), "starter");
  assert.equal(planFromProduct("com.doyle.yumetan.lifetime"), null);
  assert.deepEqual(
    planFromCustomerInfo(
      {
        entitlements: {
          active: {
            starter: {
              productIdentifier: "com.doyle.yumetan.starter.monthly",
              expirationDateMillis: later,
            },
          },
        },
        activeSubscriptions: ["com.doyle.yumetan.starter.monthly"],
      },
      now,
    ),
    { plan: "starter", paidUntil: later },
  );
  // No entitlement configured yet: the active product still names the plan.
  assert.deepEqual(
    planFromCustomerInfo(
      {
        entitlements: { active: {} },
        activeSubscriptions: ["com.doyle.yumetan.standard.monthly"],
        allExpirationDates: {
          "com.doyle.yumetan.standard.monthly": new Date(later).toISOString(),
        },
      },
      now,
    ),
    { plan: "standard", paidUntil: later },
  );
  assert.equal(
    planFromCustomerInfo(
      {
        entitlements: { active: {} },
        activeSubscriptions: ["com.doyle.yumetan.starter.monthly"],
        allExpirationDates: {
          "com.doyle.yumetan.starter.monthly": new Date(now - 1).toISOString(),
        },
      },
      now,
    ),
    null,
  );
  assert.equal(planFromCustomerInfo(true), null);
});
test("a test-store build is reported so a simulated purchase is never taken for a real one", () => {
  const build = (key, allowTestStore) =>
    createPurchases({
      cap: { isNativePlatform: () => true, getPlatform: () => "ios" },
      plugins: { Purchases: {} },
      config: {
        revenueCat: {
          ios: key,
          ...(allowTestStore ? { allowTestStore: true } : {}),
        },
      },
    });
  const simulated = build("test_abc", true);
  assert.equal(simulated.available(), true);
  assert.equal(simulated.testStore(), true);
  const store = build("appl_abc");
  assert.equal(store.available(), true);
  assert.equal(store.testStore(), false);
  // A test key without the opt-in is dropped entirely, so nothing can be bought.
  const rejected = build("test_abc");
  assert.equal(rejected.available(), false);
  assert.equal(rejected.testStore(), false);
});

test("store prices are keyed by the base product ID for display next to the purchase button", async () => {
  const Purchases = fakePlugin();
  Purchases.getOfferings = async () => ({
    current: {
      availablePackages: [
        {
          product: {
            identifier: "com.doyle.yumetan.starter.monthly",
            priceString: "¥490",
          },
        },
        {
          product: {
            identifier: "com.doyle.yumetan.standard.yearly:standard-yearly",
            priceString: "¥9,800",
          },
        },
        { product: { identifier: "com.doyle.yumetan.no.price" } },
      ],
    },
    all: {},
  });
  const p = createPurchases({
    cap: cap(),
    plugins: { Purchases },
    config: { revenueCat: { ios: "appl_public" } },
  });
  assert.deepEqual(await p.prices("uid1"), {
    "com.doyle.yumetan.starter.monthly": "¥490",
    "com.doyle.yumetan.standard.yearly": "¥9,800",
  });
  await assert.rejects(
    createPurchases({ cap: cap(), plugins: { Purchases }, config: {} }).prices(
      "uid1",
    ),
    { code: "billingUnavailable" },
  );
});
