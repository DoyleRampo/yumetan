import { timingSafeEqual } from "node:crypto";
import { PLANS, activePlan } from "../public/core/plans.js";
import { fault, memberPath, dayKey, monthKey } from "./access.js";
// Store subscriptions (App Store / Google Play) are managed by RevenueCat.
// The client never grants itself a plan: after a purchase or restore it asks
// this server to sync, and RevenueCat's webhook does the same on renewals,
// cancellations and expirations. Both paths read the subscriber from
// RevenueCat's REST API, which is the only source of truth.
const API_BASE = "https://api.revenuecat.com/v1";
const ENTITLEMENTS = ["standard", "starter"];
// Firebase UIDs only; RevenueCat anonymous IDs ($RCAnonymousID:…) never map to a member.
const anonymous = (id) =>
  typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id);
function sameSecret(a, b) {
  const x = Buffer.from(String(a || ""), "utf8"),
    y = Buffer.from(String(b || ""), "utf8");
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
// Derive the plan from RevenueCat entitlements; the store product decides the cycle.
export function membershipFromSubscriber(subscriber, at) {
  const entitlements = subscriber?.entitlements || {},
    subscriptions = subscriber?.subscriptions || {};
  for (const plan of ENTITLEMENTS) {
    const e = entitlements[plan];
    if (!e || !PLANS[plan]) continue;
    const expires = e.expires_date ? Date.parse(e.expires_date) : NaN;
    if (!Number.isFinite(expires) || expires <= at) continue;
    const product = String(e.product_identifier || "");
    const base = product.split(":")[0];
    const sub = subscriptions[product] || subscriptions[base] || {};
    return {
      plan,
      cycle: cycleFromProduct(base),
      status: "active",
      paidUntil: expires,
      cancelAtPeriodEnd: Boolean(sub.unsubscribe_detected_at),
      productId: base,
      store: sub.store || null,
      sandbox: Boolean(sub.is_sandbox),
    };
  }
  // Entitlements are the preferred source, but a RevenueCat project whose
  // entitlements are not (yet) named after the plans still has the store
  // subscription itself: an active product naming a plan grants that plan.
  // A plan whose entitlement does exist (even expired) was decided above.
  let best = null;
  for (const [product, sub] of Object.entries(subscriptions)) {
    const base = String(product).split(":")[0];
    const plan = planFromProduct(base);
    if (!plan || entitlements[plan] || !sub || typeof sub !== "object")
      continue;
    const expires = sub.expires_date ? Date.parse(sub.expires_date) : NaN;
    if (!Number.isFinite(expires) || expires <= at) continue;
    if (sub.refunded_at) continue;
    if (
      !best ||
      ENTITLEMENTS.indexOf(plan) < ENTITLEMENTS.indexOf(best.plan) ||
      (plan === best.plan && expires > best.paidUntil)
    )
      best = {
        plan,
        cycle: cycleFromProduct(base),
        status: "active",
        paidUntil: expires,
        cancelAtPeriodEnd: Boolean(sub.unsubscribe_detected_at),
        productId: base,
        store: sub.store || null,
        sandbox: Boolean(sub.is_sandbox),
      };
  }
  if (best) return best;
  return {
    plan: "free",
    cycle: null,
    status: "expired",
    paidUntil: 0,
    cancelAtPeriodEnd: false,
    productId: null,
    store: null,
    sandbox: false,
  };
}
// Product IDs follow com.doyle.yumetan.<plan>.<cycle>, but any ID naming a plan counts.
export const planFromProduct = (product) =>
  ENTITLEMENTS.find((plan) =>
    new RegExp(`(^|[._-])${plan}([._-]|$)`, "i").test(String(product || "")),
  ) || null;
export const cycleFromProduct = (product) =>
  /(yearly|annual|year)/i.test(product)
    ? "yearly"
    : /(monthly|month)/i.test(product)
      ? "monthly"
      : null;
export function createBilling({
  access,
  env = process.env,
  fetch = globalThis.fetch,
}) {
  const { store, now } = access;
  const configured = Boolean(
    env.REVENUECAT_SECRET_API_KEY && env.REVENUECAT_WEBHOOK_AUTH && store,
  );
  const requireConfigured = () => {
    if (!configured) throw fault(503, "billingUnavailable");
  };
  async function fetchSubscriber(uid) {
    let response;
    try {
      response = await fetch(
        `${API_BASE}/subscribers/${encodeURIComponent(uid)}`,
        {
          headers: {
            Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`,
            Accept: "application/json",
            "X-Platform": "server",
          },
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw fault(502, "billingFailed");
    }
    if (!response.ok) throw fault(502, "billingFailed");
    const data = await response.json().catch(() => null);
    if (!data?.subscriber) throw fault(502, "billingFailed");
    return data;
  }
  async function refresh(uid) {
    requireConfigured();
    if (anonymous(uid)) throw fault(400, "invalidInput");
    const data = await fetchSubscriber(uid);
    const at = Number(data.request_date_ms) || now();
    const next = membershipFromSubscriber(data.subscriber, at);
    await store.transaction(async (tx) => {
      const path = memberPath(uid),
        member = (await tx.get(path)) || {};
      // Concurrent syncs may finish out of order; keep the newest snapshot.
      if ((member.lastSyncedAt || 0) > at) return;
      tx.set(path, {
        ...member,
        ...next,
        source: "revenuecat",
        managementUrl: data.subscriber.management_url || null,
        lastSyncedAt: at,
      });
    });
  }
  async function account(uid) {
    const member = await access.member(uid);
    const plan = activePlan(member, now());
    return {
      plan: member.suspended ? "free" : plan,
      paidUntil: member.paidUntil || null,
      cycle: member.cycle || null,
      cancelAtPeriodEnd: Boolean(member.cancelAtPeriodEnd),
      managementUrl:
        typeof member.managementUrl === "string" &&
        /^https:\/\//.test(member.managementUrl)
          ? member.managementUrl
          : null,
      billingConfigured: configured,
      aiConfigured: Boolean(env.OPENAI_API_KEY),
      supportUrl: env.SUPPORT_URL || null,
      usage: {
        day: (await store.get(`usage/${uid}_d_${dayKey(now())}`)) || {},
        month: (await store.get(`usage/${uid}_m_${monthKey(now())}`)) || {},
      },
      resetsAt: new Date(
        Date.UTC(
          new Date(now()).getUTCFullYear(),
          new Date(now()).getUTCMonth() + 1,
          1,
        ),
      ).toISOString(),
    };
  }
  return {
    configured,
    account,
    // Called by the app after a store purchase or restore for the signed-in user only.
    async sync(user) {
      await refresh(user.uid);
      return account(user.uid);
    },
    // RevenueCat webhook: the shared secret is the whole Authorization header value.
    async webhook(authorization, body) {
      requireConfigured();
      if (!sameSecret(authorization, env.REVENUECAT_WEBHOOK_AUTH))
        throw fault(401, "invalidSignature");
      const event = body?.event;
      if (!event || typeof event !== "object") throw fault(400, "invalidInput");
      if (event.type === "TEST") return { synced: 0 };
      // The event body is never trusted for entitlements; only the user IDs it names.
      const ids = [
        ...new Set(
          [
            event.app_user_id,
            event.original_app_user_id,
            ...(Array.isArray(event.aliases) ? event.aliases : []),
          ].filter((id) => !anonymous(id)),
        ),
      ].slice(0, 5);
      for (const uid of ids) await refresh(uid);
      return { synced: ids.length };
    },
  };
}
