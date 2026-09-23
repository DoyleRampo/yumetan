import { read, write } from "./storage.js";
const key = "yumetan.auth.pending";
const random = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const authError = (code) => Object.assign(new Error(code), { code });
// AbortSignal.timeout is missing on iOS 15 WebViews; never let that break login.
export function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const transient = (error) =>
  error?.name === "AbortError" || error?.name === "TypeError";
// The API runs on a free Render instance that sleeps when idle and needs up to
// a minute to answer the first request. Wake it before starting a login so the
// real request does not time out; failures here are ignored (the login request
// still runs and reports its own error).
export const timing = { attempts: 6, delay: 2000 };
export async function warmUp(
  origin,
  { attempts = timing.attempts, delay = timing.delay } = {},
) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(origin + "/api/health", {
        signal: timeoutSignal(15000),
      });
      if (res.ok) return true;
    } catch {}
    if (i < attempts - 1) await sleep(delay * (i + 1));
  }
  return false;
}
async function request(base, action, body, retries = 1) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(base + "/api/auth/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: timeoutSignal(20000),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw authError(value.code || "authFailed");
      return value;
    } catch (error) {
      if (!transient(error) || attempt >= retries) throw error;
      await warmUp(base, { attempts: 3, delay: 2000 });
    }
  }
}
export async function startNativeAuth({
  cloud,
  provider,
  link,
  language,
  base,
  sourceKey,
}) {
  const url = new URL(base);
  if (url.protocol !== "https:") throw authError("authNotConfigured");
  const verifier = random(),
    bytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );
  const challenge = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await warmUp(url.origin);
  const result = await request(url.origin, "start", {
    provider,
    link,
    challenge,
    idToken: await cloud.idToken(),
  });
  await write(key, {
    id: result.id,
    verifier,
    base: url.origin,
    sourceKey,
    guest: cloud.isAnonymous(),
    link,
    expires: Date.now() + 300000,
  });
  const fragment = new URLSearchParams({
    id: result.id,
    browserKey: result.browserKey,
    language,
  });
  await window.Capacitor.Plugins.AuthBrowser.open({
    url: url.origin + "/auth.html#" + fragment,
  });
}
export async function finishNativeAuth(cloud) {
  const pending = await read(key);
  if (!pending) return null;
  if (pending.expires < Date.now()) {
    await write(key, null);
    throw authError("authExpired");
  }
  const result = await request(pending.base, "consume", {
    id: pending.id,
    verifier: pending.verifier,
  });
  if (result.pending) return null;
  // Never apply a completed flow after the user has switched accounts manually.
  const active = await read("yumetan.v4.active");
  if (active !== pending.sourceKey) {
    await write(key, null);
    return null;
  }
  await cloud.signInToken(result.token);
  await write(key, null);
  return pending;
}
export async function cancelNativeAuth() {
  await write(key, null);
}

// Direct LINE login through the LINE app (iOS LineLogin plugin). The LINE ID
// token never touches the WebView URL; the server verifies it with LINE and
// returns a Firebase custom token for the mapped account.
export function lineNativeAvailable(config = window.YUMETAN_CONFIG) {
  return Boolean(window.Capacitor?.Plugins?.LineLogin && config?.lineChannelId);
}
export async function lineNativeLogin({ cloud, link, base, config }) {
  const url = new URL(base);
  if (url.protocol !== "https:") throw authError("authNotConfigured");
  // Wake the server while the user is busy in the LINE app.
  const warm = warmUp(url.origin);
  let result;
  try {
    result = await window.Capacitor.Plugins.LineLogin.login({
      channelId: String(config.lineChannelId),
    });
  } catch (error) {
    throw authError(error?.code || "auth/popup-closed-by-user");
  }
  if (!result?.idToken) throw authError("authFailed");
  await warm;
  const headers = { "Content-Type": "application/json" };
  if (link) headers.Authorization = "Bearer " + (await cloud.idToken());
  const body = JSON.stringify({
    idToken: result.idToken,
    nonce: result.nonce,
    link,
  });
  let response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(url.origin + "/api/auth/line", {
        method: "POST",
        headers,
        body,
        signal: timeoutSignal(20000),
      });
      break;
    } catch (error) {
      if (!transient(error) || attempt >= 1) throw authError("authFailed");
      await warmUp(url.origin, { attempts: 3, delay: 2000 });
    }
  }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw authError(value.code || "authFailed");
  return cloud.signInToken(value.token);
}

export async function checkAppleNonce(identityToken, rawNonce) {
  let claim;
  try {
    const payload = identityToken.split(".")[1];
    claim = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ).nonce;
  } catch {
    throw authError("auth/apple-invalid-response");
  }
  if (!claim || !rawNonce || !crypto.subtle) return;
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce)),
  );
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== claim) throw authError("auth/apple-nonce-mismatch");
}
// Sign in with Apple through the system sheet (iOS AppleLogin plugin).
export function appleNativeAvailable() {
  return Boolean(window.Capacitor?.Plugins?.AppleLogin);
}
export async function appleNativeLogin({ cloud, link, upgrade }) {
  let result;
  try {
    result = await window.Capacitor.Plugins.AppleLogin.login();
  } catch (error) {
    // The plugin rejects with an ASAuthorizationError-derived code and Apple's message.
    throw Object.assign(
      new Error(error?.message || error?.code || "auth/popup-closed-by-user"),
      { code: error?.code || "auth/popup-closed-by-user" },
    );
  }
  if (!result?.identityToken) throw authError("authFailed");
  // The token's nonce claim must be SHA-256(rawNonce); check it here so a
  // mismatch is reported as an app problem instead of a vague server rejection.
  await checkAppleNonce(result.identityToken, result.rawNonce);
  const displayName = [result.givenName, result.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return cloud.signInCredential("apple", {
    idToken: result.identityToken,
    rawNonce: result.rawNonce,
    link,
    upgrade,
    displayName,
  });
}

// Google Sign-In through the Google SDK sheet inside the app (iOS GoogleLogin
// plugin). The ID token signs in to Firebase directly; Safari is never opened.
export function googleNativeAvailable(config = window.YUMETAN_CONFIG) {
  return Boolean(
    window.Capacitor?.Plugins?.GoogleLogin && config?.googleIosClientId,
  );
}
export async function googleNativeLogin({ cloud, link, upgrade, config }) {
  let result;
  try {
    result = await window.Capacitor.Plugins.GoogleLogin.login({
      clientId: String(config.googleIosClientId),
    });
  } catch (error) {
    throw authError(error?.code || "auth/popup-closed-by-user");
  }
  if (!result?.idToken) throw authError("authFailed");
  return cloud.signInCredential("google", {
    idToken: result.idToken,
    accessToken: result.accessToken || "",
    link,
    upgrade,
    displayName: result.displayName || "",
  });
}
