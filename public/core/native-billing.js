// App Store purchases through the RevenueCat Capacitor plugin (iOS only).
// This module only starts store flows and identifies the member; the plan itself is
// granted by the server when RevenueCat's webhook arrives (server/revenuecat.js).
import { STORE_PRODUCTS } from "./plans.js";
const code = (c) => Object.assign(new Error(c), { code: c });
const cancelled = (e) =>
  e?.userCancelled === true ||
  String(e?.code) === "1" ||
  /cancel/i.test(String(e?.message || ""));
export function createNativeBilling({
  cap = globalThis.window?.Capacitor,
  config = globalThis.window?.YUMETAN_CONFIG,
} = {}) {
  const apiKey = String(config?.revenuecatApiKey || "");
  const available = Boolean(
    cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios" && apiKey,
  );
  let plugin = null,
    configured = false,
    currentUser = null;
  const rc = () => {
    if (!plugin)
      plugin =
        cap.Plugins?.PurchasesPlugin || cap.registerPlugin("PurchasesPlugin");
    return plugin;
  };
  // Firebase UID becomes the RevenueCat app user ID so the webhook can find the member.
  async function identify(uid) {
    if (!available) return;
    const id =
      typeof uid === "string" && uid && !uid.startsWith("$") ? uid : null;
    if (!configured) {
      await rc().configure({
        apiKey,
        ...(id ? { appUserID: id } : {}),
      });
      configured = true;
      currentUser = id;
      return;
    }
    if (id && id !== currentUser) {
      await rc().logIn({ appUserID: id });
      currentUser = id;
    } else if (!id && currentUser) {
      await rc()
        .logOut()
        .catch(() => {});
      currentUser = null;
    }
  }
  async function purchase(plan, cycle) {
    if (!available) throw code("billingUnavailable");
    if (!currentUser) throw code("loginRequired");
    const wanted = STORE_PRODUCTS[`${plan}_${cycle}`]?.appStore;
    if (!wanted) throw code("invalidInput");
    const offerings = await rc().getOfferings();
    const packages = [
      ...(offerings?.current?.availablePackages || []),
      ...Object.values(offerings?.all || {}).flatMap(
        (o) => o?.availablePackages || [],
      ),
    ];
    const pkg = packages.find((p) => p?.product?.identifier === wanted);
    if (!pkg) throw code("billingUnavailable");
    try {
      await rc().purchasePackage({ aPackage: pkg });
    } catch (e) {
      throw code(cancelled(e) ? "purchaseCancelled" : "purchaseFailed");
    }
  }
  async function restore() {
    if (!available) throw code("billingUnavailable");
    await rc().restorePurchases();
  }
  return {
    available: () => available,
    identify,
    purchase,
    restore,
    user: () => currentUser,
  };
}
