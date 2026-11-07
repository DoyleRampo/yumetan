import { createHash } from "node:crypto";
import { memberPath } from "./access.js";
import { planFromProduct, cycleFromProduct } from "./billing.js";
// Server-side Google Analytics 4 through the Measurement Protocol, for what
// only the server learns: the subscription's life after the purchase screen
// (RevenueCat's webhook: renewals, cancellations, expirations, refunds, billing
// issues, plan switches). The app itself reports every screen and tap with
// gtag.js (public/core/analytics.js); the two meet in GA4 on the same
// client_id (sent by the app in the X-Yumetan-Analytics header and remembered
// in memberships/{uid}.analytics) and on user_id (the Firebase UID).
//
// Needs GA4_MEASUREMENT_ID (the app's web stream, G-…) and GA4_API_SECRET (a
// Measurement Protocol secret of that stream; `npm run ga4:setup` creates one).
// Without them nothing is sent; a failed send is logged and never fails the
// webhook. Sandbox (TestFlight) purchases are skipped unless
// GA4_SEND_SANDBOX=1, so revenue reports only ever hold real payments.
export const MP_URL = "https://www.google-analytics.com/mp/collect";
export const MP_DEBUG_URL = "https://www.google-analytics.com/debug/mp/collect";
// RevenueCat event type → GA4 event name. `purchase` and `refund` are GA4's
// own e-commerce events (they feed the Monetization reports); the rest are
// custom events of this app.
export const RC_EVENTS = {
  INITIAL_PURCHASE: "purchase",
  NON_RENEWING_PURCHASE: "purchase",
  RENEWAL: "subscription_renewal",
  PRODUCT_CHANGE: "subscription_change",
  CANCELLATION: "subscription_cancel",
  UNCANCELLATION: "subscription_uncancel",
  EXPIRATION: "subscription_expire",
  BILLING_ISSUE: "subscription_billing_issue",
  SUBSCRIPTION_PAUSED: "subscription_pause",
  SUBSCRIPTION_EXTENDED: "subscription_extend",
  TRANSFER: "subscription_transfer",
  TEMPORARY_ENTITLEMENT_GRANT: "subscription_grant",
};
const CLIENT_PATTERN = /^\d{6,12}\.\d{6,12}$/;
export const validClientId = (id) => CLIENT_PATTERN.test(String(id || ""));
// GA4 client ids are "<digits>.<digits>". A member the app never reported a
// client id for (a webhook before any API call from the new app version) gets
// a stable one derived from the UID, so repeated events still form one user.
export function clientIdFor(uid, stored = null) {
  if (validClientId(stored)) return stored;
  const hex = createHash("sha256").update(String(uid)).digest("hex");
  const n = (slice) => String(parseInt(slice, 16) % 1e10).padStart(10, "0");
  return `${n(hex.slice(0, 12))}.${n(hex.slice(12, 24))}`;
}
const str = (value, max = 100) =>
  value == null || value === "" ? undefined : String(value).slice(0, max);
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};
const compact = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null),
  );
// The GA4 event for one RevenueCat webhook event: the plan and cycle from the
// product, the amount actually paid (the purchased-currency price when
// RevenueCat has it), and the reasons RevenueCat gives. Nothing personal.
export function revenueCatEvent(event, { uid = "" } = {}) {
  const name = RC_EVENTS[event?.type];
  if (!name) return null;
  const product = String(event.product_id || "").split(":")[0];
  const plan = planFromProduct(product) || undefined;
  const cycle = cycleFromProduct(product) || undefined;
  const value =
    num(event.price_in_purchased_currency) ?? num(event.price) ?? undefined;
  const currency =
    str(event.currency, 3)?.toUpperCase() ||
    (num(event.price) != null ? "USD" : undefined);
  const params = compact({
    plan,
    cycle,
    product_id: str(product),
    store: str(event.store)?.toLowerCase(),
    environment: str(event.environment)?.toLowerCase(),
    period_type: str(event.period_type)?.toLowerCase(),
    cancel_reason: str(event.cancel_reason)?.toLowerCase(),
    expiration_reason: str(event.expiration_reason)?.toLowerCase(),
    is_trial_conversion:
      event.is_trial_conversion == null
        ? undefined
        : event.is_trial_conversion
          ? 1
          : 0,
    new_product_id: str(event.new_product_id),
    is_sandbox: event.environment === "SANDBOX" ? 1 : 0,
    transferred: event.type === "TRANSFER" ? (uid ? 1 : 0) : undefined,
  });
  if (name === "purchase" || name === "subscription_renewal") {
    if (value != null) {
      params.value = value;
      params.currency = currency;
    }
    if (event.transaction_id) params.transaction_id = str(event.transaction_id);
    params.items = [
      compact({
        item_id: str(product),
        item_name: plan ? `${plan} (${cycle || "subscription"})` : str(product),
        item_category: "subscription",
        item_variant: cycle,
        price: value,
        quantity: 1,
      }),
    ];
  }
  return { name, params, sandbox: event.environment === "SANDBOX" };
}
export function createServerAnalytics({
  env = process.env,
  fetch = globalThis.fetch,
  store = null,
  now = Date.now,
  log = (...args) => console.warn(...args),
} = {}) {
  const measurementId = String(env.GA4_MEASUREMENT_ID || "").trim();
  const apiSecret = String(env.GA4_API_SECRET || "").trim();
  const configured =
    /^G-[A-Z0-9]{4,20}$/.test(measurementId) && apiSecret.length > 0;
  const sendSandbox = env.GA4_SEND_SANDBOX === "1";
  const url = `${env.GA4_DEBUG === "1" ? MP_DEBUG_URL : MP_URL}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  // uid → client id this process already stored, to spare Firestore a write
  // on every request.
  const remembered = new Map();
  async function rememberClient(uid, clientId, platform = "") {
    if (!store || !uid || !validClientId(clientId)) return false;
    const key = `${clientId}|${platform}`;
    if (remembered.get(uid) === key) return false;
    remembered.set(uid, key);
    if (remembered.size > 20000) remembered.clear();
    try {
      await store.transaction(async (tx) => {
        const path = memberPath(uid),
          member = (await tx.get(path)) || {};
        if (
          member.analytics?.clientId === clientId &&
          (member.analytics?.platform || "") === (platform || "")
        )
          return;
        tx.set(path, {
          ...member,
          analytics: compact({
            clientId,
            platform: platform || undefined,
            seenAt: now(),
          }),
        });
      });
      return true;
    } catch (e) {
      remembered.delete(uid);
      log("Analytics client id not stored", { name: e?.name });
      return false;
    }
  }
  async function send(uid, events, { clientId = null } = {}) {
    if (!configured || !events.length) return false;
    let stored = clientId;
    if (!stored && store) {
      try {
        stored = (await store.get(memberPath(uid)))?.analytics?.clientId;
      } catch {}
    }
    const body = {
      client_id: clientIdFor(uid, stored),
      user_id: String(uid),
      timestamp_micros: now() * 1000,
      non_personalized_ads: true,
      events: events.slice(0, 25).map((e) => ({
        name: e.name,
        params: {
          // Lets the events count in engagement-based reports.
          engagement_time_msec: 1,
          ...e.params,
        },
      })),
    };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        log("GA4 Measurement Protocol refused", { status: response.status });
        return false;
      }
      return true;
    } catch (e) {
      log("GA4 Measurement Protocol failed", { name: e?.name });
      return false;
    }
  }
  return {
    configured,
    rememberClient,
    send,
    // One RevenueCat webhook event, for every member it names. Never throws.
    async revenueCat(event, uids = []) {
      if (!configured) return 0;
      const mapped = revenueCatEvent(event);
      if (!mapped || (mapped.sandbox && !sendSandbox)) return 0;
      let sent = 0;
      for (const uid of uids) {
        const params = { ...mapped.params };
        if (event.type === "TRANSFER")
          params.transferred = (event.transferred_to || []).includes(uid)
            ? "to"
            : "from";
        if (await send(uid, [{ name: mapped.name, params }])) sent++;
      }
      return sent;
    },
  };
}
