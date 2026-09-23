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
// When `account` re-reads RevenueCat by itself (see `stale`): at most once a
// minute, for up to ten minutes after a paid period ends, and every six hours
// otherwise.
const RESYNC_RETRY_MS = 60000;
const RESYNC_AFTER_EXPIRY_MS = 10 * 60000;
const RESYNC_ACTIVE_MS = 6 * 3600000;
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
  // The product that was bought names the plan; the entitlement's own name is
  // the fallback. An entitlement that several products unlock (one shared
  // "starter" for both plans, say) would otherwise hold a Standard member to
  // Starter's allowances. With more than one active, the best plan wins.
  let entitled = null;
  for (const [id, e] of Object.entries(entitlements)) {
    if (!e || typeof e !== "object") continue;
    const expires = e.expires_date ? Date.parse(e.expires_date) : NaN;
    if (!Number.isFinite(expires) || expires <= at) continue;
    const product = String(e.product_identifier || "");
    const base = product.split(":")[0];
    const plan =
      planFromProduct(base) || (ENTITLEMENTS.includes(id) ? id : null);
    if (!plan || !PLANS[plan]) continue;
    if (
      entitled &&
      (ENTITLEMENTS.indexOf(plan) > ENTITLEMENTS.indexOf(entitled.plan) ||
        (plan === entitled.plan && expires <= entitled.paidUntil))
    )
      continue;
    const sub = subscriptions[product] || subscriptions[base] || {};
    entitled = {
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
  if (entitled) return entitled;
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
  // Renewals reach the server by webhook. One that never arrives (the API
  // asleep on a free instance, a delivery given up on, a sandbox renewing every
  // few minutes) left the stored paid period to run out, and a paying member
  // fell back to free for good. Only members RevenueCat already knows are
  // re-checked: looking up anyone else would create a subscriber there.
  function stale(member, at) {
    if (!configured || member.source !== "revenuecat") return false;
    const synced = Number(member.lastSyncedAt) || 0;
    if (at - synced < RESYNC_RETRY_MS) return false;
    const paidUntil = Number(member.paidUntil) || 0;
    // A paid period has ended since the last check: ask again, for a while.
    if (member.plan !== "free" && paidUntil <= at)
      return synced < paidUntil + RESYNC_AFTER_EXPIRY_MS;
    // Otherwise now and then, for an upgrade or a refund that went unheard.
    return at - synced > RESYNC_ACTIVE_MS;
  }
  async function account(uid) {
    let member = await access.member(uid);
    if (!anonymous(uid) && stale(member, now())) {
      try {
        await refresh(uid);
        member = await access.member(uid);
      } catch {
        // RevenueCat unreachable: answer from what is stored.
      }
    }
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
      // A TRANSFER (a restore on another account) names its users only in
      // transferred_from / transferred_to: both sides must be re-read, or the
      // new owner stays free while the old one keeps the plan.
      const list = (v) => (Array.isArray(v) ? v : []);
      const ids = [
        ...new Set(
          [
            event.app_user_id,
            event.original_app_user_id,
            ...list(event.aliases),
            ...list(event.transferred_to),
            ...list(event.transferred_from),
          ].filter((id) => !anonymous(id)),
        ),
      ].slice(0, 10);
      for (const uid of ids) await refresh(uid);
      return { synced: ids.length };
    },
  };
}
