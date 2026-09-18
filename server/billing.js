import Stripe from "stripe";
import { PLANS, activePlan } from "../public/core/plans.js";
import { fault, memberPath, dayKey, monthKey } from "./access.js";
export function createBilling({
  access,
  env = process.env,
  stripe = env.STRIPE_SECRET_KEY
    ? new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 1 })
    : null,
}) {
  const { store, now } = access;
  const prices = Object.fromEntries(
    ["starter", "standard"].flatMap((plan) =>
      ["monthly", "yearly"].map((cycle) => [
        `${plan}_${cycle}`,
        env[`STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`],
      ]),
    ),
  );
  const configured = Boolean(
    stripe &&
    env.STRIPE_WEBHOOK_SECRET &&
    env.PUBLIC_APP_URL &&
    Object.values(prices).every(Boolean) &&
    store,
  );
  const requireConfigured = () => {
    if (!configured) throw fault(503, "billingUnavailable");
  };
  const origin = () => {
    const url = new URL(env.PUBLIC_APP_URL);
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw fault(503, "billingUnavailable");
    return url.origin;
  };
  function pricePlan(price) {
    const found = Object.entries(prices).find(
      ([, id]) => id && id === price.id,
    );
    if (!found) return null;
    const [plan, cycle] = found[0].split("_");
    if (
      price.currency !== "jpy" ||
      price.unit_amount !== PLANS[plan][cycle] ||
      price.recurring?.interval !== (cycle === "monthly" ? "month" : "year") ||
      price.recurring.interval_count !== 1
    )
      return null;
    return { plan, cycle };
  }
  return {
    configured,
    async account(uid) {
      const member = await access.member(uid);
      const plan = activePlan(member, now());
      return {
        plan: member.suspended ? "free" : plan,
        paidUntil: member.paidUntil || null,
        cycle: member.cycle || null,
        provider: member.provider || (member.subscriptionId ? "stripe" : null),
        cancelAtPeriodEnd: Boolean(member.cancelAtPeriodEnd),
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
    },
    async checkout(user, body) {
      requireConfigured();
      const { plan, cycle } = body || {};
      if (
        !["starter", "standard"].includes(plan) ||
        !["monthly", "yearly"].includes(cycle)
      )
        throw fault(400, "invalidInput");
      const price = await stripe.prices.retrieve(prices[`${plan}_${cycle}`]);
      if (!price.active || !pricePlan(price))
        throw fault(503, "billingUnavailable");
      const member = await access.member(user.uid);
      if (member.customerId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: member.customerId,
          status: "all",
          limit: 100,
        });
        if (
          subscriptions.data.some(
            (s) => !["canceled", "incomplete_expired"].includes(s.status),
          )
        )
          throw fault(409, "manageSubscription");
      }
      // A server-owned mapping, never a plan or customer ID supplied by the browser.
      const customer = member.customerId
        ? { id: member.customerId }
        : await stripe.customers.create(
            {
              metadata: { firebaseUid: user.uid },
              ...(user.email ? { email: user.email } : {}),
            },
            { idempotencyKey: `yumetan-customer-${user.uid}` },
          );
      await store.transaction(async (tx) => {
        const m = (await tx.get(memberPath(user.uid))) || {};
        tx.set(memberPath(user.uid), { ...m, customerId: customer.id });
        tx.set(`billingCustomers/${customer.id}`, { uid: user.uid });
      });
      // Reuse an unfinished Checkout even if another tab requests a different plan.
      const open = await stripe.checkout.sessions.list({
        customer: customer.id,
        status: "open",
        limit: 1,
      });
      if (open.data[0]) return { url: open.data[0].url };
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: customer.id,
          line_items: [{ price: price.id, quantity: 1 }],
          success_url: `${origin()}/?billing=success#plans`,
          cancel_url: `${origin()}/?billing=cancel#plans`,
          subscription_data: { metadata: { firebaseUid: user.uid } },
          expires_at: Math.floor(now() / 1000) + 1800,
        },
        {
          idempotencyKey: `yumetan-checkout-${user.uid}-${Math.floor(now() / 1800000)}`,
        },
      );
      return { url: session.url };
    },
    async portal(user) {
      requireConfigured();
      const member = await access.member(user.uid);
      if (!member.customerId) throw fault(400, "billingUnavailable");
      const session = await stripe.billingPortal.sessions.create({
        customer: member.customerId,
        return_url: `${origin()}/#plans`,
      });
      return { url: session.url };
    },
    async webhook(raw, signature) {
      requireConfigured();
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          raw,
          signature,
          env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        throw fault(400, "invalidSignature");
      }
      const types = [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
      ];
      if (!types.includes(event.type)) return;
      const object = event.data.object;
      const subId = event.type.startsWith("customer.subscription.")
        ? object.id
        : object.subscription ||
          object.parent?.subscription_details?.subscription;
      if (!subId) return;
      const sub = await stripe.subscriptions.retrieve(
        typeof subId === "string" ? subId : subId.id,
        { expand: ["latest_invoice"] },
      );
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const mapping = await store.get(`billingCustomers/${customerId}`);
      if (!mapping) return;
      const item = sub.items.data[0],
        selected = item && pricePlan(item.price);
      const paid =
        selected &&
        sub.items.data.length === 1 &&
        item.quantity === 1 &&
        sub.status === "active" &&
        sub.latest_invoice?.status === "paid";
      await store.transaction(async (tx) => {
        const path = memberPath(mapping.uid),
          member = (await tx.get(path)) || {};
        const receipt = await tx.get(`billingEvents/${event.id}`);
        if (
          receipt ||
          member.customerId !== customerId ||
          (member.lastEventCreated || 0) > event.created
        )
          return;
        // A canceled older subscription must never revoke a replacement subscription.
        if (
          member.subscriptionId &&
          member.subscriptionId !== sub.id &&
          member.status === "active" &&
          !paid
        )
          return;
        tx.set(path, {
          ...member,
          subscriptionId: sub.id,
          plan: paid ? selected.plan : "free",
          cycle: selected?.cycle || null,
          status: paid ? "active" : sub.status,
          paidUntil: paid
            ? (item.current_period_end || sub.current_period_end || 0) * 1000
            : 0,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          lastEventCreated: event.created,
        });
        tx.set(`billingEvents/${event.id}`, {
          processedAt: now(),
          type: event.type,
        });
      });
    },
  };
}
