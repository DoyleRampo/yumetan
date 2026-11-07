import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  runSetup,
  createClient,
  writeMeasurementIds,
  STREAMS,
  EVENT_DIMENSIONS,
  USER_DIMENSIONS,
  METRICS,
  KEY_EVENTS,
  AUDIENCES,
  DEFAULT_PROPERTY,
} from "../scripts/ga4-setup.mjs";
const quiet = { log() {}, warn() {} };
// An Admin API that remembers what was created, so a second run finds it.
function fakeApi(initial = {}) {
  const state = {
    property: {
      displayName: "yumetan",
      timeZone: "America/Los_Angeles",
      currencyCode: "USD",
    },
    dataStreams: [],
    customDimensions: [],
    customMetrics: [],
    keyEvents: [{ eventName: "purchase" }],
    retention: {
      eventDataRetention: "TWO_MONTHS",
      resetUserDataOnNewActivity: false,
    },
    secrets: {},
    audiences: [],
    firebaseLinks: [],
    ...initial,
  };
  const calls = [];
  let n = 100;
  const fetch = async (url, init) => {
    const method = init.method;
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v1(beta|alpha)\//, "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, path, body, version: u.pathname.split("/")[1] });
    assert.equal(init.headers.Authorization, "Bearer tok");
    const json = (data, status = 200) => ({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(data),
    });
    const m = path.match(/^properties\/(\d+)(?:\/(.*))?$/);
    assert.ok(m, path);
    const rest = m[2] || "";
    if (!rest) {
      if (method === "GET") return json(state.property);
      Object.assign(state.property, body);
      return json(state.property);
    }
    if (rest === "dataStreams") {
      if (method === "GET") return json({ dataStreams: state.dataStreams });
      const stream = {
        ...body,
        name: `properties/${m[1]}/dataStreams/${++n}`,
        webStreamData: { ...body.webStreamData, measurementId: `G-${n}` },
      };
      state.dataStreams.push(stream);
      return json(stream);
    }
    if (/^dataStreams\/\d+\/enhancedMeasurementSettings$/.test(rest))
      return json(body);
    if (/^dataStreams\/\d+\/measurementProtocolSecrets$/.test(rest)) {
      const key = rest.split("/")[1];
      state.secrets[key] = state.secrets[key] || [];
      if (method === "GET")
        return json({ measurementProtocolSecrets: state.secrets[key] });
      const secret = {
        ...body,
        name: `${rest}/${++n}`,
        secretValue: `secret-${n}`,
      };
      state.secrets[key].push(secret);
      return json(secret);
    }
    if (rest === "firebaseLinks") {
      if (method === "GET") return json({ firebaseLinks: state.firebaseLinks });
      state.firebaseLinks.push({ ...body, name: `${path}/${++n}` });
      return json(state.firebaseLinks.at(-1));
    }
    for (const [key, list] of [
      ["customDimensions", state.customDimensions],
      ["customMetrics", state.customMetrics],
      ["keyEvents", state.keyEvents],
      ["audiences", state.audiences],
    ])
      if (rest === key) {
        if (method === "GET") return json({ [key]: list });
        list.push({ ...body, name: `${key}/${++n}` });
        return json(list.at(-1));
      }
    if (rest === "dataRetentionSettings") {
      if (method === "GET") return json(state.retention);
      Object.assign(state.retention, body);
      return json(state.retention);
    }
    return json({ error: { message: `unexpected ${path}` } }, 404);
  };
  return { state, calls, fetch };
}
const args = (extra = {}) => ({ ...parseArgs([]), ...extra });
test("arguments: property id forms, flags and mistakes", () => {
  assert.equal(parseArgs([]).property, DEFAULT_PROPERTY);
  assert.equal(parseArgs(["--property", "properties/123"]).property, "123");
  assert.equal(
    parseArgs([
      "--property=456",
      "--write",
      "--dry-run",
      "--keep-locale",
      "--no-audiences",
    ]).write,
    true,
  );
  const a = parseArgs([
    "--property=456",
    "--write",
    "--dry-run",
    "--keep-locale",
    "--no-audiences",
    "--token=abc",
  ]);
  assert.deepEqual(
    [a.property, a.dryRun, a.keepLocale, a.audiences, a.token],
    ["456", true, true, false, "abc"],
  );
  assert.throws(() => parseArgs(["--property", "abc"]), /numeric/);
  assert.throws(() => parseArgs(["--bogus"]), /Unknown option/);
});
test("a fresh property gets streams, dimensions, metrics, key events, retention, a secret and audiences", async () => {
  const api = fakeApi();
  const client = createClient({
    token: "tok",
    fetch: api.fetch,
    log: quiet.log,
  });
  const result = await runSetup({
    args: args(),
    client,
    ...quiet,
    siteUrl: "https://yumetan.example",
  });
  assert.deepEqual(api.state.property, {
    displayName: "yumetan",
    timeZone: "Asia/Tokyo",
    currencyCode: "JPY",
  });
  assert.equal(api.state.dataStreams.length, 2);
  assert.deepEqual(
    api.state.dataStreams.map((s) => s.webStreamData.defaultUri),
    ["https://yumetan.example", STREAMS[1].defaultUri],
  );
  assert.equal(
    result.measurementIds.landing,
    api.state.dataStreams[0].webStreamData.measurementId,
  );
  assert.equal(
    result.measurementIds.app,
    api.state.dataStreams[1].webStreamData.measurementId,
  );
  const enhanced = api.calls.filter((c) =>
    c.path.endsWith("enhancedMeasurementSettings"),
  );
  assert.equal(enhanced.length, 2);
  assert.equal(enhanced[0].body.pageChangesEnabled, true);
  assert.equal(enhanced[1].body.pageChangesEnabled, false);
  assert.ok(
    enhanced.every(
      (c) =>
        c.body.streamEnabled &&
        c.body.scrollsEnabled &&
        c.body.outboundClicksEnabled,
    ),
  );
  assert.equal(
    api.state.customDimensions.filter((d) => d.scope === "EVENT").length,
    Object.keys(EVENT_DIMENSIONS).length,
  );
  assert.equal(
    api.state.customDimensions.filter((d) => d.scope === "USER").length,
    Object.keys(USER_DIMENSIONS).length,
  );
  assert.ok(
    Object.keys(EVENT_DIMENSIONS).length <= 50 &&
      Object.keys(USER_DIMENSIONS).length <= 25,
  );
  assert.equal(api.state.customMetrics.length, Object.keys(METRICS).length);
  assert.ok(
    api.state.customMetrics.every(
      (m) => m.measurementUnit === "STANDARD" && m.scope === "EVENT",
    ),
  );
  assert.deepEqual(
    api.state.keyEvents.map((k) => k.eventName),
    ["purchase", ...KEY_EVENTS],
  );
  assert.deepEqual(api.state.retention, {
    eventDataRetention: "FOURTEEN_MONTHS",
    resetUserDataOnNewActivity: true,
  });
  const appStream = api.state.dataStreams[1].name.split("/").at(-1);
  assert.equal(api.state.secrets[appStream].length, 1);
  assert.equal(api.state.secrets[appStream][0].displayName, "yumetan-server");
  assert.equal(result.apiSecret, api.state.secrets[appStream][0].secretValue);
  assert.equal(api.state.audiences.length, AUDIENCES.length);
  assert.deepEqual(
    api.state.firebaseLinks.map((l) => l.project),
    ["projects/yumetan-a31f0"],
  );
  assert.ok(
    api.calls
      .filter((c) => c.path.endsWith("/audiences"))
      .every((c) => c.version === "v1alpha"),
  );
  assert.equal(result.warnings.length, 0);
  // Running again changes nothing: everything is found and kept.
  const before = JSON.stringify(api.state);
  const again = await runSetup({
    args: args(),
    client,
    ...quiet,
    siteUrl: "https://yumetan.example",
  });
  assert.equal(JSON.stringify(api.state), before);
  assert.equal(again.created.length, 0);
  assert.ok(again.kept.length > 20);
  assert.equal(again.apiSecret, result.apiSecret);
});
test("--keep-locale and --no-audiences leave those alone; a refused call becomes a warning", async () => {
  const api = fakeApi();
  const failing = async (url, init) => {
    if (/customMetrics$/.test(new URL(url).pathname) && init.method === "POST")
      return {
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({ error: { message: "limit reached" } }),
      };
    return api.fetch(url, init);
  };
  const client = createClient({ token: "tok", fetch: failing, log: quiet.log });
  const result = await runSetup({
    args: args({ keepLocale: true, audiences: false }),
    client,
    ...quiet,
  });
  assert.equal(api.state.property.timeZone, "America/Los_Angeles");
  assert.equal(api.state.audiences.length, 0);
  assert.equal(api.state.customMetrics.length, 0);
  assert.equal(result.warnings.length, Object.keys(METRICS).length);
  assert.match(result.warnings[0], /limit reached/);
});
test("dry-run reads but never writes", async () => {
  const api = fakeApi();
  const client = createClient({
    token: "tok",
    fetch: api.fetch,
    dryRun: true,
    log: quiet.log,
  });
  const result = await runSetup({
    args: args({ dryRun: true }),
    client,
    ...quiet,
  });
  assert.ok(api.calls.every((c) => c.method === "GET"));
  assert.equal(api.state.dataStreams.length, 0);
  assert.equal(result.measurementIds.app, "G-DRYRUN");
});
test("writeMeasurementIds fills the two config files and ignores bad ids", () => {
  const files = {
    "config.js":
      'window.YUMETAN_CONFIG = { apiBase: "", ga4MeasurementId: "" };\n',
    "release.mjs":
      'export const GA4_MEASUREMENT_ID = "";\nexport const X = 1;\n',
  };
  const fsModule = {
    readFileSync: (f) => files[f],
    writeFileSync: (f, s) => {
      files[f] = s;
    },
  };
  const written = writeMeasurementIds(
    { landing: "G-LP1", app: "G-APP1" },
    { config: "config.js", release: "release.mjs" },
    fsModule,
  );
  assert.deepEqual(written, ["config.js", "release.mjs"]);
  assert.equal(
    files["config.js"],
    'window.YUMETAN_CONFIG = { apiBase: "", ga4MeasurementId: "G-APP1" };\n',
  );
  assert.equal(
    files["release.mjs"],
    'export const GA4_MEASUREMENT_ID = "G-LP1";\nexport const X = 1;\n',
  );
  assert.deepEqual(
    writeMeasurementIds(
      { landing: "", app: "nope" },
      { config: "config.js", release: "release.mjs" },
      fsModule,
    ),
    [],
  );
});
test("the repository's config files match the writer's patterns", async () => {
  const fs = await import("node:fs");
  assert.match(
    fs.readFileSync("public/config.js", "utf8"),
    /ga4MeasurementId:\s*"[^"]*"/,
  );
  assert.match(
    fs.readFileSync("landing/assets/release-config.mjs", "utf8"),
    /GA4_MEASUREMENT_ID = "[^"]*"/,
  );
});
