// Google Analytics 4 for the web app and the iOS / Android WebViews, through
// gtag.js (a GA4 *web* data stream; no native SDK, so the same measurement ID
// and the same events serve every platform). What is sent:
//
//   - page_view for every screen (page_title / screen_name = the page id);
//   - the app's own events (dream_save, dream_read, quiz_complete, sign_up,
//     begin_checkout, …) with short, non-personal parameters;
//   - user properties (plan, dream_type, dream_level, app_platform, …) and the
//     Firebase UID as user_id while signed in, so one person counts once
//     across devices;
//   - gtag's own session / engagement signals (session_start, user_engagement).
//
// Dream and diary texts, nicknames, e-mail addresses and photos are never sent.
// Without a measurement ID (or while the gtag script cannot load) every call is
// a no-op, and the app never waits for analytics.
//
// The client id is generated here and kept in the app's own storage so the
// WebView (where cookies are unreliable on iOS) and a reinstall-free upgrade
// keep counting the same device as one user. It is also sent to the API in the
// X-Yumetan-Analytics header so the server's Measurement Protocol events
// (renewals, cancellations, refunds) join the same user in GA4.
export const CLIENT_KEY = "yumetan.analytics.client";
const ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;
const GTAG_URL = "https://www.googletagmanager.com/gtag/js?id=";
const MAX_PARAMS = 20;
export const validMeasurementId = (id) => ID_PATTERN.test(String(id || ""));
// GA4 client ids look like "<10 digits>.<unix seconds>".
export const validClientId = (id) =>
  /^\d{6,12}\.\d{6,12}$/.test(String(id || ""));
export function newClientId(now = Date.now(), random = Math.random) {
  const first = String(Math.floor(random() * 9e9) + 1e9).slice(0, 10);
  return `${first}.${Math.floor(now / 1000)}`;
}
// GA4 limits: event names 40 chars, parameter names 40, string values 100,
// 25 parameters. Names are snake_case ASCII here.
export const eventName = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]/, "e$&")
    .slice(0, 40) || "event";
export function cleanParams(params = {}) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (Object.keys(out).length >= MAX_PARAMS) break;
    if (value == null || value === "") continue;
    const name = eventName(key);
    if (typeof value === "number") {
      if (Number.isFinite(value)) out[name] = value;
    } else if (typeof value === "boolean") out[name] = value ? 1 : 0;
    else out[name] = String(value).slice(0, 100);
  }
  return out;
}
// Text lengths are reported as buckets, never as the text itself.
export const lengthBucket = (text) => {
  const n = String(text || "").trim().length;
  return n === 0
    ? "0"
    : n <= 30
      ? "1-30"
      : n <= 100
        ? "31-100"
        : n <= 300
          ? "101-300"
          : "301+";
};
export function createAnalytics({
  measurementId = "",
  platform = "web",
  appVersion = "",
  read = async () => null,
  write = async () => {},
  win = globalThis,
  doc = globalThis.document,
  debug = false,
} = {}) {
  const enabled = validMeasurementId(measurementId);
  let clientId = "",
    configured = false,
    loading = null,
    loaded = false,
    userId = null,
    userProps = {};
  const queue = [];
  // The official gtag stub: "function gtag(){dataLayer.push(arguments)}".
  if (enabled && typeof win.gtag !== "function") {
    win.dataLayer = win.dataLayer || [];
    win.gtag = function () {
      win.dataLayer.push(arguments);
    };
  }
  const gtag = (...args) => {
    if (!enabled) return;
    win.gtag(...args);
  };
  function loadScript() {
    if (!enabled || loaded || loading || !doc?.createElement) return;
    const script = doc.createElement("script");
    script.async = true;
    script.src = GTAG_URL + encodeURIComponent(measurementId);
    loading = new Promise((resolve) => {
      script.onload = () => {
        loaded = true;
        loading = null;
        resolve(true);
      };
      // Offline or blocked: try again when the network returns. The data
      // layer keeps the events gathered meanwhile.
      script.onerror = () => {
        loading = null;
        script.remove();
        win.addEventListener?.("online", () => loadScript(), { once: true });
        resolve(false);
      };
    });
    (doc.head || doc.documentElement).appendChild(script);
  }
  function flush() {
    while (queue.length) gtag(...queue.shift());
  }
  const send = (...args) => {
    if (!enabled) return;
    if (configured) gtag(...args);
    else queue.push(args);
  };
  return {
    enabled,
    measurementId,
    clientId: () => clientId,
    // Resolves the device's client id (creating it on first run), configures
    // the stream and starts loading gtag.js. Safe to call more than once.
    async init() {
      if (!enabled) return "";
      if (!clientId) {
        let stored = null;
        try {
          stored = await read(CLIENT_KEY);
        } catch {}
        clientId = validClientId(stored) ? stored : newClientId();
        if (stored !== clientId) {
          try {
            await write(CLIENT_KEY, clientId);
          } catch {}
        }
      }
      if (!configured) {
        gtag("js", new Date());
        gtag("config", measurementId, {
          send_page_view: false,
          client_id: clientId,
          // capacitor://localhost and https://localhost: cookies without a
          // domain attribute are the only ones a WebView keeps.
          ...(win.location?.hostname === "localhost"
            ? { cookie_domain: "none" }
            : {}),
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
          ...(debug ? { debug_mode: true } : {}),
          app_platform: platform,
          app_version: appVersion,
        });
        gtag("set", "user_properties", {
          app_platform: platform,
          app_version: appVersion,
        });
        configured = true;
        flush();
      }
      loadScript();
      return clientId;
    },
    // One screen of the app. `name` is the page id (home, record, plans, …).
    page(name, title = "") {
      const screen = eventName(name);
      send(
        "event",
        "page_view",
        cleanParams({
          page_title: title || screen,
          page_location: `${win.location?.origin || "app://yumetan"}/#${screen}`,
          page_path: `/#${screen}`,
          screen_name: screen,
          app_platform: platform,
        }),
      );
    },
    event(name, params = {}) {
      send(
        "event",
        eventName(name),
        cleanParams({ ...params, app_platform: platform }),
      );
    },
    // The signed-in person (Firebase UID) and what describes them. Only
    // changed properties are sent; `null` clears the user (sign-out).
    setUser(id, properties = {}) {
      if (!enabled) return;
      const next = id || null;
      if (next !== userId) {
        userId = next;
        send("set", { user_id: userId });
        if (!userId) userProps = {};
      }
      const changed = {};
      for (const [key, value] of Object.entries(cleanParams(properties)))
        if (userProps[key] !== value) {
          changed[key] = value;
          userProps[key] = value;
        }
      if (Object.keys(changed).length) send("set", "user_properties", changed);
    },
    userProperties: () => ({ ...userProps }),
    // The value for the X-Yumetan-Analytics request header ("" when off).
    header: () => (enabled && clientId ? clientId : ""),
  };
}
