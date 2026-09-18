// RevenueCat webhook → memberships/{uid}. App Store purchases (iOS) arrive here; Stripe
// purchases keep using server/billing.js. The webhook is authenticated with the shared
// Authorization header configured in the RevenueCat dashboard (REVENUECAT_WEBHOOK_AUTH).
import { timingSafeEqual } from "node:crypto";
import { storeProductPlan } from "../public/core/plans.js";
import { fault, memberPath } from "./access.js";
// Event types that describe the state of a subscription. Everything else (TEST, TRANSFER,
// NON_RENEWING_PURCHASE, VIRTUAL_CURRENCY_TRANSACTION, …) is acknowledged and ignored.
const SUBSCRIPTION_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "CANCELLATION",
  "BILLING_ISSUE",
  "SUBSCRIPTION_PAUSED",
  "EXPIRATION",
]);
const ENDING_EVENTS = new Set([
  "CANCELLATION",
  "BILLING_ISSUE",
  "SUBSCRIPTION_PAUSED",
]);
const uidPattern = /^[A-Za-z0-9_-]{1,128}$/;
export function createRevenueCat({ access, env = process.env }) {
  const { store, now } = access;
  const configured = Boolean(store && env.REVENUECAT_WEBHOOK_AUTH);
  const allowSandbox = env.REVENUECAT_ALLOW_SANDBOX === "true";
  function authorized(header) {
    const expected = Buffer.from(env.REVENUECAT_WEBHOOK_AUTH || "");
    const given = Buffer.from(String(header || ""));
    return (
      expected.length > 0 &&
      expected.length === given.length &&
      timingSafeEqual(expected, given)
    );
  }
  return {
    configured,
    async webhook(body, authHeader) {
      if (!configured) throw fault(503, "billingUnavailable");
      if (!authorized(authHeader)) throw fault(401, "invalidSignature");
      const event = body?.event;
      if (
        !event ||
        typeof event.id !== "string" ||
        !SUBSCRIPTION_EVENTS.has(event.type)
      )
        return { received: true, ignored: true };
      if (event.environment === "SANDBOX" && !allowSandbox)
        return { received: true, ignored: true };
      // The SDK is configured with the Firebase UID; RevenueCat anonymous IDs never map to a member.
      const uid = [
        event.app_user_id,
        event.original_app_user_id,
        ...(Array.isArray(event.aliases) ? event.aliases : []),
      ].find(
        (id) =>
          typeof id === "string" &&
          uidPattern.test(id) &&
          !id.startsWith("$RCAnonymousID"),
      );
      if (!uid) return { received: true, ignored: true };
      const selected = storeProductPlan(event.product_id);
      const expires = Number(event.expiration_at_ms) || 0;
      const created = Number(event.event_timestamp_ms) || 0;
      const paid =
        Boolean(selected) && expires > now() && event.type !== "EXPIRATION";
      await store.transaction(async (tx) => {
        const path = memberPath(uid),
          member = (await tx.get(path)) || {};
        if (await tx.get(`billingEvents/${event.id}`)) return;
        if ((member.lastRevenueCatEvent || 0) > created) return;
        const receipt = {
          processedAt: now(),
          type: event.type,
          provider: "revenuecat",
        };
        // A live Stripe subscription that outlasts this store event keeps its access.
        if (
          member.provider !== "revenuecat" &&
          member.status === "active" &&
          Number(member.paidUntil) > Math.max(expires, now())
        ) {
          tx.set(`billingEvents/${event.id}`, receipt);
          return;
        }
        tx.set(path, {
          ...member,
          provider: "revenuecat",
          store: typeof event.store === "string" ? event.store : null,
          storeProductId:
            typeof event.product_id === "string" ? event.product_id : null,
          plan: paid ? selected.plan : "free",
          cycle: paid ? selected.cycle : null,
          status: paid ? "active" : "expired",
          paidUntil: paid ? expires : 0,
          cancelAtPeriodEnd: paid && ENDING_EVENTS.has(event.type),
          lastRevenueCatEvent: created,
        });
        tx.set(`billingEvents/${event.id}`, receipt);
      });
      return { received: true };
    },
  };
}
