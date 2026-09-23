// Store purchases through the RevenueCat Capacitor plugin (iOS / Android only).
// The plugin only talks to the store and RevenueCat; the plan itself is granted by
// the server after it verifies the subscriber, so nothing here is trusted for access.
// Store product IDs as registered in App Store Connect / Google Play.
export const productId = (plan, cycle) => `com.doyle.yumetan.${plan}.${cycle}`;
const PLAN_ORDER = ["standard", "starter"];
const cancelled = (e) =>
  e?.code === "1" ||
  e?.data?.userCancelled === true ||
  /cancel/i.test(String(e?.message || ""));
// RevenueCat Test Store keys (test_...) only work in Debug builds: in a Release build
// (TestFlight / App Store) the SDK shows "Wrong API Key" on configure and then exits
// the app. Never hand such a key to the SDK unless the build opted in explicitly.
export const usableApiKey = (key, allowTestStore = false) => {
  const k = String(key || "");
  if (!k || k.startsWith("sk_")) return "";
  if (k.startsWith("test_") && !allowTestStore) return "";
  return k;
};
// The plan a product ID names (com.doyle.yumetan.<plan>.<cycle> or any ID
// containing the plan word). Mirrors server/billing.js.
export const planFromProduct = (product) =>
  PLAN_ORDER.find((plan) =>
    new RegExp(`(^|[._-])${plan}([._-]|$)`, "i").test(String(product || "")),
  ) || null;
// What the store itself just confirmed: read from the CustomerInfo the SDK
// returns after a purchase or restore. Used only to show the plan right away
// while the server catches up; quotas still follow the server-verified plan.
export function planFromCustomerInfo(info, now = Date.now()) {
  if (!info || typeof info !== "object") return null;
  const found = [];
  const active = info.entitlements?.active || {};
  for (const [id, e] of Object.entries(active)) {
    // The product bought decides, as on the server; the entitlement's name is
    // only the fallback.
    const plan = planFromProduct(e?.productIdentifier) || planFromProduct(id);
    const until =
      Number(e?.expirationDateMillis) || Date.parse(e?.expirationDate || "");
    if (plan && (!Number.isFinite(until) || until > now))
      found.push({
        plan,
        paidUntil: Number.isFinite(until) ? until : now + 86400000,
      });
  }
  const expirations = info.allExpirationDates || {};
  for (const product of info.activeSubscriptions || []) {
    const plan = planFromProduct(product);
    if (!plan) continue;
    const until = Date.parse(
      expirations[product] || info.latestExpirationDate || "",
    );
    if (Number.isFinite(until) && until <= now) continue;
    found.push({
      plan,
      paidUntil: Number.isFinite(until) ? until : now + 86400000,
    });
  }
  found.sort(
    (a, b) =>
      PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan) ||
      b.paidUntil - a.paidUntil,
  );
  return found[0] || null;
}
export function createPurchases({ cap, plugins = {}, config } = {}) {
  const native = Boolean(cap?.isNativePlatform?.());
  const platform = native ? cap.getPlatform() : "";
  const apiKey = usableApiKey(
    config?.revenueCat?.[platform],
    config?.revenueCat?.allowTestStore === true,
  );
  let plugin = null,
    configuredFor = null;
  const available = () =>
    Boolean(native && apiKey && (plugins.Purchases || cap?.registerPlugin));
  // RevenueCat's Test Store completes a purchase without the App Store or Play
  // sheet and without charging anything. A build that uses it must say so, or a
  // simulated subscription looks exactly like a real one.
  const testStore = () => apiKey.startsWith("test_");
  async function ready(uid) {
    if (!available())
      throw Object.assign(new Error("billingUnavailable"), {
        code: "billingUnavailable",
      });
    if (!uid)
      throw Object.assign(new Error("loginRequired"), {
        code: "loginRequired",
      });
    plugin = plugin || plugins.Purchases || cap.registerPlugin("Purchases");
    // RevenueCat's App User ID is the Firebase UID so the server can map purchases.
    if (!configuredFor) await plugin.configure({ apiKey, appUserID: uid });
    else if (configuredFor !== uid) await plugin.logIn({ appUserID: uid });
    configuredFor = uid;
    return plugin;
  }
  return {
    available,
    testStore,
    // Resolves to the store's CustomerInfo (or true when the plugin returns
    // none) after a completed purchase, and to false when the user cancelled.
    async buy(uid, plan, cycle) {
      const p = await ready(uid);
      const offerings = await p.getOfferings();
      const wanted = productId(plan, cycle);
      const packages = [
        ...(offerings.current?.availablePackages || []),
        ...Object.values(offerings.all || {}).flatMap(
          (o) => o.availablePackages || [],
        ),
      ];
      // Google Play subscriptions are reported as "product:basePlan". Prefer the
      // exact com.doyle.yumetan.<plan>.<cycle> ID, then any ID naming the same plan and cycle.
      const base = (x) =>
        String(x.product?.identifier || "")
          .split(":")[0]
          .toLowerCase();
      const period = cycle === "yearly" ? /year|annual/ : /month/;
      const pkg =
        packages.find((x) => base(x) === wanted) ||
        packages.find((x) => base(x).includes(plan) && period.test(base(x)));
      if (!pkg)
        throw Object.assign(new Error("productUnavailable"), {
          code: "productUnavailable",
        });
      let result;
      try {
        result = await p.purchasePackage({ aPackage: pkg });
      } catch (e) {
        if (cancelled(e)) return false;
        throw Object.assign(new Error("purchaseFailed"), {
          code: "purchaseFailed",
          cause: e,
        });
      }
      return result?.customerInfo || true;
    },
    async restore(uid) {
      const p = await ready(uid);
      const result = await p.restorePurchases();
      return result?.customerInfo || true;
    },
    // What the store knows on this device now (a cancellation, an expiry, a
    // switch made in the store's own settings), or null when it cannot say.
    async customerInfo(uid) {
      const p = await ready(uid);
      const result = await p.getCustomerInfo();
      return result?.customerInfo || null;
    },
  };
}
