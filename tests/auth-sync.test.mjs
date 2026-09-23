import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createAuthBridge } from "../server/auth-bridge.js";
import { createAccountRemoval } from "../server/account.js";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createCloudClient } from "../public/core/cloud-client.js";
import { providerLogin } from "../public/core/auth-providers.js";
import { importGuest } from "../public/core/account-sync.js";
import { normalizeRecord } from "../public/core/storage.js";
const profile = (nickname, updatedAt = "2026-09-17T00:00:00Z") => ({
  nickname,
  language: "en",
  typeAnswers: Array(16).fill(0),
  updatedAt,
});
const record = (id, extra = {}) =>
  normalizeRecord({
    id,
    text: id,
    createdAt: "2026-09-17T00:00:00Z",
    ...extra,
  });
const sha = (v) => createHash("sha256").update(v).digest("base64url");
function bridgeFixture() {
  const store = new MemoryStore();
  let clock = 2000000000000;
  const users = {
    guest: { uid: "guest", firebase: { sign_in_provider: "anonymous" } },
    alice: { uid: "alice", firebase: { sign_in_provider: "google.com" } },
  };
  const bridge = createAuthBridge({
    store,
    now: () => clock,
    verify: async (token) => {
      if (!users[token]) throw Error("bad token");
      return { ...users[token], auth_time: Math.floor(clock / 1000) };
    },
    getUser: async (uid) => ({
      uid,
      providerData: [{ providerId: "google.com" }],
      disabled: uid === "disabled",
    }),
    mint: async (uid) => "custom:" + uid,
  });
  return { bridge, store, advance: () => (clock += 300001) };
}
test("native login requires both independent proofs and only redeems once under concurrency", async () => {
  const { bridge } = bridgeFixture(),
    verifier = "v".repeat(43);
  const started = await bridge.start({
    provider: "google",
    challenge: sha(verifier),
    idToken: "guest",
  });
  assert.equal((await bridge.bootstrap(started)).token, "custom:guest");
  await assert.rejects(
    bridge.bootstrap({ ...started, browserKey: "x".repeat(43) }),
  );
  assert.deepEqual(await bridge.consume({ id: started.id, verifier }), {
    pending: true,
  });
  await bridge.complete({ ...started, idToken: "alice" });
  await assert.rejects(
    bridge.consume({ id: started.id, verifier: "x".repeat(43) }),
  );
  const outcomes = await Promise.allSettled([
    bridge.consume({ id: started.id, verifier }),
    bridge.consume({ id: started.id, verifier }),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    outcomes.find((x) => x.status === "fulfilled").value.token,
    "custom:alice",
  );
});
test("bridge rejects changed link account, missing provider, expired sessions and unconfigured backend", async () => {
  const { bridge, advance } = bridgeFixture(),
    challenge = sha("v".repeat(43));
  let s = await bridge.start({
    provider: "apple",
    challenge,
    idToken: "alice",
    link: true,
  });
  await assert.rejects(bridge.complete({ ...s, idToken: "alice" }));
  s = await bridge.start({
    provider: "google",
    challenge,
    idToken: "alice",
    link: true,
  });
  await assert.rejects(bridge.complete({ ...s, idToken: "guest" }));
  advance();
  await assert.rejects(bridge.bootstrap(s));
  await assert.rejects(
    createAuthBridge({}).start({ provider: "google", challenge }),
  );
  await assert.rejects(bridge.start({ provider: "arbitrary", challenge }));
  await assert.rejects(
    bridge.start({ provider: "google", challenge, link: true }),
  );
});
test("bridge rejects unverified authentication and limits sessions per account", async () => {
  const { bridge } = bridgeFixture(),
    challenge = sha("v".repeat(43));
  await assert.rejects(
    bridge.start({ provider: "google", challenge, idToken: "fake" }),
  );
  for (let n = 0; n < 5; n++)
    await bridge.start({ provider: "google", challenge, idToken: "alice" });
  await assert.rejects(
    bridge.start({ provider: "google", challenge, idToken: "alice" }),
    /quotaReached/,
  );
});
function cloudFixture(store, uid = "alice", A = {}) {
  const snapshot = (path, data) => ({
    id: path.split("/").at(-1),
    data: () => structuredClone(data),
    exists: () => !!data,
  });
  const fs = {
    doc: (...args) => args.filter(Boolean).join("/"),
    collection: (...args) => args.filter(Boolean).join("/"),
    getDocFromServer: async (path) => snapshot(path, await store.get(path)),
    getDocsFromServer: async (path) => ({
      docs: [...store.data]
        .filter(
          ([p]) =>
            p.startsWith(path + "/") &&
            p.split("/").length === path.split("/").length + 1,
        )
        .map(([p, d]) => snapshot(p, d)),
    }),
    deleteDoc: async (path) => store.transaction((tx) => tx.delete(path)),
    runTransaction: (_, fn) =>
      store.transaction((tx) =>
        fn({
          get: async (p) => snapshot(p, await tx.get(p)),
          set: (p, v, opts) =>
            tx.set(p, opts?.merge ? { ...store.data.get(p), ...v } : v),
          delete: (p) => tx.delete(p),
        }),
      ),
  };
  return createCloudClient({
    db: null,
    fs,
    A: { onAuthStateChanged: () => {}, ...A },
    auth: { currentUser: { uid } },
  });
}
test("a new device restores account profile, character, photo, diary and dream; another account sees none", async () => {
  const store = new MemoryStore(),
    a = cloudFixture(store),
    empty = { profile: null, records: [], deleted: [] };
  const local = {
    profile: { ...profile("Alice"), characterSet: "moonkeepers-v1" },
    records: [
      record("dream", { photo: "data:image/png;base64,YQ==" }),
      record("diary", { kind: "diary" }),
    ],
    deleted: [],
  };
  await a.syncSnapshot(local);
  const restored = await cloudFixture(store).syncSnapshot(empty);
  assert.equal(restored.profile.nickname, "Alice");
  assert.equal(restored.profile.characterSet, "moonkeepers-v1");
  assert.equal(restored.records.length, 2);
  assert.equal(
    restored.records.find((r) => r.id === "dream").photo,
    "data:image/png;base64,YQ==",
  );
  assert.equal(
    (await cloudFixture(store, "bob").syncSnapshot(empty)).records.length,
    0,
  );
});
test("old offline data cannot resurrect a deleted record or overwrite a newer profile", async () => {
  const store = new MemoryStore(),
    a = cloudFixture(store),
    old = { profile: profile("Old"), records: [record("dream")], deleted: [] };
  await a.syncSnapshot(old);
  await a.syncSnapshot({
    profile: profile("New", "2026-09-18T00:00:00Z"),
    records: [],
    deleted: ["dream"],
  });
  const restored = await cloudFixture(store).syncSnapshot(old);
  assert.deepEqual(restored.records, []);
  assert.equal(restored.profile.nickname, "New");
  assert.deepEqual(restored.deleted, ["dream"]);
});
test("simultaneous edits keep latest record and photo removal propagates", async () => {
  const store = new MemoryStore(),
    a = cloudFixture(store),
    b = cloudFixture(store),
    profileData = profile("Alice");
  await a.syncSnapshot({
    profile: profileData,
    records: [record("dream", { photo: "data:image/png;base64,YQ==" })],
    deleted: [],
  });
  await Promise.all([
    a.syncSnapshot({
      profile: profileData,
      records: [
        record("dream", {
          text: "new",
          photo: null,
          updatedAt: "2026-09-18T00:00:00Z",
        }),
      ],
      deleted: [],
    }),
    b.syncSnapshot({
      profile: profileData,
      records: [
        record("dream", { text: "old", updatedAt: "2026-09-17T12:00:00Z" }),
      ],
      deleted: [],
    }),
  ]);
  const restored = await a.loadSnapshot();
  assert.equal(restored.records[0].text, "new");
  assert.equal(restored.records[0].photo, null);
});
test("guest import is idempotent and preserves destination profile, diary and tombstones", () => {
  const account = {
    profile: profile("Member"),
    records: [record("diary", { kind: "diary" })],
    deleted: ["deleted"],
  };
  const guest = {
    profile: profile("Guest"),
    records: [
      record("other-diary", { kind: "diary" }),
      record("dream"),
      record("deleted"),
    ],
    deleted: [],
  };
  const result = importGuest(account, guest);
  assert.equal(result.profile.nickname, "Member");
  assert.deepEqual(result.records.map((r) => r.id).sort(), ["diary", "dream"]);
  assert.deepEqual(importGuest(result, guest), result);
});
test("all providers use Firebase SDK; only guests may fall back from linking to existing account login", async () => {
  class Provider {
    constructor(id = "google.com") {
      this.id = id;
    }
    addScope() {}
    setCustomParameters() {}
    static credentialFromError() {
      return { token: "provider-credential" };
    }
  }
  let mode;
  const A = {
    GoogleAuthProvider: Provider,
    OAuthProvider: Provider,
    signInWithPopup: async (_, p) => {
      mode = p.id;
      return { user: { uid: "alice" } };
    },
    linkWithPopup: async () => {
      throw { code: "auth/credential-already-in-use" };
    },
    signInWithCredential: async () => ({ user: { uid: "existing" } }),
  };
  for (const [provider, expected] of [
    ["google", "google.com"],
    ["apple", "apple.com"],
    ["line", "oidc.line"],
  ]) {
    await providerLogin(A, {}, provider);
    assert.equal(mode, expected);
  }
  assert.equal(
    (await providerLogin(A, { currentUser: {} }, "google", { upgrade: true }))
      .user.uid,
    "existing",
  );
  await assert.rejects(
    providerLogin(A, { currentUser: {} }, "google", { link: true }),
  );
});
test("account deletion clears cloud data, shared posts and the sign-in identity", async () => {
  const store = new MemoryStore();
  await cloudFixture(store).syncSnapshot({
    profile: profile("Alice"),
    records: [record("dream"), record("diary", { kind: "diary" })],
    deleted: ["gone"],
  });
  for (const [path, data] of [
    ["communityPosts/post-a", { owner: "alice", public: true }],
    ["communityPosts/post-a/comments/c1", { text: "hi" }],
    ["communityPosts/post-b", { owner: "bob", public: true }],
    ["communityBlocks/alice/targets/bob", { at: 1 }],
    ["memberships/alice", { plan: "starter" }],
    ["communityStats/alice", { active: 1 }],
  ])
    await store.transaction((tx) => tx.set(path, data));
  const removed = [];
  const accounts = createAccountRemoval({
    access: { store },
    deleteUser: async (uid) => removed.push(uid),
  });
  assert.deepEqual(await accounts.remove("alice"), { deleted: true });
  assert.deepEqual(removed, ["alice"]);
  assert.deepEqual(
    [...store.data.keys()].filter(
      (p) => !p.startsWith("communityPosts/post-b"),
    ),
    [],
  );
  // A second account keeps everything it owns.
  assert.equal((await store.get("communityPosts/post-b")).owner, "bob");
});
test("without a configured server the owner deletes their own cloud copies", async () => {
  const store = new MemoryStore(),
    deleted = [];
  await cloudFixture(store).syncSnapshot({
    profile: profile("Alice"),
    records: [record("dream"), record("diary", { kind: "diary" })],
    deleted: ["gone"],
  });
  const client = cloudFixture(store, "alice", {
    deleteUser: async (user) => deleted.push(user.uid),
  });
  await client.deleteAccount();
  assert.deepEqual(deleted, ["alice"]);
  assert.equal(store.data.size, 0);
  assert.equal(client.uid(), "");
});
test("deleting an account leaves no device cache that could restore its character", async () => {
  const entries = {
    "yumetan.v4.active": '"yumetan.v4.alice"',
    "yumetan.v4.alice": '{"profile":{"nickname":"Alice"}}',
    "yumetan.v4.alice.quiz": '{"index":9}',
    "yumetan.v4.alice.guest-import": '"yumetan.v4.local"',
    "yumetan.v4.local": '{"profile":{"nickname":"Guest"}}',
    "yumetan.v4.cloud-adopted": "true",
    "yumetan.auth.pending": '{"id":"x"}',
    "yumetan.settings": '{"profile":{"nickname":"Old"}}',
    "yumetan.v4.options": '{"language":"en"}',
    "other.app": "keep",
  };
  const storage = Object.defineProperties(
    { ...entries },
    Object.fromEntries(
      [
        ["getItem", (k) => (k in storage ? storage[k] : null)],
        ["setItem", (k, v) => void (storage[k] = String(v))],
        ["removeItem", (k) => void delete storage[k]],
      ].map(([name, value]) => [name, { value }]),
    ),
  );
  globalThis.localStorage = storage;
  const { purgeAccounts, read } = await import("../public/core/storage.js");
  await purgeAccounts();
  assert.deepEqual(Object.keys(storage).sort(), [
    "other.app",
    "yumetan.v4.options",
  ]);
  assert.equal(await read("yumetan.v4.alice"), null);
  assert.deepEqual(await read("yumetan.v4.options"), { language: "en" });
  delete globalThis.localStorage;
});
