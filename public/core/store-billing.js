// App Store / Google Play subscriptions through the RevenueCat Capacitor plugin.
// The plugin only runs inside the native apps; on the web this module reports
// itself unavailable and the Stripe flow remains. Entitlements are never trusted
// here: after a purchase or restore the caller asks the server to re-read the
// subscriber from RevenueCat, which is what grants the plan.
const PLAN_PATTERN = { standard: /standard/i, starter: /starter/i };
export const packagePlan = (productId = "", packageType = "") => ({
  plan: PLAN_PATTERN.standard.test(productId)
    ? "standard"
    : PLAN_PATTERN.starter.test(productId)
      ? "starter"
      : null,
  cycle:
    /year|annual/i.test(productId) || packageType === "ANNUAL"
      ? "yearly"
      : "monthly",
});
const code = (value, fallback) =>
  Object.assign(new Error(value), { code: value, cause: fallback });
export function createStoreBilling({ cap, config } = {}) {
  const native = Boolean(cap?.isNativePlatform?.());
  const platform = cap?.getPlatform?.() || "web";
  const apiKey = () =>
    platform === "ios"
      ? config?.ios || ""
      : platform === "android"
        ? config?.android || ""
        : "";
  const plugin = () =>
    cap?.Plugins?.Purchases || cap?.registerPlugin?.("Purchases") || null;
  let ready = null;
  const available = () => native && Boolean(apiKey()) && Boolean(plugin());
  async function setup(uid) {
    const p = plugin();
    const { isConfigured } = await p.isConfigured().catch(() => ({}));
    if (!isConfigured) {
      // The Firebase UID is the RevenueCat app user ID, so the server can read the
      // same subscriber. Guests stay anonymous inside RevenueCat.
      await p.configure({ apiKey: apiKey(), appUserID: uid || null });
      return;
    }
    await identify(uid);
  }
  async function identify(uid) {
    const p = plugin();
    if (uid) {
      const { appUserID } = await p.getAppUserID();
      if (appUserID !== uid) await p.logIn({ appUserID: uid });
      return;
    }
    const { isAnonymous } = await p.isAnonymous();
    if (!isAnonymous) await p.logOut();
  }
  const failure = (e) => {
    if (e?.userCancelled || e?.data?.userCancelled || String(e?.code) === "1")
      return code("purchaseCancelled", e);
    return code("storeUnavailable", e);
  };
  return {
    available,
    platform,
    async configure(uid) {
      if (!available()) return false;
      ready = setup(uid).catch((e) => {
        ready = null;
        throw e;
      });
      await ready;
      return true;
    },
    async identify(uid) {
      if (!available() || !ready) return;
      await ready;
      await identify(uid).catch(() => {});
    },
    async packages() {
      if (!available() || !ready) throw code("storeUnavailable");
      await ready;
      const { current } = await plugin().getOfferings();
      return (current?.availablePackages || [])
        .map((pkg) => ({
          ...packagePlan(pkg.product?.identifier, pkg.packageType),
          price: pkg.product?.priceString || "",
          pkg,
        }))
        .filter((x) => x.plan);
    },
    async purchase(plan, cycle) {
      const found = (await this.packages()).find(
        (x) => x.plan === plan && x.cycle === cycle,
      );
      if (!found) throw code("storeProductMissing");
      try {
        const { customerInfo } = await plugin().purchasePackage({
          aPackage: found.pkg,
        });
        return customerInfo;
      } catch (e) {
        throw failure(e);
      }
    },
    async restore() {
      if (!available() || !ready) throw code("storeUnavailable");
      await ready;
      try {
        return (await plugin().restorePurchases()).customerInfo;
      } catch (e) {
        throw failure(e);
      }
    },
    async managementUrl() {
      if (!available() || !ready) return null;
      await ready;
      const { customerInfo } = await plugin().getCustomerInfo();
      const url = customerInfo?.managementURL || "";
      return /^https:\/\//.test(url) ? url : null;
    },
  };
}
