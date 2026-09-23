import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod/v4";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createAccess } from "../server/access.js";
import { createBilling, membershipFromSubscriber } from "../server/billing.js";
import {
  createAI,
  DEFAULT_MODEL,
  DEFAULT_FALLBACK_MODEL,
  READING_OUTPUT_TOKENS,
  MAX_INPUT_BYTES,
} from "../server/openai.js";
const quiet = { error() {}, warn() {} };
const now = Date.parse("2026-09-17T00:00:00Z");
const env = {
  REVENUECAT_SECRET_API_KEY: "sk_test",
  REVENUECAT_WEBHOOK_AUTH: "hook-secret",
};
const iso = (ms) => new Date(ms).toISOString();
function subscriber(overrides = {}) {
  const expires = iso(now + 86400000 * 30);
  return {
    request_date_ms: now,
    subscriber: {
      management_url: "https://apps.apple.com/account/subscriptions",
      entitlements: {
        starter: {
          expires_date: expires,
          product_identifier: "yumetan_starter_monthly",
          purchase_date: iso(now - 1000),
        },
      },
      subscriptions: {
        yumetan_starter_monthly: {
          expires_date: expires,
          store: "app_store",
          is_sandbox: false,
          unsubscribe_detected_at: null,
        },
      },
      ...overrides,
    },
  };
}
function billingFixture() {
  const store = new MemoryStore(),
    access = createAccess({ store, now: () => now });
  const calls = [];
  let response = subscriber();
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    if (typeof response === "number") return { ok: false, status: response };
    return { ok: true, status: 200, json: async () => response };
  };
  const event = (type, extra = {}) => ({
    api_version: "1.0",
    event: { type, app_user_id: "alice", ...extra },
  });
  return {
    store,
    access,
    calls,
    event,
    billing: createBilling({ access, env, fetch }),
    respond: (v) => (response = v),
  };
}
test("webhook requires the shared secret and grants only what RevenueCat reports", async () => {
  const s = billingFixture();
  await assert.rejects(
    s.billing.webhook("wrong", s.event("INITIAL_PURCHASE")),
    (e) => e.status === 401,
  );
  await assert.rejects(
    s.billing.webhook(undefined, s.event("INITIAL_PURCHASE")),
    (e) => e.status === 401,
  );
  assert.equal(s.calls.length, 0);
  assert.equal((await s.billing.account("alice")).plan, "free");
  // A test ping from the dashboard is acknowledged without touching members.
  assert.deepEqual(await s.billing.webhook("hook-secret", s.event("TEST")), {
    synced: 0,
  });
  await s.billing.webhook(
    "hook-secret",
    s.event("INITIAL_PURCHASE", {
      entitlement_ids: ["standard"],
      expiration_at_ms: now + 86400000 * 365,
    }),
  );
  // The event body claimed "standard"; the REST subscriber says starter.
  const account = await s.billing.account("alice");
  assert.equal(account.plan, "starter");
  assert.equal(account.cycle, "monthly");
  assert.equal(
    account.managementUrl,
    "https://apps.apple.com/account/subscriptions",
  );
  assert.equal(account.billingConfigured, true);
  assert.match(s.calls[0].url, /\/v1\/subscribers\/alice$/);
  assert.equal(s.calls[0].init.headers.Authorization, "Bearer sk_test");
});
test("expiry, cancellation and anonymous ids never overgrant; stale syncs are ignored", async () => {
  const s = billingFixture();
  s.respond(
    subscriber({
      subscriptions: {
        yumetan_starter_monthly: {
          expires_date: iso(now + 86400000 * 30),
          store: "play_store",
          unsubscribe_detected_at: iso(now - 500),
        },
      },
    }),
  );
  await s.billing.webhook("hook-secret", s.event("CANCELLATION"));
  let account = await s.billing.account("alice");
  assert.equal(account.plan, "starter");
  assert.equal(account.cancelAtPeriodEnd, true);
  s.respond(
    subscriber({
      request_date_ms: now + 1000,
      entitlements: {
        starter: {
          expires_date: iso(now - 1),
          product_identifier: "yumetan_starter_monthly",
        },
      },
    }),
  );
  await s.billing.webhook("hook-secret", s.event("EXPIRATION"));
  assert.equal((await s.billing.account("alice")).plan, "free");
  // An older snapshot arriving late must not resurrect access.
  s.respond({ ...subscriber(), request_date_ms: now - 5000 });
  await s.billing.webhook("hook-secret", s.event("RENEWAL"));
  assert.equal((await s.billing.account("alice")).plan, "free");
  // Anonymous RevenueCat ids and malformed ids are skipped, not written.
  const before = s.calls.length;
  const r = await s.billing.webhook(
    "hook-secret",
    s.event("INITIAL_PURCHASE", {
      app_user_id: "$RCAnonymousID:abc",
      original_app_user_id: "../admin",
      aliases: ["$RCAnonymousID:def"],
    }),
  );
  assert.deepEqual(r, { synced: 0 });
  assert.equal(s.calls.length, before);
});
test("client sync uses the verified uid only and surfaces provider failures", async () => {
  const s = billingFixture();
  s.respond({
    ...subscriber(),
    subscriber: {
      ...subscriber().subscriber,
      entitlements: {
        standard: {
          expires_date: iso(now + 86400000 * 365),
          product_identifier: "yumetan_standard_yearly:p1y",
        },
      },
      subscriptions: {
        "yumetan_standard_yearly:p1y": {
          store: "play_store",
          is_sandbox: true,
        },
      },
    },
  });
  const account = await s.billing.sync({ uid: "bob", plan: "admin" });
  assert.equal(account.plan, "standard");
  assert.equal(account.cycle, "yearly");
  assert.match(s.calls[0].url, /\/subscribers\/bob$/);
  assert.equal((await s.store.get("memberships/bob")).sandbox, true);
  s.respond(500);
  await assert.rejects(
    s.billing.sync({ uid: "bob" }),
    (e) => e.code === "billingFailed",
  );
  assert.equal((await s.billing.account("bob")).plan, "standard");
  s.respond(new Error("network"));
  await assert.rejects(
    s.billing.sync({ uid: "bob" }),
    (e) => e.code === "billingFailed",
  );
});
test("missing RevenueCat credentials do not offer simulated purchases", async () => {
  const store = new MemoryStore(),
    access = createAccess({ store, now: () => now }),
    billing = createBilling({
      access,
      env: {},
      fetch: async () => ({ ok: true }),
    });
  assert.equal(billing.configured, false);
  await assert.rejects(billing.sync({ uid: "a" }), (e) => e.status === 503);
  await assert.rejects(
    billing.webhook("anything", {
      event: { type: "RENEWAL", app_user_id: "a" },
    }),
    (e) => e.status === 503,
  );
  assert.equal((await billing.account("a")).billingConfigured, false);
});
test("GPT uses bounded structured output, no storage; every plan gets one reading per dream date, handwriting and over-budget calls stay gated", async () => {
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
  const ai = createAI({ access, env: {}, client, log: quiet });
  const req = {
    user: { uid: "a" },
    system: [{ text: "Transcribe" }],
    messages: [{ role: "user", content: "A dream" }],
    schema: z.object({ text: z.string() }),
    kind: "reflections",
    date: "2026-09-17",
  };
  // Free: one reading per dream date, counted on that date; cost in the month.
  assert.deepEqual(await ai.call(req), { text: "Hello" });
  assert.equal(count, 1);
  assert.equal((await store.get("usage/a_d_2026-09-17")).reflections, 1);
  assert.ok((await store.get("usage/a_m_2026-09")).aiCost > 0);
  await assert.rejects(ai.call(req), (e) => e.code === "quotaReached");
  assert.deepEqual(await ai.call({ ...req, date: "2026-09-16" }), {
    text: "Hello",
  });
  await assert.rejects(
    ai.call({ ...req, date: "17-09-2026" }),
    (e) => e.code === "invalidInput",
  );
  // Handwriting stays paid-only.
  await assert.rejects(
    ai.call({ ...req, kind: "handwriting" }),
    (e) => e.code === "paidRequired",
  );
  assert.equal(count, 2);
  store.data.set("memberships/a", {
    plan: "starter",
    status: "active",
    paidUntil: now + 86400000,
  });
  store.data.set("usage/a_d_2026-09-17", {});
  store.data.set("usage/a_m_2026-09", {});
  assert.deepEqual(await ai.call(req), { text: "Hello" });
  assert.equal(args.store, false);
  assert.equal(args.model, DEFAULT_MODEL);
  assert.equal(args.reasoning_effort, "none");
  assert.equal(args.max_completion_tokens, READING_OUTPUT_TOKENS);
  assert.equal(args.response_format.json_schema.strict, true);
  store.data.set("usage/a_m_2026-09", { aiCost: 749999 });
  await assert.rejects(ai.call(req), (e) => e.code === "aiBudgetReached");
  assert.equal(count, 3);
  store.data.set("usage/a_m_2026-09", {});
  store.data.set("serviceBudgets/2026-09", { aiCost: 20000000 });
  await assert.rejects(ai.call(req), (e) => e.code === "aiBudgetReached");
  assert.equal(count, 3);
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
  const ai = createAI({ access, env: {}, client, log: quiet }),
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
      messages: [{ role: "user", content: "x".repeat(MAX_INPUT_BYTES + 1) }],
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

// The provider's own errors are logged and either retried once (an unknown model
// id, a rejected parameter) or mapped to a code the app can explain (a bad key).
test("an unknown model falls back once, a rejected parameter is dropped, key problems say the AI is unavailable, and the health status reports the model", async () => {
  const store = new MemoryStore(),
    access = createAccess({ store, now: () => now });
  store.data.set("memberships/a", {
    plan: "standard",
    status: "active",
    paidUntil: now + 86400000,
  });
  const ok = {
    choices: [
      { finish_reason: "stop", message: { content: '{"text":"Hello"}' } },
    ],
  };
  const providerError = (status, code, message) =>
    Object.assign(new Error(message), { status, code });
  const requests = [];
  let plan = [];
  const client = {
    chat: {
      completions: {
        create: async (a) => {
          requests.push(a);
          const next = plan.shift();
          if (next instanceof Error) throw next;
          return next || ok;
        },
      },
    },
    models: { retrieve: async () => ({}) },
  };
  const logs = [];
  const ai = createAI({
    access,
    env: {},
    client,
    log: { error: (m) => logs.push(m), warn: (m) => logs.push(m) },
  });
  const req = {
    user: { uid: "a" },
    system: [{ text: "x" }],
    messages: [{ role: "user", content: "hello" }],
    schema: z.object({ text: z.string() }),
    kind: "reflections",
  };
  assert.equal(ai.model, DEFAULT_MODEL);
  assert.equal(ai.fallback, DEFAULT_FALLBACK_MODEL);
  // Unknown model id → the fallback model once, same request otherwise.
  plan = [providerError(404, "model_not_found", "The model does not exist")];
  assert.deepEqual(await ai.call({ ...req, date: "2026-09-10" }), {
    text: "Hello",
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].model, DEFAULT_MODEL);
  assert.equal(requests[1].model, DEFAULT_FALLBACK_MODEL);
  assert.equal(requests[1].reasoning_effort, "none");
  assert.ok(logs.includes("OpenAI request failed"));
  // A model that rejects reasoning_effort gets the same request without it.
  plan = [
    providerError(
      400,
      "unsupported_value",
      "reasoning_effort is not supported with this model",
    ),
  ];
  assert.deepEqual(await ai.call({ ...req, date: "2026-09-11" }), {
    text: "Hello",
  });
  assert.equal(requests[3].model, DEFAULT_MODEL);
  assert.equal("reasoning_effort" in requests[3], false);
  // Two failures in a row are a failure; the allowance was still consumed once.
  plan = [
    providerError(404, "model_not_found", "no"),
    providerError(404, "model_not_found", "no"),
  ];
  await assert.rejects(
    ai.call({ ...req, date: "2026-09-12" }),
    (e) => e.code === "aiFailed",
  );
  assert.equal((await store.get("usage/a_d_2026-09-12")).reflections, 1);
  // Key or billing problems are reported as "unavailable", never retried.
  plan = [providerError(401, "invalid_api_key", "Incorrect API key")];
  await assert.rejects(
    ai.call({ ...req, date: "2026-09-13" }),
    (e) => e.code === "aiUnavailable",
  );
  plan = [
    providerError(429, "insufficient_quota", "You exceeded your current quota"),
  ];
  await assert.rejects(
    ai.call({ ...req, date: "2026-09-14" }),
    (e) => e.code === "aiUnavailable",
  );
  assert.equal(requests.length, 8);
  // A pinned model and a disabled fallback are respected.
  const pinned = createAI({
    access,
    env: { OPENAI_MODEL: "gpt-5.6-luna-2026-07-09", OPENAI_FALLBACK_MODEL: "" },
    client,
    log: quiet,
  });
  plan = [providerError(404, "model_not_found", "no")];
  await assert.rejects(
    pinned.call({ ...req, date: "2026-09-15" }),
    (e) => e.code === "aiFailed",
  );
  assert.equal(requests.at(-1).model, "gpt-5.6-luna-2026-07-09");
  // Health status: cached, no secrets, explains a missing key or model.
  assert.deepEqual(await ai.status(now), {
    configured: true,
    model: DEFAULT_MODEL,
    available: true,
    error: null,
  });
  client.models.retrieve = async () => {
    throw providerError(404, "model_not_found", "no");
  };
  assert.equal((await ai.status(now)).available, true);
  assert.equal((await ai.status(now + 11 * 60000)).error, "modelNotFound");
  assert.deepEqual(await createAI({ access, env: {}, client: null }).status(), {
    configured: false,
    model: DEFAULT_MODEL,
    available: false,
    error: "noKey",
  });
});
test("a subscription whose entitlement is missing still grants the plan its product names", () => {
  const expires = iso(now + 86400000 * 30);
  const granted = membershipFromSubscriber(
    {
      entitlements: {},
      subscriptions: {
        "com.doyle.yumetan.standard.yearly": {
          expires_date: expires,
          store: "app_store",
          is_sandbox: true,
        },
        "com.doyle.yumetan.starter.monthly": {
          expires_date: expires,
          store: "app_store",
        },
      },
    },
    now,
  );
  assert.equal(granted.plan, "standard");
  assert.equal(granted.cycle, "yearly");
  assert.equal(granted.paidUntil, Date.parse(expires));
  assert.equal(granted.sandbox, true);
  // Expired products and products naming no plan grant nothing.
  assert.equal(
    membershipFromSubscriber(
      {
        subscriptions: {
          "com.doyle.yumetan.starter.monthly": { expires_date: iso(now - 1) },
          "com.doyle.yumetan.lifetime": { expires_date: expires },
        },
      },
      now,
    ).plan,
    "free",
  );
  // A configured entitlement decides its plan, even when it has expired.
  assert.equal(
    membershipFromSubscriber(
      {
        entitlements: {
          starter: {
            expires_date: iso(now - 1),
            product_identifier: "com.doyle.yumetan.starter.monthly",
          },
        },
        subscriptions: {
          "com.doyle.yumetan.starter.monthly": { expires_date: expires },
        },
      },
      now,
    ).plan,
    "free",
  );
});
// A renewal the webhook never delivered (the API asleep, a sandbox renewing
// every five minutes) used to leave the stored period to run out, and the
// member stayed free until they happened to buy or restore again.
test("a lapsed stored period is re-read from RevenueCat before the member is called free", async () => {
  const s = billingFixture();
  let clock = now;
  const access = createAccess({ store: s.store, now: () => clock });
  const fetches = [];
  let response = subscriber();
  const billing = createBilling({
    access,
    env,
    fetch: async (url) => {
      fetches.push(url);
      return { ok: true, status: 200, json: async () => response };
    },
  });
  // Bought a month: stored with RevenueCat's expiry.
  await billing.sync({ uid: "alice" });
  assert.equal((await billing.account("alice")).plan, "starter");
  assert.equal(fetches.length, 1, "an active member is not re-read");
  // The month ends; RevenueCat renewed it but no webhook arrived.
  const renewed = now + 86400000 * 60;
  clock = now + 86400000 * 30 + 1000;
  response = subscriber({
    entitlements: {
      starter: {
        expires_date: iso(renewed),
        product_identifier: "yumetan_starter_monthly",
      },
    },
  });
  response.request_date_ms = clock;
  const account = await billing.account("alice");
  assert.equal(account.plan, "starter");
  assert.equal(account.paidUntil, renewed);
  assert.equal(fetches.length, 2);
  // RevenueCat is asked at most once a minute, and not while it is unreachable.
  clock += 1000;
  await billing.account("alice");
  assert.equal(fetches.length, 2);
  // A member RevenueCat has never seen is not looked up (that would create one).
  assert.equal((await billing.account("carol")).plan, "free");
  assert.equal(fetches.length, 2);
  // A failing RevenueCat answers from what is stored.
  await s.store.transaction(async (tx) =>
    tx.set("memberships/dave", {
      plan: "starter",
      status: "active",
      paidUntil: clock - 1,
      source: "revenuecat",
      lastSyncedAt: clock - 120000,
    }),
  );
  const failing = createBilling({
    access,
    env,
    fetch: async () => {
      throw new Error("network");
    },
  });
  assert.equal((await failing.account("dave")).plan, "free");
});
test("a transfer re-reads both accounts; the product bought decides the plan", async () => {
  const s = billingFixture();
  s.respond(subscriber());
  const r = await s.billing.webhook("hook-secret", {
    event: {
      type: "TRANSFER",
      transferred_from: ["olduser"],
      transferred_to: ["newuser"],
    },
  });
  assert.equal(r.synced, 2);
  assert.deepEqual(s.calls.map((c) => c.url.split("/").at(-1)).sort(), [
    "newuser",
    "olduser",
  ]);
  // One entitlement unlocked by both plans' products: Standard stays Standard.
  const expires = iso(now + 86400000 * 30);
  const shared = membershipFromSubscriber(
    {
      entitlements: {
        starter: {
          expires_date: expires,
          product_identifier: "com.doyle.yumetan.standard.monthly",
        },
      },
    },
    now,
  );
  assert.equal(shared.plan, "standard");
  // An entitlement with its own name still counts when its product names no plan.
  assert.equal(
    membershipFromSubscriber(
      {
        entitlements: {
          standard: { expires_date: expires, product_identifier: "premium_1" },
        },
      },
      now,
    ).plan,
    "standard",
  );
  // With several active, the best plan wins.
  assert.equal(
    membershipFromSubscriber(
      {
        entitlements: {
          starter: {
            expires_date: expires,
            product_identifier: "com.doyle.yumetan.starter.monthly",
          },
          standard: {
            expires_date: expires,
            product_identifier: "com.doyle.yumetan.standard.monthly",
          },
        },
      },
      now,
    ).plan,
    "standard",
  );
});
