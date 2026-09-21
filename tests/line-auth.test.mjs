import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "./helpers/memory-store.mjs";
import { createLineAuth } from "../server/line-auth.js";
const now = 1800000000000;
const SUB = "U" + "a".repeat(32);
function fixture(overrides = {}) {
  const store = new MemoryStore(),
    calls = [];
  let claims = {
    iss: "https://access.line.me",
    sub: SUB,
    aud: "1234567890",
    exp: Math.floor(now / 1000) + 3600,
    name: "Yume",
    picture: "https://profile.line-scdn.net/abc",
  };
  const line = createLineAuth({
    store,
    env: { LINE_CHANNEL_ID: "1234567890" },
    now: () => now,
    verify: async (token) => {
      if (token === "alice") return { uid: "alice", firebase: {} };
      if (token === "guest")
        return { uid: "guest", firebase: { sign_in_provider: "anonymous" } };
      throw new Error("bad");
    },
    mint: async (uid, extra) => `custom:${uid}:${extra.provider}`,
    fetch: async (url, init) => {
      calls.push({ url, body: Object.fromEntries(init.body) });
      if (claims instanceof Error) throw claims;
      if (typeof claims === "number")
        return { ok: false, status: claims, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => claims };
    },
    ...overrides,
  });
  return { line, store, calls, respond: (v) => (claims = v) };
}
test("a verified LINE ID token maps to one stable Firebase account", async () => {
  const f = fixture();
  const first = await f.line.login({ idToken: "tok", nonce: "n1" });
  assert.equal(first.token, `custom:line:${SUB}:oidc.line`);
  assert.equal(first.name, "Yume");
  assert.equal(f.calls[0].url, "https://api.line.me/oauth2/v2.1/verify");
  assert.deepEqual(f.calls[0].body, {
    id_token: "tok",
    client_id: "1234567890",
    nonce: "n1",
  });
  const again = await f.line.login({ idToken: "tok2" });
  assert.equal(again.token, first.token);
  assert.equal((await f.store.get("lineUsers/" + SUB)).uid, "line:" + SUB);
});
test("linking attaches LINE to the signed-in account and refuses a second account", async () => {
  const f = fixture();
  await assert.rejects(f.line.login({ idToken: "t", link: true }), {
    status: 401,
  });
  await assert.rejects(
    f.line.login({ idToken: "t", link: true }, "Bearer guest"),
    { status: 401 },
  );
  const linked = await f.line.login(
    { idToken: "t", link: true },
    "Bearer alice",
  );
  assert.equal(linked.token, "custom:alice:oidc.line");
  // Later plain logins with the same LINE user land on alice.
  assert.equal((await f.line.login({ idToken: "t" })).token, linked.token);
  await f.store.transaction(async (tx) =>
    tx.set("lineUsers/" + SUB, { uid: "bob" }),
  );
  await assert.rejects(
    f.line.login({ idToken: "t", link: true }, "Bearer alice"),
    (e) => e.status === 409 && e.code === "auth/credential-already-in-use",
  );
});
test("tokens for another channel, another issuer, expired or rejected by LINE never sign in", async () => {
  const f = fixture();
  for (const bad of [
    { aud: "999" },
    { iss: "https://evil.example" },
    { exp: Math.floor(now / 1000) - 1 },
    { sub: "not-a-line-id" },
  ]) {
    f.respond({
      iss: "https://access.line.me",
      sub: SUB,
      aud: "1234567890",
      exp: Math.floor(now / 1000) + 60,
      ...bad,
    });
    await assert.rejects(f.line.login({ idToken: "t" }), { status: 401 });
  }
  f.respond(400);
  await assert.rejects(f.line.login({ idToken: "t" }), { status: 401 });
  f.respond(new Error("network"));
  await assert.rejects(f.line.login({ idToken: "t" }), { status: 502 });
  assert.equal(await f.store.get("lineUsers/" + SUB), null);
  await assert.rejects(f.line.login({ idToken: 5 }), { status: 400 });
  const unconfigured = fixture({ env: {} });
  assert.equal(unconfigured.line.configured, false);
  await assert.rejects(unconfigured.line.login({ idToken: "t" }), {
    status: 503,
  });
});
