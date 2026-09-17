// App Store / Google Play subscriptions through RevenueCat.
// The device never grants a plan: after a purchase the app asks this server to
// re-read the subscriber from RevenueCat, and RevenueCat webhooks trigger the
// same read. Stripe (web) and RevenueCat (stores) both write memberships/{uid};
// `source` records which one currently grants the plan.
import { timingSafeEqual } from "node:crypto";
import { activePlan } from "../public/core/plans.js";
import { fault, memberPath } from "./access.js";
// Entitlement identifiers configured in the RevenueCat dashboard, best first.
export const ENTITLEMENTS = ["standard", "starter"];
const RANK = { free: 0, starter: 1, standard: 2 };
const APP_USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const LIFETIME = Date.UTC(2099, 0, 1);
export const cycleOf = (productId = "") =>
  /year|annual/i.test(productId) ? "yearly" : "monthly";
export function subscriberPlan(subscriber, now, { acceptSandbox = true } = {}) {
  const free = { plan: "free", cycle: null, paidUntil: 0, willRenew: false };
  for (const id of ENTITLEMENTS) {
    const ent = subscriber?.entitlements?.[id];
    if (!ent) continue;
    const expires = ent.expires_date ? Date.parse(ent.expires_date) : LIFETIME;
    if (!Number.isFinite(expires) || expires <= now) continue;
    const sub = subscriber.subscriptions?.[ent.product_identifier] || {};
    if (sub.is_sandbox && !acceptSandbox) continue;
    return {
      plan: id,
      cycle: cycleOf(ent.product_identifier),
      paidUntil: expires,
      willRenew: !sub.unsubscribe_detected_at,
      billingIssue: Boolean(sub.billing_issues_detected_at),
      store: sub.store || null,
      productId: ent.product_identifier || null,
      sandbox: Boolean(sub.is_sandbox),
    };
  }
  return free;
}
const stripeGrants = (member, now) =>
  member.source !== "revenuecat" &&
  Boolean(member.subscriptionId) &&
  activePlan(member, now) !== "free";
export function createRevenueCat({
  access,
  env = process.env,
  fetch = globalThis.fetch,
}) {
  const { store, now } = access;
  const configured = Boolean(env.REVENUECAT_SECRET_API_KEY && store);
  const webhookConfigured = configured && Boolean(env.REVENUECAT_WEBHOOK_AUTH);
  const acceptSandbox = env.REVENUECAT_ACCEPT_SANDBOX !== "false";
  const base = (env.REVENUECAT_API_URL || "https://api.revenuecat.com").replace(
    /\/$/,
    "",
  );
  const requireConfigured = () => {
    if (!configured) throw fault(503, "billingUnavailable");
  };
  const validId = (id) =>
    typeof id === "string" &&
    APP_USER_ID.test(id) &&
    !id.startsWith("$RCAnonymousID");
  async function subscriber(uid) {
    // Only the secret key reads subscribers; it never leaves the server.
    const response = await fetch(
      `${base}/v1/subscribers/${encodeURIComponent(uid)}`,
      {
        headers: {
          Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`,
          "Content-Type": "application/json",
          "X-Platform": "server",
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw fault(503, "billingUnavailable");
    const data = await response.json();
    if (!data?.subscriber) throw fault(503, "billingUnavailable");
    return data.subscriber;
  }
  return {
    configured,
    webhookConfigured,
    async sync(uid) {
      requireConfigured();
      if (!validId(uid)) throw fault(400, "invalidInput");
      const state = subscriberPlan(await subscriber(uid), now(), {
        acceptSandbox,
      });
      await store.transaction(async (tx) => {
        const path = memberPath(uid),
          member = (await tx.get(path)) || {};
        const snapshot = { ...state, syncedAt: now() };
        if (state.plan !== "free") {
          // A paying Stripe member keeps the higher (or equal) plan; RevenueCat is recorded only.
          if (
            stripeGrants(member, now()) &&
            RANK[member.plan] >= RANK[state.plan]
          ) {
            tx.set(path, { ...member, revenuecat: snapshot });
            return;
          }
          tx.set(path, {
            ...member,
            plan: state.plan,
            cycle: state.cycle,
            status: "active",
            paidUntil: state.paidUntil,
            cancelAtPeriodEnd: !state.willRenew,
            source: "revenuecat",
            revenuecat: snapshot,
          });
          return;
        }
        // Expiry only revokes a plan RevenueCat granted, never a Stripe membership.
        if (member.source === "revenuecat") {
          tx.set(path, {
            ...member,
            plan: "free",
            cycle: null,
            status: "expired",
            paidUntil: 0,
            cancelAtPeriodEnd: false,
            revenuecat: snapshot,
          });
          return;
        }
        tx.set(path, { ...member, revenuecat: snapshot });
      });
      return state;
    },
    async webhook(body, authorization) {
      if (!webhookConfigured) throw fault(503, "billingUnavailable");
      const expected = Buffer.from(env.REVENUECAT_WEBHOOK_AUTH),
        given = Buffer.from(String(authorization || ""));
      if (expected.length !== given.length || !timingSafeEqual(expected, given))
        throw fault(401, "invalidSignature");
      const event = body?.event;
      if (!event || typeof event.type !== "string")
        throw fault(400, "invalidInput");
      if (event.type === "TEST") return { synced: [] };
      // The payload only says who changed; the subscriber is re-read from RevenueCat.
      const ids = [
        ...new Set(
          [
            event.app_user_id,
            event.original_app_user_id,
            ...(Array.isArray(event.aliases) ? event.aliases : []),
            ...(Array.isArray(event.transferred_from)
              ? event.transferred_from
              : []),
            ...(Array.isArray(event.transferred_to)
              ? event.transferred_to
              : []),
          ].filter(validId),
        ),
      ].slice(0, 20);
      for (const id of ids) await this.sync(id);
      return { synced: ids };
    },
  };
}
