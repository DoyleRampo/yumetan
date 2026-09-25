import test from "node:test";
import assert from "node:assert/strict";
import { createPurchases, usableApiKey } from "../public/core/purchases.js";

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
