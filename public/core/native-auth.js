import { read, write } from "./storage.js";
const key = "yumetan.auth.pending";
const random = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
async function request(base, action, body) {
  const response = await fetch(base + "/api/auth/" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(value.code), { code: value.code });
  return value;
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
  if (url.protocol !== "https:")
    throw Object.assign(new Error("authNotConfigured"), {
      code: "authNotConfigured",
    });
  const verifier = random(),
    bytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );
  const challenge = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
    throw Object.assign(new Error("authExpired"), { code: "authExpired" });
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
