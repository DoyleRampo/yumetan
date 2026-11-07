import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnalytics,
  cleanParams,
  eventName,
  lengthBucket,
  newClientId,
  validClientId,
  validMeasurementId,
  CLIENT_KEY,
} from "../public/core/analytics.js";

// A page with a data layer and a <head>, but no network: the gtag script tag
// is recorded instead of loaded.
function fakePage({ hostname = "app.example" } = {}) {
  const scripts = [];
  const win = {
    dataLayer: undefined,
    location: { origin: `https://${hostname}`, hostname },
    addEventListener() {},
  };
  const doc = {
    createElement: () => {
      const el = { remove() {} };
      scripts.push(el);
      return el;
    },
    head: {
      appendChild(el) {
        el.appended = true;
      },
    },
  };
  return { win, doc, scripts };
}
const memory = () => {
  const data = new Map();
  return {
    data,
    read: async (k) => (data.has(k) ? data.get(k) : null),
    write: async (k, v) => {
      data.set(k, v);
    },
  };
};
const calls = (win) => (win.dataLayer || []).map((a) => Array.from(a));
const events = (win) =>
  calls(win)
    .filter((a) => a[0] === "event")
    .map(([, name, params]) => ({ name, params }));

test("names, parameters and buckets follow GA4 limits and never carry text", () => {
  assert.equal(eventName("Dream Save!"), "dream_save");
  assert.equal(eventName("1st"), "e1st");
  assert.equal(eventName("x".repeat(60)).length, 40);
  const params = cleanParams({
    plan: "starter",
    empty: "",
    missing: null,
    flag: true,
    off: false,
    n: 3,
    nan: NaN,
    long: "y".repeat(200),
  });
  assert.deepEqual(params, {
    plan: "starter",
    flag: 1,
    off: 0,
    n: 3,
    long: "y".repeat(100),
  });
  assert.equal(
    Object.keys(
      cleanParams(
        Object.fromEntries(
          Array.from({ length: 30 }, (_, i) => [`p${i}`, i + 1]),
        ),
      ),
    ).length,
    20,
  );
  assert.equal(lengthBucket(""), "0");
  assert.equal(lengthBucket("空を飛んだ"), "1-30");
  assert.equal(lengthBucket("a".repeat(100)), "31-100");
  assert.equal(lengthBucket("a".repeat(301)), "301+");
  assert.ok(validMeasurementId("G-ABC123XYZ"));
  assert.ok(!validMeasurementId("UA-1234-1"));
  assert.ok(!validMeasurementId(""));
  const id = newClientId(1_700_000_000_000, () => 0.5);
  assert.ok(validClientId(id), id);
  assert.equal(id.split(".")[1], "1700000000");
});

test("without a measurement ID nothing is pushed and no script is added", async () => {
  const { win, doc, scripts } = fakePage();
  const a = createAnalytics({ measurementId: "", win, doc, ...memory() });
  assert.equal(a.enabled, false);
  assert.equal(await a.init(), "");
  a.page("home");
  a.event("dream_save", { engine: "ai" });
  a.setUser("uid-1", { plan: "starter" });
  assert.equal(win.dataLayer, undefined);
  assert.equal(scripts.length, 0);
  assert.equal(a.header(), "");
});

test("init configures the stream with a persisted client id and flushes queued events in order", async () => {
  const { win, doc, scripts } = fakePage({ hostname: "localhost" });
  const store = memory();
  const a = createAnalytics({
    measurementId: "G-TEST1234",
    platform: "ios",
    appVersion: "4.8.0",
    win,
    doc,
    ...store,
  });
  // Events before init wait for the config call.
  a.page("home");
  a.event("app_open", { first_run: true });
  assert.deepEqual(events(win), []);
  const id = await a.init();
  assert.ok(validClientId(id));
  assert.equal(store.data.get(CLIENT_KEY), id);
  assert.equal(a.header(), id);
  const all = calls(win);
  assert.equal(all[0][0], "js");
  assert.equal(all[1][0], "config");
  assert.equal(all[1][1], "G-TEST1234");
  assert.equal(all[1][2].client_id, id);
  assert.equal(all[1][2].send_page_view, false);
  assert.equal(all[1][2].cookie_domain, "none");
  assert.equal(all[1][2].allow_google_signals, false);
  assert.deepEqual(all[2], [
    "set",
    "user_properties",
    { app_platform: "ios", app_version: "4.8.0" },
  ]);
  const sent = events(win);
  assert.equal(sent[0].name, "page_view");
  assert.equal(sent[0].params.screen_name, "home");
  assert.equal(sent[0].params.page_location, "https://localhost/#home");
  assert.equal(sent[0].params.app_platform, "ios");
  assert.deepEqual(sent[1], {
    name: "app_open",
    params: { first_run: 1, app_platform: "ios" },
  });
  assert.equal(scripts.length, 1);
  assert.equal(
    scripts[0].src,
    "https://www.googletagmanager.com/gtag/js?id=G-TEST1234",
  );
  assert.equal(scripts[0].async, true);
  assert.ok(scripts[0].appended);
  // A second init neither reconfigures nor adds another script.
  await a.init();
  assert.equal(calls(win).filter((c) => c[0] === "config").length, 1);
  assert.equal(scripts.length, 1);
});

test("a stored client id is reused and a damaged one replaced", async () => {
  const store = memory();
  await store.write(CLIENT_KEY, "1234567890.1700000000");
  let page = fakePage();
  let a = createAnalytics({ measurementId: "G-TEST1234", ...page, ...store });
  assert.equal(await a.init(), "1234567890.1700000000");
  await store.write(CLIENT_KEY, "<script>");
  page = fakePage();
  a = createAnalytics({ measurementId: "G-TEST1234", ...page, ...store });
  const fresh = await a.init();
  assert.ok(validClientId(fresh));
  assert.equal(store.data.get(CLIENT_KEY), fresh);
});

test("user id and properties are sent once per change and cleared on sign-out", async () => {
  const { win, doc } = fakePage();
  const a = createAnalytics({
    measurementId: "G-TEST1234",
    win,
    doc,
    ...memory(),
  });
  await a.init();
  const before = calls(win).length;
  a.setUser("uid-1", { plan: "free", dream_type: "chase", dream_level: 1 });
  a.setUser("uid-1", { plan: "free", dream_type: "chase", dream_level: 1 });
  a.setUser("uid-1", { plan: "starter", dream_type: "chase", dream_level: 2 });
  const sets = calls(win).slice(before);
  assert.deepEqual(sets, [
    ["set", { user_id: "uid-1" }],
    [
      "set",
      "user_properties",
      { plan: "free", dream_type: "chase", dream_level: 1 },
    ],
    ["set", "user_properties", { plan: "starter", dream_level: 2 }],
  ]);
  a.setUser(null, { plan: "free" });
  assert.deepEqual(calls(win).slice(-2), [
    ["set", { user_id: null }],
    ["set", "user_properties", { plan: "free" }],
  ]);
  assert.deepEqual(a.userProperties(), { plan: "free" });
});

test("debug mode and a non-localhost origin configure accordingly", async () => {
  const { win, doc } = fakePage({ hostname: "yumetan.example" });
  const a = createAnalytics({
    measurementId: "G-TEST1234",
    win,
    doc,
    debug: true,
    ...memory(),
  });
  await a.init();
  const config = calls(win).find((c) => c[0] === "config")[2];
  assert.equal(config.debug_mode, true);
  assert.equal("cookie_domain" in config, false);
});
