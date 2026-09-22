import test from "node:test";
import assert from "node:assert/strict";
// storage.js picks localStorage at import time, so stub the browser globals first.
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
const opened = [];
globalThis.window = {
  Capacitor: {
    Plugins: { AuthBrowser: { open: async (o) => opened.push(o) } },
  },
};
const { startNativeAuth, finishNativeAuth, timeoutSignal, timing } =
  await import("../public/core/native-auth.js");
timing.delay = 1;
const abort = () => Object.assign(new Error("timeout"), { name: "AbortError" });
const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
// A fetch stub driven by per-path queues of responses (or errors to throw).
function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: init.body ? JSON.parse(init.body) : null });
    assert.ok(
      init.signal instanceof AbortSignal,
      "every request has a timeout",
    );
    const queue = routes[path] || [];
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return next;
  };
  return calls;
}
const cloud = {
  idToken: async () => "guest-token",
  isAnonymous: () => true,
  signedIn: [],
  async signInToken(token) {
    this.signedIn.push(token);
  },
};
test("start waits for a sleeping server to wake up before creating the handoff", async () => {
  const calls = stubFetch({
    "/api/health": [abort(), json({}, 503), json({ ok: true })],
    "/api/auth/start": [
      json({ id: "i".repeat(43), browserKey: "b".repeat(43) }),
    ],
  });
  await startNativeAuth({
    cloud,
    provider: "google",
    link: false,
    language: "ja",
    base: "https://yumetan.onrender.com/",
    sourceKey: "yumetan.v4.guest",
  });
  assert.deepEqual(
    calls.map((c) => c.path),
    ["/api/health", "/api/health", "/api/health", "/api/auth/start"],
  );
  const start = calls.at(-1).body;
  assert.equal(start.provider, "google");
  assert.equal(start.idToken, "guest-token");
  assert.match(start.challenge, /^[A-Za-z0-9_-]{43}$/);
  const pending = JSON.parse(memory.get("yumetan.auth.pending"));
  assert.equal(pending.base, "https://yumetan.onrender.com");
  assert.notEqual(pending.verifier, start.challenge);
  assert.equal(opened.length, 1);
  assert.match(opened[0].url, /^https:\/\/yumetan\.onrender\.com\/auth\.html#/);
  assert.ok(opened[0].url.includes("browserKey=" + "b".repeat(43)));
  assert.ok(
    !opened[0].url.includes(pending.verifier),
    "device secret stays off the URL",
  );
});
test("consume retries once after a timeout and signs in with the minted token", async () => {
  memory.set("yumetan.v4.active", JSON.stringify("yumetan.v4.guest"));
  const calls = stubFetch({
    "/api/health": [json({ ok: true })],
    "/api/auth/consume": [abort(), json({ token: "custom:alice" })],
  });
  const pending = await finishNativeAuth(cloud);
  assert.equal(pending.sourceKey, "yumetan.v4.guest");
  assert.deepEqual(cloud.signedIn, ["custom:alice"]);
  assert.deepEqual(
    calls.map((c) => c.path),
    ["/api/auth/consume", "/api/health", "/api/auth/consume"],
  );
  assert.equal(memory.get("yumetan.auth.pending"), "null");
});
test("server rejections are not retried and keep their error code", async () => {
  memory.set(
    "yumetan.auth.pending",
    JSON.stringify({
      id: "x",
      verifier: "y",
      base: "https://yumetan.onrender.com",
      sourceKey: "yumetan.v4.guest",
      expires: Date.now() + 60000,
    }),
  );
  const calls = stubFetch({
    "/api/auth/consume": [json({ code: "authExpired" }, 401)],
  });
  await assert.rejects(finishNativeAuth(cloud), { code: "authExpired" });
  assert.equal(calls.length, 1);
});
test("timeoutSignal works without AbortSignal.timeout (iOS 15 WebView)", async () => {
  const original = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  try {
    const signal = timeoutSignal(5);
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(signal.aborted, true);
  } finally {
    AbortSignal.timeout = original;
  }
});
test("Google native login signs in with the SDK's tokens and never opens a browser", async () => {
  const { googleNativeAvailable, googleNativeLogin } =
    await import("../public/core/native-auth.js");
  const config = { googleIosClientId: "123-abc.apps.googleusercontent.com" };
  assert.equal(googleNativeAvailable(config), false);
  globalThis.window.Capacitor.Plugins.GoogleLogin = {
    login: async ({ clientId }) => ({
      idToken: "google-jwt",
      accessToken: "google-access",
      displayName: "Yume",
      clientId,
    }),
  };
  assert.equal(googleNativeAvailable(config), true);
  assert.equal(googleNativeAvailable({}), false);
  const calls = [];
  const user = await googleNativeLogin({
    cloud: {
      signInCredential: async (name, opts) => {
        calls.push([name, opts]);
        return { uid: "google-user" };
      },
    },
    link: false,
    upgrade: true,
    config,
  });
  assert.equal(user.uid, "google-user");
  assert.deepEqual(calls[0], [
    "google",
    {
      idToken: "google-jwt",
      accessToken: "google-access",
      link: false,
      upgrade: true,
      displayName: "Yume",
    },
  ]);
  assert.equal(opened.length, 1, "the browser handoff was not used");
  globalThis.window.Capacitor.Plugins.GoogleLogin = {
    login: async () => {
      throw { code: "auth/popup-closed-by-user" };
    },
  };
  await assert.rejects(googleNativeLogin({ cloud: {}, config }), {
    code: "auth/popup-closed-by-user",
  });
});
