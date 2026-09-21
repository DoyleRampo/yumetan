// Native LINE login. The iOS app signs in with the LINE SDK (app-to-app), sends
// the LINE ID token here, and receives a Firebase custom token in return. The
// token is verified with LINE's own endpoint, so no channel secret is stored on
// this server and no Identity Platform upgrade is needed for the native flow.
//
// The same LINE user always maps to the same Firebase account:
//   lineUsers/{lineUserId} = { uid }
// The first login creates the account `line:<lineUserId>`; "link" attaches the
// LINE identity to the currently signed-in (non-anonymous) account instead.
import { fault } from "./access.js";
const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const ISSUER = "https://access.line.me";
export function createLineAuth({
  store,
  verify,
  mint,
  env = process.env,
  fetch = globalThis.fetch,
  now = Date.now,
}) {
  const channelId = String(env.LINE_CHANNEL_ID || "").trim();
  const configured = Boolean(channelId && store && verify && mint);
  async function verifyLineToken(idToken, nonce) {
    const body = new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
    });
    if (nonce) body.set("nonce", nonce);
    let response;
    try {
      response = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw fault(502, "authFailed");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw fault(401, "loginRequired");
    if (
      data.iss !== ISSUER ||
      data.aud !== channelId ||
      typeof data.sub !== "string" ||
      !/^U[0-9a-f]{32}$/.test(data.sub) ||
      !(Number(data.exp) * 1000 > now())
    )
      throw fault(401, "loginRequired");
    return data;
  }
  return {
    configured,
    async login(body, authorization = "") {
      if (!configured) throw fault(503, "authNotConfigured");
      if (
        !body ||
        typeof body.idToken !== "string" ||
        body.idToken.length > 4096 ||
        (body.nonce != null && typeof body.nonce !== "string")
      )
        throw fault(400, "invalidInput");
      const claims = await verifyLineToken(body.idToken, body.nonce);
      // Linking requires a verified, non-anonymous Firebase session.
      let linkTo = null;
      if (body.link) {
        const token = /^Bearer (.+)$/.exec(authorization || "")?.[1];
        if (!token) throw fault(401, "loginRequired");
        let user;
        try {
          user = await verify(token);
        } catch {
          throw fault(401, "loginRequired");
        }
        if (!user?.uid || user.firebase?.sign_in_provider === "anonymous")
          throw fault(401, "loginRequired");
        linkTo = user.uid;
      }
      const path = "lineUsers/" + claims.sub;
      const uid = await store.transaction(async (tx) => {
        const existing = await tx.get(path);
        if (linkTo) {
          if (existing?.uid && existing.uid !== linkTo)
            throw fault(409, "auth/credential-already-in-use");
          tx.set(path, { uid: linkTo, linkedAt: now() });
          return linkTo;
        }
        if (existing?.uid) {
          tx.set(path, { ...existing, lastLoginAt: now() });
          return existing.uid;
        }
        const fresh = "line:" + claims.sub;
        tx.set(path, { uid: fresh, createdAt: now(), lastLoginAt: now() });
        return fresh;
      });
      return {
        token: await mint(uid, { provider: "oidc.line" }),
        name: typeof claims.name === "string" ? claims.name.slice(0, 100) : "",
        picture:
          typeof claims.picture === "string" &&
          /^https:\/\//.test(claims.picture)
            ? claims.picture
            : "",
      };
    },
  };
}
export function registerLineAuth(app, { asyncRoute, ...services }) {
  const line = createLineAuth(services),
    bursts = new Map();
  app.post(
    "/api/auth/line",
    asyncRoute(async (req, res) => {
      const minute = Math.floor(Date.now() / 60000),
        key = req.ip;
      for (const [k, v] of bursts) if (v.minute !== minute) bursts.delete(k);
      const old = bursts.get(key),
        count = old?.minute === minute ? old.count + 1 : 1;
      bursts.set(key, { minute, count });
      if (count > 30) throw fault(429, "quotaReached");
      res.json(await line.login(req.body || {}, req.get("authorization")));
    }),
  );
  return line;
}
