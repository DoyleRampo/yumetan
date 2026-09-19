// Store purchases through the RevenueCat Capacitor plugin (iOS / Android only).
// The plugin only talks to the store and RevenueCat; the plan itself is granted by
// the server after it verifies the subscriber, so nothing here is trusted for access.
// Store product IDs as registered in App Store Connect / Google Play.
export const productId = (plan, cycle) => `com.doyle.yumetan.${plan}.${cycle}`;
const cancelled = (e) =>
  e?.code === "1" ||
  e?.data?.userCancelled === true ||
  /cancel/i.test(String(e?.message || ""));
export function createPurchases({ cap, plugins = {}, config } = {}) {
  const native = Boolean(cap?.isNativePlatform?.());
  const platform = native ? cap.getPlatform() : "";
  const apiKey = String(config?.revenueCat?.[platform] || "");
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
    async restore(uid) {
      const p = await ready(uid);
      await p.restorePurchases();
      return true;
    },
  };
}
