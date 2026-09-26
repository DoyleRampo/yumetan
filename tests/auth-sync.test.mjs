import test from "node:test";
import { authError, authErrorKey } from "../public/core/auth-i18n.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createAuthBridge } from "../server/auth-bridge.js";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createCloudClient } from "../public/core/cloud-client.js";
import {
  providerLogin,
  credentialLogin,
} from "../public/core/auth-providers.js";
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
function cloudFixture(store, uid = "alice", A = {}, user = {}) {
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
    auth: { currentUser: { uid, ...user } },
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

test("native Apple credentials sign in, upgrade a guest, and never silently link a used identity", async () => {
  const calls = [];
  class Provider {
    constructor(id) {
      this.id = id;
    }
    credential(input) {
      return { provider: this.id, ...input };
    }
    static credentialFromError() {
      return Provider.recovered;
    }
  }
  // What Firebase attaches to a credential-already-in-use error: usable on its
  // own only when it carries a pending token (or a nonce).
  Provider.recovered = {
    provider: "apple.com",
    fromError: true,
    pendingToken: "pt",
  };
  const A = {
    OAuthProvider: Provider,
    signInWithCredential: async (_, credential) => {
      calls.push(["signIn", credential]);
      return { user: { uid: "apple-user" } };
    },
    linkWithCredential: async (user, credential) => {
      calls.push(["link", credential]);
      if (user.uid === "guest-used")
        throw { code: "auth/credential-already-in-use" };
      return { user: { uid: user.uid } };
    },
  };
  const input = { idToken: "jwt", rawNonce: "nonce" };
  assert.equal(
    (await credentialLogin(A, {}, "apple", input)).user.uid,
    "apple-user",
  );
  assert.deepEqual(calls[0], [
    "signIn",
    { provider: "apple.com", idToken: "jwt", rawNonce: "nonce" },
  ]);
  assert.equal(
    (
      await credentialLogin(A, { currentUser: { uid: "guest" } }, "apple", {
        ...input,
        upgrade: true,
      })
    ).user.uid,
    "guest",
  );
  const conflict = await credentialLogin(
    A,
    { currentUser: { uid: "guest-used" } },
    "apple",
    { ...input, upgrade: true },
  );
  // A nonce-bound Apple token is sent again as is: the credential Firebase
  // attaches to the error (a pending token without the nonce) is rejected by the
  // backend with auth/missing-or-invalid-nonce.
  assert.equal(conflict.user.uid, "apple-user");
  assert.deepEqual(calls.at(-1), [
    "signIn",
    { provider: "apple.com", idToken: "jwt", rawNonce: "nonce" },
  ]);
  // A token without a nonce (Google) still prefers Firebase's recovered credential.
  const google = await credentialLogin(
    A,
    { currentUser: { uid: "guest-used" } },
    "google",
    { idToken: "gjwt", accessToken: "gat", upgrade: true },
  );
  assert.equal(google.user.uid, "apple-user");
  assert.deepEqual(calls.at(-1), [
    "signIn",
    { provider: "apple.com", fromError: true, pendingToken: "pt" },
  ]);
  Provider.recovered = null;
  await credentialLogin(A, { currentUser: { uid: "guest-used" } }, "google", {
    idToken: "gjwt",
    upgrade: true,
  });
  assert.deepEqual(calls.at(-1), [
    "signIn",
    { provider: "google.com", idToken: "gjwt", rawNonce: undefined },
  ]);
  // Every failure explains itself with a specific message and keeps its code.
  assert.equal(authErrorKey("auth/apple-unknown"), "appleDevice");
  assert.equal(authErrorKey("auth/invalid-credential"), "appleToken");
  assert.equal(authErrorKey("auth/missing-or-invalid-nonce"), "appleToken");
  assert.equal(authErrorKey("auth/network-request-failed"), "network");
  assert.equal(authErrorKey("auth/operation-not-allowed"), "config");
  assert.ok(
    authError("auth/invalid-credential", "ja").endsWith(
      "(auth/invalid-credential)",
    ),
  );
  assert.ok(!authError("auth/popup-closed-by-user", "ja").includes("auth/"));
  await assert.rejects(
    credentialLogin(A, { currentUser: { uid: "guest-used" } }, "apple", {
      ...input,
      link: true,
    }),
    { code: "auth/credential-already-in-use" },
  );
  await assert.rejects(credentialLogin(A, {}, "apple", {}), {
    code: "authFailed",
  });
  await assert.rejects(credentialLogin(A, {}, "nope", input));
});
test("the client fallback erases the journals before the identity, and refuses on a stale sign-in", async () => {
  const store = new MemoryStore(),
    deleted = [],
    fresh = { metadata: { lastSignInTime: new Date().toISOString() } },
    local = {
      profile: profile("Alice"),
      records: [record("dream"), record("diary", { kind: "diary" })],
      deleted: ["gone"],
    };
  await cloudFixture(store).syncSnapshot(local);
  const stale = cloudFixture(
    store,
    "alice",
    {},
    {
      metadata: { lastSignInTime: "2020-01-01T00:00:00Z" },
    },
  );
  await assert.rejects(stale.deleteAccount(), {
    code: "auth/requires-recent-login",
  });
  // Nothing was touched, so retrying after a fresh sign-in still deletes everything.
  assert.notEqual(store.data.size, 0);
  const client = cloudFixture(
    store,
    "alice",
    { deleteUser: async (user) => deleted.push(user.uid) },
    fresh,
  );
  await client.deleteAccount();
  assert.deepEqual(deleted, ["alice"]);
  assert.equal(store.data.size, 0);
  assert.equal(client.uid(), "");
});
test("deleting an account leaves no device cache that could restore a character", async () => {
  const entries = {
    "yumetan.v4.active": '"yumetan.v4.alice"',
    "yumetan.v4.alice": '{"profile":{"nickname":"Alice"}}',
    "yumetan.v4.alice.quiz": '{"index":9}',
    "yumetan.v4.alice.guest-import": '"yumetan.v4.local"',
    "yumetan.v4.alice.diary-saves": "{}",
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
  assert.equal(await read("yumetan.v4.local"), null);
  assert.deepEqual(await read("yumetan.v4.options"), { language: "en" });
  delete globalThis.localStorage;
});
test("email sign-up creates the account in a throwaway auth instance and never links or signs in the guest session", async () => {
  const calls = [];
  const guest = { uid: "guest-1", isAnonymous: true };
  const mainAuth = { currentUser: guest, app: { options: { apiKey: "k" } } };
  const A = {
    onAuthStateChanged: () => {},
    inMemoryPersistence: "memory",
    initializeAuth: (app, opts) => {
      calls.push(["initializeAuth", app.name, opts.persistence]);
      return { app };
    },
    createUserWithEmailAndPassword: async (auth, email) => {
      calls.push(["create", auth.app.name, email]);
      return { user: { uid: "new-user", email } };
    },
    signOut: async (auth) => calls.push(["signOut", auth.app.name]),
    linkWithCredential: async () => {
      throw new Error("must not link the guest account");
    },
    signInWithEmailAndPassword: async (auth, email) => {
      calls.push(["signIn", auth === mainAuth, email]);
      return { user: { uid: "new-user", email, isAnonymous: false } };
    },
  };
  const client = createCloudClient({
    A,
    fs: {},
    db: null,
    auth: mainAuth,
    initializeApp: (options, name) => {
      calls.push(["initializeApp", options.apiKey, name]);
      return { name };
    },
    deleteApp: async (app) => calls.push(["deleteApp", app.name]),
  });
  const created = await client.signUp("a@test.invalid", "secret1");
  assert.equal(created.uid, "new-user");
  assert.equal(client.uid(), "guest-1");
  assert.equal(client.isAnonymous(), true);
  const tempName = calls.find((c) => c[0] === "initializeApp")[2];
  assert.match(tempName, /^yumetan-signup-/);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["initializeApp", "initializeAuth", "create", "signOut", "deleteApp"],
  );
  assert.deepEqual(calls[2], ["create", tempName, "a@test.invalid"]);
  assert.equal(client.resetPassword, undefined);
  await client.signIn("a@test.invalid", "secret1");
  assert.deepEqual(calls.at(-1), ["signIn", true, "a@test.invalid"]);
  assert.equal(client.uid(), "new-user");
  assert.equal(client.isAnonymous(), false);
});
