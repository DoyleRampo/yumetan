import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod/v4";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createAccess } from "../server/access.js";
import { createBilling } from "../server/billing.js";
import { createAI } from "../server/openai.js";
const now = Date.parse("2026-09-17T00:00:00Z");
const env = {
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  PUBLIC_APP_URL: "https://example.test",
  STRIPE_PRICE_STARTER_MONTHLY: "p_sm",
  STRIPE_PRICE_STARTER_YEARLY: "p_sy",
  STRIPE_PRICE_STANDARD_MONTHLY: "p_tm",
  STRIPE_PRICE_STANDARD_YEARLY: "p_ty",
};
const price = {
  id: "p_sm",
  active: true,
  currency: "jpy",
  unit_amount: 490,
  recurring: { interval: "month", interval_count: 1 },
};
function billingFixture() {
  const store = new MemoryStore(),
    access = createAccess({ store, now: () => now });
  store.data.set("memberships/alice", { customerId: "cus_a" });
  store.data.set("billingCustomers/cus_a", { uid: "alice" });
  let sub = {
    id: "sub_a",
    customer: "cus_a",
    status: "active",
    items: {
      data: [
        {
          price,
          quantity: 1,
          current_period_end: Math.floor(now / 1000) + 86400 * 30,
        },
      ],
    },
    latest_invoice: { status: "paid" },
    cancel_at_period_end: false,
  };
  let event = {
    id: "evt_1",
    created: 100,
    type: "invoice.paid",
    data: { object: { subscription: "sub_a" } },
  };
  const calls = [];
  const stripe = {
    webhooks: {
      constructEvent: (raw, signature) => {
        if (signature !== "valid") throw Error();
        return event;
      },
    },
    subscriptions: {
      retrieve: async () => sub,
      list: async () => ({ data: [] }),
    },
    prices: { retrieve: async () => price },
    customers: { create: async () => ({ id: "cus_a" }) },
    checkout: {
      sessions: {
        list: async () => ({ data: [] }),
        create: async (...args) => {
          calls.push(args);
          return { url: "https://checkout.stripe.com/test" };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params) => {
          calls.push(params);
          return { url: "https://billing.stripe.com/test" };
        },
      },
    },
  };
  return {
    store,
    access,
    stripe,
    calls,
    billing: createBilling({ access, env, stripe }),
    event: (v) => (event = v),
    sub: (v) => (sub = { ...sub, ...v }),
  };
}
test("only a signed webhook with paid recognized price grants access; replay is idempotent", async () => {
  const s = billingFixture();
  await assert.rejects(
    s.billing.webhook(Buffer.from("{}"), "invalid"),
    (e) => e.status === 400,
  );
  assert.equal((await s.billing.account("alice")).plan, "free");
  await s.billing.webhook(Buffer.from("{}"), "valid");
  assert.equal((await s.billing.account("alice")).plan, "starter");
  const snapshot = await s.store.get("memberships/alice");
  await s.billing.webhook(Buffer.from("{}"), "valid");
  assert.deepEqual(await s.store.get("memberships/alice"), snapshot);
  s.event({
    id: "evt_2",
    created: 101,
    type: "customer.subscription.updated",
    data: { object: { id: "sub_a" } },
  });
  s.sub({
    items: {
      data: [
        {
          price: { ...price, id: "arbitrary_price" },
          quantity: 1,
          current_period_end: 9999999999,
        },
      ],
    },
  });
  await s.billing.webhook(Buffer.from("{}"), "valid");
  assert.equal((await s.billing.account("alice")).plan, "free");
});
test("cancellation, payment failure, expiry and stale events never overgrant", async () => {
  const s = billingFixture();
  s.sub({ cancel_at_period_end: true });
  await s.billing.webhook(Buffer.from("{}"), "valid");
  assert.equal((await s.billing.account("alice")).plan, "starter");
  assert.equal((await s.billing.account("alice")).cancelAtPeriodEnd, true);
  s.event({
    id: "evt_fail",
    created: 102,
    type: "invoice.payment_failed",
    data: {
      object: { parent: { subscription_details: { subscription: "sub_a" } } },
    },
  });
  s.sub({ status: "past_due", latest_invoice: { status: "open" } });
  await s.billing.webhook(Buffer.from("{}"), "valid");
  assert.equal((await s.billing.account("alice")).plan, "free");
  s.event({
    id: "evt_old",
    created: 101,
    type: "invoice.paid",
    data: { object: { subscription: "sub_a" } },
  });
  s.sub({ status: "active", latest_invoice: { status: "paid" } });
  await s.billing.webhook(Buffer.from("{}"), "valid");
  assert.equal((await s.billing.account("alice")).plan, "free");
});
test("checkout ignores browser prices and redirect URLs; portal uses server-owned customer", async () => {
  const s = billingFixture();
  await s.billing.checkout(
    { uid: "alice", email: "example@example.test" },
    {
      plan: "starter",
      cycle: "monthly",
      price: "cheap",
      customer: "cus_other",
      success_url: "https://evil.test",
    },
  );
  const params = s.calls[0][0];
  assert.equal(params.line_items[0].price, "p_sm");
  assert.equal(params.customer, "cus_a");
  assert.ok(params.success_url.startsWith("https://example.test/"));
  await assert.rejects(
    s.billing.checkout({ uid: "alice" }, { plan: "admin", cycle: "monthly" }),
    (e) => e.status === 400,
  );
  await s.billing.portal({ uid: "alice" });
  assert.equal(s.calls[1].customer, "cus_a");
  s.stripe.subscriptions.list = async () => ({
    data: [{ status: "past_due" }],
  });
  await assert.rejects(
    s.billing.checkout({ uid: "alice" }, { plan: "starter", cycle: "monthly" }),
    (e) => e.code === "manageSubscription",
  );
});
test("missing payment credentials do not offer simulated purchases", async () => {
  const store = new MemoryStore(),
    access = createAccess({ store, now: () => now }),
    billing = createBilling({ access, env: {}, stripe: null });
  assert.equal(billing.configured, false);
  await assert.rejects(
    billing.checkout({ uid: "a" }, { plan: "starter", cycle: "monthly" }),
    (e) => e.status === 503,
  );
});
test("GPT uses bounded structured output, no storage; free and over-budget calls never reach provider", async () => {
  const store = new MemoryStore(),
    access = createAccess({ store, now: () => now });
  let count = 0,
    args;
  const client = {
    chat: {
      completions: {
        create: async (a) => {
          count++;
          args = a;
          return {
            choices: [
              {
                finish_reason: "stop",
                message: { content: '{"text":"Hello"}' },
              },
            ],
          };
        },
      },
    },
  };
  const ai = createAI({ access, env: {}, client });
  const req = {
    user: { uid: "a" },
    system: [{ text: "Transcribe" }],
    messages: [{ role: "user", content: "A dream" }],
    schema: z.object({ text: z.string() }),
    kind: "reflections",
  };
  await assert.rejects(ai.call(req), (e) => e.status === 403);
  assert.equal(count, 0);
  store.data.set("memberships/a", {
    plan: "starter",
    status: "active",
    paidUntil: now + 86400000,
  });
  assert.deepEqual(await ai.call(req), { text: "Hello" });
  assert.equal(args.store, false);
  assert.equal(args.model, "gpt-5.6-luna-2026-07-09");
  assert.equal(args.reasoning_effort, "none");
  assert.equal(args.max_completion_tokens, 800);
  assert.equal(args.response_format.json_schema.strict, true);
  store.data.set("usage/a_m_2026-09", { aiCost: 499999 });
  await assert.rejects(ai.call(req), (e) => e.code === "aiBudgetReached");
  assert.equal(count, 1);
  store.data.set("usage/a_m_2026-09", {});
  store.data.set("serviceBudgets/2026-09", { aiCost: 20000000 });
  await assert.rejects(ai.call(req), (e) => e.code === "aiBudgetReached");
  assert.equal(count, 1);
});
test("provider errors, refused/truncated responses and oversized input do not return invented AI output", async () => {
  const store = new MemoryStore(),
    access = createAccess({ store, now: () => now });
  store.data.set("memberships/a", {
    plan: "starter",
    status: "active",
    paidUntil: now + 86400000,
  });
  const client = {
    chat: {
      completions: {
        create: async () => {
          throw Error("provider timeout");
        },
      },
    },
  };
  const ai = createAI({ access, env: {}, client }),
    req = {
      user: { uid: "a" },
      system: [{ text: "x" }],
      messages: [{ role: "user", content: "hello" }],
      schema: z.object({ text: z.string() }),
      kind: "reflections",
    };
  await assert.rejects(ai.call(req), (e) => e.code === "aiFailed");
  assert.equal((await store.get("usage/a_m_2026-09")).reflections, 1);
  await assert.rejects(
    ai.call({
      ...req,
      messages: [{ role: "user", content: "x".repeat(31000) }],
    }),
    (e) => e.code === "aiTextTooLong",
  );
  assert.equal((await store.get("usage/a_m_2026-09")).reflections, 1);
  client.chat.completions.create = async () => ({
    choices: [
      { finish_reason: "length", message: { content: '{"text":"wrong"}' } },
    ],
  });
  await assert.rejects(ai.call(req), (e) => e.code === "aiFailed");
});

test("real Stripe signature verification rejects a modified raw webhook body", async () => {
  const { default: Stripe } = await import("stripe");
  const s = billingFixture();
  const stripe = new Stripe("sk_test_fixture");
  stripe.subscriptions.retrieve = s.stripe.subscriptions.retrieve;
  const billing = createBilling({ access: s.access, env, stripe });
  const raw = JSON.stringify({
    id: "evt_signed",
    created: 200,
    type: "invoice.paid",
    data: { object: { subscription: "sub_a" } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: raw,
    secret: env.STRIPE_WEBHOOK_SECRET,
  });
  await assert.rejects(
    billing.webhook(Buffer.from(raw.replace("sub_a", "sub_evil")), signature),
    (e) => e.code === "invalidSignature",
  );
  await billing.webhook(Buffer.from(raw), signature);
  assert.equal((await billing.account("alice")).plan, "starter");
});
