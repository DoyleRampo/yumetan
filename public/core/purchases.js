// Store purchases through the RevenueCat Capacitor plugin (iOS / Android only).
// The plugin only talks to the store and RevenueCat; the plan itself is granted by
// the server after it verifies the subscriber, so nothing here is trusted for access.
// Store product IDs as registered in App Store Connect / Google Play.
export const productId = (plan, cycle) => `com.doyle.yumetan.${plan}.${cycle}`;
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
      try {
        await p.purchasePackage({ aPackage: pkg });
      } catch (e) {
        if (cancelled(e)) return false;
        throw Object.assign(new Error("purchaseFailed"), {
          code: "purchaseFailed",
          cause: e,
        });
      }
      return true;
    },
    // Localized store prices ({ productId: "¥490" }) for display next to the purchase
    // button, so the amount shown is what the store will actually charge.
    async prices(uid) {
      const p = await ready(uid);
      const offerings = await p.getOfferings();
      const out = {};
      for (const o of [
        offerings.current,
        ...Object.values(offerings.all || {}),
      ])
        for (const x of o?.availablePackages || []) {
          const id = String(x.product?.identifier || "")
            .split(":")[0]
            .toLowerCase();
          if (id && x.product?.priceString && !out[id])
            out[id] = x.product.priceString;
        }
      return out;
    },
    async restore(uid) {
      const p = await ready(uid);
      await p.restorePurchases();
      return true;
    },
  };
}
