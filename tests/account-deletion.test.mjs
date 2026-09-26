import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createAccess, memberPath } from "../server/access.js";
import { registerCommunity } from "../server/community.js";
import { createAccountService } from "../server/account.js";
const at = Date.parse("2026-09-26T10:00:00Z");
function fixture({ revenueCat = 200, authFails = false } = {}) {
  const store = new MemoryStore();
  const access = createAccess({
    store,
    now: () => at,
    verify: async (token) => ({
      uid: token,
      firebase: { sign_in_provider: "google.com" },
    }),
  });
  const routes = new Map();
  registerCommunity(
    {
      get: (p, f) => routes.set("GET " + p, f),
      post: (p, f) => routes.set("POST " + p, f),
    },
    { access, asyncRoute: (f) => f },
  );
  const deleted = [],
    fetches = [];
  const accounts = createAccountService({
    store,
    purge: (path) => store.purge(path),
    now: () => at,
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
  return { store, call, paid, accounts, deleted, fetches };
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
  for (const uid of ["alice", "bob", "carol"]) f.paid(uid);
  const alicePost = (
    await f.call("POST", "/api/community/publish", "alice", post("r1"))
  ).id;
  const bobPost = (
    await f.call("POST", "/api/community/publish", "bob", post("r2"))
  ).id;
  const stamp = (uid, id) =>
    f.call(
      "POST",
      "/api/community/posts/:id/reaction",
      uid,
      { stamp: "funny" },
      { id },
    );
  await stamp("alice", bobPost);
  await stamp("carol", bobPost);
  await stamp("bob", alicePost);
  f.store.data.set("users/alice", { profile: { nickname: "Alice" } });
  f.store.data.set("users/alice/dreams/d1", { id: "d1", text: "flying" });
  f.store.data.set("users/alice/diary/d2", { id: "d2", text: "coffee" });
  f.store.data.set("users/bob/dreams/d9", { id: "d9", text: "bob's" });
  f.store.data.set("usage/alice_m_2026-07", { reflections: 3 });
  return { alicePost, bobPost };
}
test("a stamp records who gave it so account deletion can find it", async () => {
  const f = fixture();
  const { bobPost } = await populate(f);
  assert.deepEqual(
    f.store.data.get(`communityPosts/${bobPost}/reactions/alice`),
    { stamp: "funny", owner: "alice" },
  );
});
test("deleting an account removes journals, membership, every usage period, posts and the user's stamps elsewhere, then the auth user", async () => {
  const f = fixture();
  const { alicePost, bobPost } = await populate(f);
  assert.ok(
    [...f.store.data.keys()].some((k) => k.startsWith("usage/alice_d_")),
  );
  const result = await f.accounts.remove("alice");
  assert.deepEqual(result, {
    deleted: true,
    posts: 1,
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
  // Her stamp on Bob's post is gone and the count is corrected; Carol's stays.
  const bobs = f.store.data.get(`communityPosts/${bobPost}`);
  assert.equal(bobs.reactions.funny, 1);
  assert.equal(
    f.store.data.has(`communityPosts/${bobPost}/reactions/carol`),
    true,
  );
  // Other users' data is intact.
  assert.equal(f.store.data.has("users/bob/dreams/d9"), true);
  assert.equal(f.store.data.has(memberPath("bob")), true);
  assert.equal(keys.filter((k) => k.startsWith("accountDeletions/")).length, 1);
  assert.deepEqual(f.deleted, ["alice"]);
  assert.equal(f.fetches[0].init.method, "DELETE");
  assert.match(f.fetches[0].url, /\/subscribers\/alice$/);
  // Alice's post is no longer in anybody's feed.
  const feed = await f.call("GET", "/api/community/feed", "carol");
  assert.deepEqual(
    feed.posts.map((p) => p.id),
    [bobPost],
  );
});
test("a retry after the auth user is already gone still succeeds and RevenueCat failures never block deletion", async () => {
  const f = fixture({ revenueCat: 500 });
  await populate(f);
  const first = await f.accounts.remove("alice");
  assert.equal(first.billing, "failed");
  const second = await f.accounts.remove("alice");
  assert.deepEqual(second, {
    deleted: true,
    posts: 0,
    reactions: 0,
    billing: "failed",
  });
  assert.deepEqual(f.deleted, ["alice"]);
});
test("RevenueCat is skipped without a secret key and an auth error surfaces after the data is gone", async () => {
  const f = fixture({ authFails: true });
  await populate(f);
  await assert.rejects(f.accounts.remove("alice"), { code: "auth/internal" });
  assert.deepEqual(
    [...f.store.data.keys()].filter((k) => k.includes("alice")),
    [],
  );
  const bare = createAccountService({
    store: f.store,
    purge: (p) => f.store.purge(p),
    deleteUser: async () => {},
    env: {},
  });
  assert.equal((await bare.remove("nobody")).billing, "skipped");
});
test("deletion refuses bad IDs and is unavailable without Firebase services", async () => {
  const f = fixture();
  await assert.rejects(f.accounts.remove("../x"), { code: "invalidInput" });
  await assert.rejects(createAccountService({ store: null }).remove("alice"), {
    code: "serviceUnavailable",
  });
});
test("a missing reactions index does not block deletion: the user's stamps are found by walking the posts", async () => {
  const f = fixture();
  const { bobPost } = await populate(f);
  const calls = [];
  f.store.listGroup = async () => {
    calls.push("listGroup");
    throw Object.assign(
      Error(
        "9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index for collection reactions and field owner.",
      ),
      { code: 9 },
    );
  };
  const result = await f.accounts.remove("alice");
  assert.deepEqual(calls, ["listGroup"]);
  assert.equal(result.reactions, 1);
  assert.equal(
    f.store.data.get(`communityPosts/${bobPost}`).reactions.funny,
    1,
  );
  assert.equal(
    f.store.data.has(`communityPosts/${bobPost}/reactions/alice`),
    false,
  );
  assert.equal(
    f.store.data.has(`communityPosts/${bobPost}/reactions/carol`),
    true,
  );
  assert.deepEqual(
    [...f.store.data.keys()].filter((k) => k.includes("alice")),
    [],
  );
  assert.deepEqual(f.deleted, ["alice"]);
  // Any other query failure still stops the deletion before data is touched.
  const g = fixture();
  await populate(g);
  g.store.listGroup = async () => {
    throw Object.assign(Error("7 PERMISSION_DENIED"), { code: 7 });
  };
  await assert.rejects(g.accounts.remove("alice"), { code: 7 });
  assert.equal(g.store.data.has("users/alice/dreams/d1"), true);
});
