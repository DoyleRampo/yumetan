import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createAccess, memberPath } from "../server/access.js";
import { registerCommunity } from "../server/community.js";
import { createAccountDeletion, registerAccount } from "../server/account.js";
const at = Date.parse("2026-09-25T10:00:00Z");
function fixture({ revenueCat = 200, authFails = false } = {}) {
  const store = new MemoryStore();
  const access = createAccess({
    store,
    now: () => at,
    verify: async (token) => ({
      uid: token,
      firebase: {
        sign_in_provider: token === "guest" ? "anonymous" : "google.com",
      },
    }),
  });
  const routes = new Map();
  const app = {
    get: (p, f) => routes.set("GET " + p, f),
    post: (p, f) => routes.set("POST " + p, f),
  };
  registerCommunity(app, { access, asyncRoute: (f) => f });
  const deleted = [],
    fetches = [];
  registerAccount(app, {
    access,
    asyncRoute: (f) => f,
    deleteUser: async (uid) => {
      if (authFails)
        throw Object.assign(Error("boom"), { code: "auth/internal" });
      if (deleted.includes(uid))
        throw Object.assign(Error("gone"), { code: "auth/user-not-found" });
      deleted.push(uid);
    },
    env: { REVENUECAT_SECRET_API_KEY: "sk_test" },
    fetch: async (url, init) => {
      fetches.push({ url, init });
      return { ok: revenueCat < 400, status: revenueCat };
    },
    log: () => {},
  });
  async function call(method, path, uid, body = {}, params = {}) {
    let out;
    await routes.get(method + " " + path)(
      {
        body,
        params,
        query: {},
        get: (k) => (k === "Authorization" && uid ? "Bearer " + uid : null),
      },
      { json: (r) => (out = r) },
    );
    return out;
  }
  const paid = (uid) =>
    store.data.set(memberPath(uid), {
      plan: "standard",
      status: "active",
      paidUntil: at + 86400000 * 40,
    });
  return { store, call, paid, deleted, fetches };
}
const post = (recordId) => ({
  recordId,
  title: "Moon",
  text: "A calm dream",
  alias: "Dreamer",
  typeId: "challenge",
  characterSet: "human",
  consent: true,
});
async function populate(f) {
  f.paid("alice");
  f.paid("bob");
  f.paid("carol");
  const alicePost = (
    await f.call("POST", "/api/community/publish", "alice", post("r1"))
  ).id;
  const bobPost = (
    await f.call("POST", "/api/community/publish", "bob", post("r2"))
  ).id;
  await f.call(
    "POST",
    "/api/community/posts/:id/comments",
    "alice",
    {
      text: "hi",
      alias: "A",
      requestId: "11111111-1111-4111-8111-111111111111",
    },
    { id: bobPost },
  );
  await f.call(
    "POST",
    "/api/community/posts/:id/comments",
    "carol",
    {
      text: "yo",
      alias: "C",
      requestId: "22222222-2222-4222-8222-222222222222",
    },
    { id: bobPost },
  );
  await f.call(
    "POST",
    "/api/community/posts/:id/reaction",
    "alice",
    { stamp: "🌙" },
    { id: bobPost },
  );
  await f.call(
    "POST",
    "/api/community/posts/:id/reaction",
    "carol",
    { stamp: "🌙" },
    { id: bobPost },
  );
  await f.call(
    "POST",
    "/api/community/posts/:id/report",
    "alice",
    { reason: "spam" },
    { id: bobPost },
  );
  await f.call(
    "POST",
    "/api/community/posts/:id/report",
    "carol",
    { reason: "abuse" },
    { id: alicePost },
  );
  await f.call(
    "POST",
    "/api/community/posts/:id/block",
    "alice",
    {},
    { id: bobPost },
  );
  await f.call(
    "POST",
    "/api/community/posts/:id/block",
    "carol",
    {},
    { id: alicePost },
  );
  f.store.data.set("users/alice", { profile: { nickname: "Alice" } });
  f.store.data.set("users/alice/dreams/d1", { id: "d1", text: "flying" });
  f.store.data.set("users/alice/diary/d2", { id: "d2", text: "coffee" });
  f.store.data.set("users/alice/deleted/d3", { deletedAt: "x" });
  f.store.data.set("users/bob/dreams/d9", { id: "d9", text: "bob's" });
  return { alicePost, bobPost };
}
test("deletion needs a signed-in non-guest user and an explicit confirmation", async () => {
  const f = fixture();
  await assert.rejects(
    f.call("POST", "/api/account/delete", null, { confirm: true }),
    { code: "loginRequired" },
  );
  await assert.rejects(
    f.call("POST", "/api/account/delete", "guest", { confirm: true }),
    { code: "loginRequired" },
  );
  await assert.rejects(f.call("POST", "/api/account/delete", "alice", {}), {
    code: "invalidInput",
  });
  await assert.rejects(
    f.call("POST", "/api/account/delete", "alice", { confirm: "yes" }),
    { code: "invalidInput" },
  );
  assert.deepEqual(f.deleted, []);
});
test("deleting an account removes journals, membership, usage, posts, comments, reactions, blocks and reports, then the auth user", async () => {
  const f = fixture();
  const { alicePost, bobPost } = await populate(f);
  const before = [...f.store.data.keys()];
  assert.ok(before.some((k) => k.startsWith("usage/alice_")));
  const result = await f.call("POST", "/api/account/delete", "alice", {
    confirm: true,
  });
  assert.deepEqual(result, {
    ok: true,
    posts: 1,
    comments: 1,
    reactions: 1,
    billing: "deleted",
  });
  const keys = [...f.store.data.keys()];
  // Nothing under Alice's own paths or keyed by her UID remains.
  assert.deepEqual(
    keys.filter((k) => k.includes("alice")),
    [],
  );
  assert.equal(f.store.data.has(`communityPosts/${alicePost}`), false);
  // Her comment and reaction on Bob's post are gone and the counters are corrected; Carol's stay.
  const bobs = f.store.data.get(`communityPosts/${bobPost}`);
  assert.equal(bobs.commentCount, 1);
  assert.equal(bobs.reactions["🌙"], 1);
  assert.equal(
    f.store.data.has(
      `communityPosts/${bobPost}/comments/22222222-2222-4222-8222-222222222222`,
    ),
    true,
  );
  assert.equal(
    f.store.data.has(`communityPosts/${bobPost}/reactions/carol`),
    true,
  );
  // Carol's block of Alice and Carol's report about Alice's (now deleted) post are gone; other users' data is intact.
  assert.equal(f.store.data.has("users/bob/dreams/d9"), true);
  assert.equal(f.store.data.has(memberPath("bob")), true);
  assert.deepEqual(
    keys
      .filter((k) => k.startsWith("communityReports/"))
      .map((k) => f.store.data.get(k).reporter),
    [],
  );
  assert.deepEqual(
    [...f.store.data.keys()].filter((k) => k.startsWith("accountDeletions/"))
      .length,
    1,
  );
  assert.deepEqual(f.deleted, ["alice"]);
  assert.equal(f.fetches[0].init.method, "DELETE");
  assert.match(f.fetches[0].url, /\/subscribers\/alice$/);
  // Bob still sees his own post; Alice's is no longer in anybody's feed.
  const feed = await f.call("GET", "/api/community/feed", "carol");
  assert.deepEqual(
    feed.posts.map((p) => p.id),
    [bobPost],
  );
});
test("a retry after the auth user is already gone still succeeds and RevenueCat failures never block deletion", async () => {
  const f = fixture({ revenueCat: 500 });
  await populate(f);
  const first = await f.call("POST", "/api/account/delete", "alice", {
    confirm: true,
  });
  assert.equal(first.billing, "failed");
  const second = await f.call("POST", "/api/account/delete", "alice", {
    confirm: true,
  });
  assert.deepEqual(second, {
    ok: true,
    posts: 0,
    comments: 0,
    reactions: 0,
    billing: "failed",
  });
  assert.deepEqual(f.deleted, ["alice"]);
});
test("an auth deletion error is reported after the data is gone so the user can retry", async () => {
  const f = fixture({ authFails: true });
  await populate(f);
  await assert.rejects(
    f.call("POST", "/api/account/delete", "alice", { confirm: true }),
    { code: "deleteFailed" },
  );
  assert.deepEqual(
    [...f.store.data.keys()].filter((k) => k.includes("alice")),
    [],
  );
});
test("deletion is unavailable without Firebase services", async () => {
  const d = createAccountDeletion({
    access: { store: null, now: Date.now },
    deleteUser: null,
  });
  await assert.rejects(d.deleteAccount({ uid: "x" }, { confirm: true }), {
    code: "serviceUnavailable",
  });
});
