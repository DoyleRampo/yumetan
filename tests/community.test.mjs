import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createAccess, memberPath, dayKey } from "../server/access.js";
import { registerCommunity } from "../server/community.js";
import {
  PLANS,
  TEASER_CHARS,
  canSaveRecord,
  activePlan,
} from "../public/core/plans.js";
import { communityMessages } from "../public/core/community-i18n.js";
import { createCommunity, communityText } from "../public/community.js";
import {
  errorMessageKey,
  FEATURE_MESSAGES,
} from "../public/core/api-errors.js";
const at = Date.parse("2026-09-17T10:00:00Z");
function setup() {
  const store = new MemoryStore();
  let clock = at;
  const access = createAccess({
    store,
    now: () => clock,
    verify: async (token) => {
      if (token === "invalid") throw Error();
      return {
        uid: token,
        firebase: {
          sign_in_provider: token === "guest" ? "anonymous" : "password",
        },
        moderator: token === "mod",
      };
    },
  });
  const routes = new Map();
  registerCommunity(
    {
      get: (p, f) => routes.set("GET " + p, f),
      post: (p, f) => routes.set("POST " + p, f),
    },
    {
      access,
      asyncRoute: (f) => f,
      moderate: async (text) => {
        if (text.includes("REJECT"))
          throw Object.assign(Error("contentRejected"), { status: 422 });
      },
    },
  );
  async function call(method, path, uid, body = {}, params = {}, query = {}) {
    let out;
    await routes.get(method + " " + path)(
      {
        body,
        params,
        query,
        get: (k) => (k === "Authorization" && uid ? "Bearer " + uid : null),
      },
      { json: (r) => (out = r) },
    );
    return out;
  }
  const paid = (uid, plan = "starter") =>
    store.data.set(memberPath(uid), {
      plan,
      status: "active",
      paidUntil: at + 86400000 * 40,
    });
  return { store, access, call, paid, setTime: (v) => (clock = v) };
}
const post = (recordId = randomUUID(), text = "A calm dream") => ({
  recordId,
  title: "Moon",
  text,
  alias: "Dreamer",
  typeId: "challenge",
  characterSet: "human",
  consent: true,
});
test("three plan prices, calendar entry quotas, editing and all translations are complete", () => {
  assert.deepEqual(
    [
      PLANS.starter.monthly,
      PLANS.starter.yearly,
      PLANS.standard.monthly,
      PLANS.standard.yearly,
    ],
    [490, 4900, 980, 9800],
  );
  const r = { id: "a", kind: "dream", date: "2026-09-17" };
  assert.equal(canSaveRecord([r], { ...r, id: "b" }), false);
  assert.equal(canSaveRecord([r], r), true);
  assert.equal(canSaveRecord([r], { ...r, id: "b" }, "starter"), true);
  assert.equal(canSaveRecord([r], { ...r, id: "b", date: "2026-09-18" }), true);
  assert.equal(
    activePlan({ plan: "standard", status: "active", paidUntil: at }, at),
    "free",
  );
  for (const values of Object.values(communityMessages))
    assert.ok(
      values.length === 4 &&
        values.every((x) => typeof x === "string" && x.length),
    );
});
// Every failure the app shows goes through `communityText(code)`, which falls
// back to the bare "Unable to complete" for a code it does not know. An app
// talking to a server older than itself got exactly that for `notFound`, so the
// missing route read as an unexplained failure. Keep the codes and the messages
// together instead.
test("every error code a request can return has a message in all four languages", async () => {
  // Codes never shown to anyone: the RevenueCat webhook is server to server,
  // and /api/auth/* speaks its own strings through core/auth-i18n.js.
  const internal = new Set(["invalidSignature"]);
  const sources = [
    "../server.js",
    "../server-features.js",
    "../server/community.js",
    "../server/access.js",
    "../server/openai.js",
    "../server/account.js",
    "../server/billing.js",
  ];
  const codes = new Set();
  for (const file of sources) {
    const text = await readFile(new URL(file, import.meta.url), "utf8");
    for (const [, code] of text.matchAll(
      /(?:fault\(\d+,\s*|code:\s*)"([a-zA-Z]+)"/g,
    ))
      if (!internal.has(code)) codes.add(code);
  }
  // The catch-all 404 is what an app one release ahead of the server meets.
  assert.ok(codes.has("notFound"));
  for (const code of codes)
    assert.ok(
      communityMessages[code],
      `${code} has no message, so it would show as the generic error`,
    );
});
test("reading the feed rejects guests, forged identities and free accounts; publishing is free", async () => {
  const s = setup();
  for (const uid of [null, "guest", "invalid", "free"])
    await assert.rejects(s.call("GET", "/api/community/feed", uid), (e) =>
      [401, 403].includes(e.status),
    );
  for (const uid of [null, "guest", "invalid"])
    await assert.rejects(
      s.call("POST", "/api/community/publish", uid, post()),
      (e) => e.status === 401,
    );
  // A free account publishes its own dream, within the free daily allowance.
  const { id } = await s.call("POST", "/api/community/publish", "free", post());
  assert.ok(id);
  await assert.rejects(
    s.call("POST", "/api/community/publish", "free", post()),
    (e) => e.status === 429,
  );
  // A suspended account cannot publish at all.
  s.store.data.set(memberPath("blocked"), { plan: "free", suspended: true });
  await assert.rejects(
    s.call("POST", "/api/community/publish", "blocked", post()),
    (e) => e.status === 403,
  );
  // Free accounts still cannot stamp or comment on another member's post.
  s.paid("alice");
  const other = await s.call("POST", "/api/community/publish", "alice", post());
  for (const [method, path, body] of [
    ["POST", "/api/community/posts/:id/reaction", { stamp: "🌙" }],
    [
      "POST",
      "/api/community/posts/:id/comments",
      { text: "hello", alias: "me", requestId: randomUUID() },
    ],
    ["GET", "/api/community/posts/:id", {}],
  ])
    await assert.rejects(
      s.call(method, path, "free", body, { id: other.id }),
      (e) => e.status === 403,
    );
  // Its own post, however, opens on the free plan and costs no read.
  const own = await s.call(
    "GET",
    "/api/community/posts/:id",
    "free",
    {},
    { id },
  );
  assert.equal(own.post.mine, true);
  assert.equal(
    (await s.store.get(`usage/free_d_${dayKey(at)}`))?.reads || 0,
    0,
  );
});
test("public payload never includes diary/photo/sleep/AI; owner privacy survives expiry", async () => {
  const s = setup();
  s.paid("alice");
  s.paid("bob");
  const { id } = await s.call("POST", "/api/community/publish", "alice", {
    ...post(),
    diary: "SECRET",
    photo: "SECRET",
    sleep: {},
    analysis: { secret: "SECRET" },
  });
  const feed = await s.call("GET", "/api/community/feed", "bob");
  assert.equal(feed.posts.length, 1);
  assert.equal(feed.posts[0].mine, false);
  assert.ok(!JSON.stringify(feed).includes("SECRET"));
  assert.ok(!JSON.stringify(feed).includes("alice"));
  // The author sees their own post in the timeline, marked as theirs, at no read cost.
  const own = await s.call("GET", "/api/community/feed", "alice");
  assert.equal(own.posts.length, 1);
  assert.equal(own.posts[0].mine, true);
  assert.equal(
    (await s.store.get(`usage/alice_d_${dayKey(at)}`))?.reads || 0,
    0,
  );
  await assert.rejects(
    s.call("POST", "/api/community/posts/:id/private", "bob", {}, { id }),
    (e) => e.status === 404,
  );
  // Sharing belongs to every plan, so an expired author's dream stays readable.
  s.store.data.set(memberPath("alice"), { plan: "free" });
  assert.equal(
    (await s.call("GET", "/api/community/feed", "bob")).posts.length,
    1,
  );
  // Its author keeps the privacy controls and can withdraw it at any time.
  await s.call("POST", "/api/community/posts/:id/private", "alice", {}, { id });
  assert.equal(
    (await s.call("GET", "/api/community/feed", "bob")).posts.length,
    0,
  );
  await assert.rejects(
    s.call("GET", "/api/community/posts/:id", "bob", {}, { id }),
    (e) => e.status === 404,
  );
  assert.equal((await s.store.get("communityPosts/" + id)).text, "");
});
test("simultaneous publications and duplicate retries obey daily and active limits", async () => {
  const s = setup();
  s.paid("alice");
  const data = post();
  const r = await Promise.allSettled([
    s.call("POST", "/api/community/publish", "alice", data),
    s.call("POST", "/api/community/publish", "alice", post()),
  ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  await s.call("POST", "/api/community/publish", "alice", data);
  assert.equal((await s.store.get("usage/alice_d_2026-09-17")).publishes, 1);
  await assert.rejects(
    s.call("POST", "/api/community/publish", "alice", {
      ...data,
      consent: false,
    }),
    (e) => e.status === 400,
  );
  await assert.rejects(
    s.call("POST", "/api/community/publish", "alice", {
      ...data,
      text: "REJECT",
    }),
    (e) => e.status === 422,
  );
});
test("stamps replace one per user; comments retry once, retain ownership and cannot cross privacy", async () => {
  const s = setup();
  s.paid("alice");
  s.paid("bob");
  s.paid("eve");
  const { id } = await s.call(
    "POST",
    "/api/community/publish",
    "alice",
    post(),
  );
  for (const stamp of ["🌙", "✨", "✨"])
    await s.call(
      "POST",
      "/api/community/posts/:id/reaction",
      "bob",
      { stamp },
      { id },
    );
  const p = await s.store.get("communityPosts/" + id);
  assert.equal(p.reactions["🌙"], 0);
  assert.equal(p.reactions["✨"], 1);
  const requestId = randomUUID();
  const data = { requestId, text: "Lovely", alias: "B" };
  await Promise.all([
    s.call("POST", "/api/community/posts/:id/comments", "bob", data, { id }),
    s.call("POST", "/api/community/posts/:id/comments", "bob", data, { id }),
  ]);
  assert.equal((await s.store.get("communityPosts/" + id)).commentCount, 1);
  await assert.rejects(
    s.call(
      "POST",
      "/api/community/posts/:id/comments/:commentId/delete",
      "eve",
      {},
      { id, commentId: requestId },
    ),
    (e) => e.status === 404,
  );
  await s.call(
    "POST",
    "/api/community/posts/:id/comments/:commentId/delete",
    "alice",
    {},
    { id, commentId: requestId },
  );
  assert.equal((await s.store.get("communityPosts/" + id)).commentCount, 0);
  await s.call("POST", "/api/community/posts/:id/private", "alice", {}, { id });
  await assert.rejects(
    s.call(
      "POST",
      "/api/community/posts/:id/reaction",
      "bob",
      { stamp: "🌙" },
      { id },
    ),
    (e) => e.status === 404,
  );
});
test("reports and moderator hiding apply to feed and direct detail", async () => {
  const s = setup();
  s.paid("alice");
  s.paid("bob");
  const { id } = await s.call(
    "POST",
    "/api/community/publish",
    "alice",
    post(),
  );
  await s.call(
    "POST",
    "/api/community/posts/:id/report",
    "bob",
    { reason: "privacy" },
    { id },
  );
  await assert.rejects(
    s.call("GET", "/api/moderation/reports", "bob"),
    (e) => e.status === 403,
  );
  const reports = (await s.call("GET", "/api/moderation/reports", "mod"))
    .reports;
  assert.equal(reports.length, 1);
  // Blocking was removed: the post stays visible until a moderator hides it.
  assert.equal(
    (await s.call("GET", "/api/community/feed", "bob")).posts.length,
    1,
  );
  await s.call(
    "POST",
    "/api/moderation/reports/:id",
    "mod",
    { action: "hide" },
    { id: reports[0].id },
  );
  assert.equal(
    (await s.call("GET", "/api/community/feed", "bob")).posts.length,
    0,
  );
  await assert.rejects(
    s.call("GET", "/api/community/posts/:id", "bob", {}, { id }),
    (e) => e.status === 404,
  );
});
test("read caps are atomic, not reset by reload; daily and monthly rollovers use UTC", async () => {
  const s = setup();
  s.paid("alice");
  s.store.data.set("usage/alice_d_2026-09-17", { reads: 29 });
  const outcomes = await Promise.allSettled([
    s.access.consume("alice", "reads"),
    s.access.consume("alice", "reads"),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  s.setTime(at + 86400000);
  await s.access.consume("alice", "reads");
  assert.equal((await s.store.get("usage/alice_d_2026-09-18")).reads, 1);
  s.store.data.set("usage/alice_m_2026-09", { reflections: 30 });
  await assert.rejects(
    s.access.consume("alice", "reflections", 1, true),
    (e) => e.status === 429,
  );
  s.setTime(Date.parse("2026-10-01T00:00:00Z"));
  await s.access.consume("alice", "reflections", 1, true);
});

test("free members get a fixed random teaser of today's posts, 15 characters each, never the full text", async () => {
  const s = setup();
  s.paid("alice", "standard");
  s.paid("carol", "standard");
  const day = dayKey(at);
  const long =
    "夜の海を歩いていたら、遠くに光る灯台が見えて、その方向へ泳ぎ始めた。";
  for (let i = 0; i < 3; i++)
    await s.call(
      "POST",
      "/api/community/publish",
      "alice",
      post(undefined, long + i),
    );
  for (let i = 0; i < 2; i++)
    await s.call(
      "POST",
      "/api/community/publish",
      "carol",
      post(undefined, long + i),
    );
  await s.call(
    "POST",
    "/api/community/publish",
    "carol",
    post(undefined, "short"),
  );
  for (const uid of [null, "guest", "invalid"])
    await assert.rejects(
      s.call("GET", "/api/community/teaser", uid, {}, {}, { day }),
      (e) => e.status === 401,
    );
  const first = await s.call(
    "GET",
    "/api/community/teaser",
    "free",
    {},
    {},
    { day },
  );
  assert.equal(first.total, 6);
  assert.equal(first.posts.length, PLANS.free.teaserPosts);
  for (const p of first.posts) {
    assert.equal(
      Array.from(p.excerpt).length,
      p.truncated ? TEASER_CHARS : Array.from("short").length,
    );
    // The name and the title are never shortened; the dream is.
    assert.equal(p.alias, "Dreamer");
    assert.equal(p.title, "Moon");
    assert.equal("text" in p, false);
    assert.equal(p.mine, false);
    assert.equal(p.truncated, p.excerpt !== "short");
  }
  assert.ok(!JSON.stringify(first).includes("灯台が見えて"));
  // Reloading never reveals more posts: the pick is stable per user and day.
  const again = await s.call(
    "GET",
    "/api/community/teaser",
    "free",
    {},
    {},
    { day },
  );
  assert.deepEqual(
    again.posts.map((p) => p.id),
    first.posts.map((p) => p.id),
  );
  // Another day has no posts.
  assert.equal(
    (
      await s.call(
        "GET",
        "/api/community/teaser",
        "free",
        {},
        {},
        { day: "2026-09-18" },
      )
    ).total,
    0,
  );
  // An expired subscription does not take its author's dreams out of the day.
  s.store.data.set(memberPath("carol"), {
    plan: "starter",
    status: "active",
    paidUntil: at - 1,
  });
  assert.equal(
    (await s.call("GET", "/api/community/teaser", "free", {}, {}, { day }))
      .total,
    6,
  );
  // A suspended author's dreams are taken out.
  s.store.data.set(memberPath("carol"), { plan: "free", suspended: true });
  assert.equal(
    (await s.call("GET", "/api/community/teaser", "free", {}, {}, { day }))
      .total,
    3,
  );
  // A free member's own posts come with the teaser, in full and beyond the three.
  const { id } = await s.call(
    "POST",
    "/api/community/publish",
    "free",
    post(undefined, long + "mine"),
  );
  const withOwn = await s.call(
    "GET",
    "/api/community/teaser",
    "free",
    {},
    {},
    { day },
  );
  assert.equal(withOwn.posts.length, PLANS.free.teaserPosts + 1);
  const mine = withOwn.posts.find((p) => p.mine);
  assert.equal(mine.id, id);
  assert.equal(mine.text, long + "mine");
  assert.equal(withOwn.posts.filter((p) => !p.mine).length, 3);
  // Withdrawing it takes it back out of the member's own list.
  await s.call("POST", "/api/community/posts/:id/private", "free", {}, { id });
  assert.equal(
    (
      await s.call("GET", "/api/community/teaser", "free", {}, {}, { day })
    ).posts.filter((p) => p.mine).length,
    0,
  );
  // Paid members are not handed the teaser as their feed: the full feed still works.
  s.paid("free");
  assert.equal(
    (await s.call("GET", "/api/community/feed", "free")).posts.filter(
      (p) => !p.mine,
    ).length,
    3,
  );
});
test("any member can report and block; a block hides both members from each other", async () => {
  const s = setup();
  s.paid("alice");
  s.paid("bob");
  const { id } = await s.call(
    "POST",
    "/api/community/publish",
    "alice",
    post(),
  );
  const mine = await s.call("POST", "/api/community/publish", "free", post());
  // Reporting needs no paid plan: a free member sees the teaser and can report.
  await s.call(
    "POST",
    "/api/community/posts/:id/report",
    "free",
    { reason: "abuse" },
    { id },
  );
  assert.equal((await s.store.list("communityReports")).length, 1);
  // Blocking needs no paid plan either.
  await s.call("POST", "/api/community/posts/:id/block", "free", {}, { id });
  assert.deepEqual(
    (await s.call("GET", "/api/community/blocks", "free")).blocks,
    [{ id: "alice", alias: "Dreamer" }],
  );
  // The blocked author's post is gone from the blocker's feed and detail...
  s.paid("free");
  assert.deepEqual(
    (await s.call("GET", "/api/community/feed", "free")).posts.map((p) => p.id),
    [mine.id],
  );
  for (const [method, path, body] of [
    ["GET", "/api/community/posts/:id", {}],
    ["POST", "/api/community/posts/:id/reaction", { stamp: "🌙" }],
    [
      "POST",
      "/api/community/posts/:id/comments",
      { text: "hi", alias: "me", requestId: randomUUID() },
    ],
  ])
    await assert.rejects(
      s.call(method, path, "free", body, { id }),
      (e) => e.status === 404,
    );
  // ...and the blocker's own post is gone from the blocked author's feed.
  assert.equal(
    (await s.call("GET", "/api/community/feed", "alice")).posts.filter(
      (p) => p.id === mine.id,
    ).length,
    0,
  );
  // Others are unaffected, and blocking yourself or a private post is refused.
  assert.equal(
    (await s.call("GET", "/api/community/feed", "bob")).posts.length,
    2,
  );
  for (const uid of ["alice", "free"])
    await assert.rejects(
      s.call(
        "POST",
        "/api/community/posts/:id/block",
        uid,
        {},
        { id: uid === "alice" ? id : mine.id },
      ),
      (e) => e.status === 404,
    );
  // Unblocking brings the posts back.
  await s.call(
    "POST",
    "/api/community/blocks/:id/remove",
    "free",
    {},
    { id: "alice" },
  );
  assert.equal(
    (await s.call("GET", "/api/community/feed", "free")).posts.length,
    2,
  );
});
// The community page loads the plan first, then the block list, then the
// dreams. A failure in one of the later steps used to reset the plan to free
// and abandon the page, so a paid member lost the timeline they had just been
// confirmed for, and a free member lost the teaser to an unrelated error.
test("a failed block list or timeline keeps the plan the server confirmed", async () => {
  const paidAccount = { plan: "starter", paidUntil: Date.now() + 86400000 };
  const page = (replies) => {
    const asked = [];
    const community = createCommunity({
      api: async (path) => {
        asked.push(path.split("?")[0]);
        const reply = replies[path.split("?")[0]];
        if (reply instanceof Error) throw reply;
        return reply;
      },
      language: () => "ja",
      esc: (s) => String(s),
      navigate: () => {},
      render: () => {},
      toast: () => {},
      run: async (fn) => fn(),
      markSaved: () => {},
      signedIn: () => true,
      nickname: () => "Dreamer",
      character: () => ({ image: "", setId: "human" }),
      currentType: () => "challenge",
      isNative: () => false,
      purchases: null,
    });
    return { community, asked };
  };
  // A paid member whose timeline request fails keeps the paid plan, so the
  // page still shows the timeline (empty, with the error) and not the paywall.
  const failed = Object.assign(new Error("boom"), {
    code: "serviceUnavailable",
  });
  const paid = page({
    "/api/account": paidAccount,
    "/api/community/blocks": { blocks: [] },
    "/api/community/feed": failed,
  });
  await paid.community.enter("community");
  assert.equal(paid.community.plan(), "starter");
  assert.match(paid.community.view("community"), /boom/);
  // A block list the server cannot answer does not cost a free member the
  // teaser: the dreams still load.
  const free = page({
    "/api/account": { plan: "free" },
    "/api/community/blocks": failed,
    "/api/community/teaser": { day: "2026-09-17", total: 1, posts: [] },
  });
  await free.community.enter("community");
  assert.ok(free.asked.includes("/api/community/teaser"));
  assert.equal(free.community.plan(), "free");
});
// A Starter member switching to Standard: the first sync still answers
// Starter, because RevenueCat lags the store by a few seconds. The loop used to
// stop at "not free" and report the upgrade as done while it was not.
test("a plan switch keeps syncing until the server reports the plan bought", async () => {
  const button = {
    tagName: "BUTTON",
    dataset: { social: "checkout", plan: "standard" },
  };
  const previous = globalThis.document;
  globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [button],
    createElement: () => ({ remove() {} }),
    body: { append() {} },
  };
  try {
    const answers = [
      { plan: "starter", paidUntil: Date.now() + 86400000 },
      { plan: "starter", paidUntil: Date.now() + 86400000 },
      { plan: "standard", paidUntil: Date.now() + 86400000 },
    ];
    let syncs = 0;
    const toasts = [];
    const community = createCommunity({
      api: async (path) => {
        if (path === "/api/account")
          return {
            plan: "starter",
            paidUntil: Date.now() + 86400000,
            billingConfigured: true,
          };
        if (path === "/api/billing/sync") return answers[syncs++];
        return {};
      },
      language: () => "ja",
      esc: (s) => String(s),
      navigate: () => {},
      render: () => {},
      toast: (m) => toasts.push(m),
      run: async (fn) => fn(),
      markSaved: () => {},
      signedIn: () => true,
      nickname: () => "Dreamer",
      character: () => ({ image: "", setId: "human" }),
      currentType: () => "challenge",
      isNative: () => true,
      uid: () => "alice",
      purchases: { available: () => true, buy: async () => true },
      wait: async () => {},
    });
    await community.enter("plans");
    community.bind();
    await button.onclick();
    assert.equal(syncs, 3);
    assert.equal(community.plan(), "standard");
    assert.equal(toasts.at(-1), communityText("purchaseActivated", "ja"));
  } finally {
    globalThis.document = previous;
  }
});
// Every error used to be worded by its code alone, so a free member trying
// handwriting recognition was told about the community paywall.
test("an error is worded for the feature that met it", () => {
  const say = (code, path) => communityText(errorMessageKey(code, path), "ja");
  // Handwriting: the plan notice is about AI image recognition.
  assert.match(say("paidRequired", "/api/handwriting"), /手書き.*AI画像認識/);
  assert.doesNotMatch(say("paidRequired", "/api/handwriting"), /ほかの人の夢/);
  for (const code of ["quotaReached", "aiBudgetReached", "aiFailed"])
    assert.match(say(code, "/api/handwriting"), /手書き/);
  assert.doesNotMatch(say("aiUnavailable", "/api/handwriting"), /端末内/);
  // The community keeps its own paywall wording.
  assert.equal(
    say("paidRequired", "/api/community/feed"),
    communityText("paidRequired", "ja"),
  );
  // Each allowance says which one ran out.
  assert.match(say("quotaReached", "/api/reflect"), /AI診断/);
  assert.match(say("quotaReached", "/api/community/publish"), /公開/);
  assert.match(
    say("quotaReached", "/api/community/posts/abc/reaction"),
    /スタンプ/,
  );
  assert.match(
    say("quotaReached", "/api/community/posts/abc/comments"),
    /コメント/,
  );
  assert.match(
    say("quotaReached", "/api/community/feed?after=x"),
    /みんなの夢/,
  );
  assert.match(say("quotaReached", "/api/community/posts/abc"), /みんなの夢/);
  // A code a feature does not reword falls back to the shared message.
  assert.equal(
    say("loginRequired", "/api/handwriting"),
    communityText("loginRequired", "ja"),
  );
  // Every key a feature names exists in all four languages.
  for (const table of Object.values(FEATURE_MESSAGES))
    for (const key of Object.values(table))
      assert.equal(communityMessages[key]?.length, 4, key);
});
// Firestore/gRPC errors carry a numeric `code` (9 is a missing index). The
// server passed it through, and the app, with no message for 9, showed only
// "Unable to complete" on the community page.
test("only the server's own error codes reach the app", async () => {
  const { errorResponse } = await import("../server/errors.js");
  const { fault } = await import("../server/access.js");
  // The shape @grpc/grpc-js gives a failed Firestore call.
  const grpc = Object.assign(
    new Error("9 FAILED_PRECONDITION: The query requires an index."),
    { code: 9, details: "The query requires an index.", metadata: {} },
  );
  assert.deepEqual(errorResponse(grpc), {
    status: 500,
    code: "serviceUnavailable",
  });
  assert.deepEqual(errorResponse(Object.assign(new Error(), { code: 7 })), {
    status: 500,
    code: "serviceUnavailable",
  });
  // A library's own string code without an HTTP status is not the app's either.
  assert.deepEqual(
    errorResponse(Object.assign(new Error(), { code: "ECONNRESET" })),
    { status: 500, code: "serviceUnavailable" },
  );
  // The server's own faults pass through unchanged.
  assert.deepEqual(errorResponse(fault(429, "quotaReached")), {
    status: 429,
    code: "quotaReached",
  });
  assert.deepEqual(errorResponse(fault(404, "postUnavailable")), {
    status: 404,
    code: "postUnavailable",
  });
  // A malformed JSON body (express) keeps its 400.
  assert.deepEqual(
    errorResponse(
      Object.assign(new Error(), { status: 400, type: "entity.parse.failed" }),
    ),
    { status: 400, code: "invalidInput" },
  );
  // Whatever it answers, the app has words for it.
  for (const e of [grpc, fault(429, "quotaReached"), new Error()])
    assert.ok(communityMessages[errorResponse(e).code]);
});
