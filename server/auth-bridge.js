import { randomBytes, createHash } from "node:crypto";
import { fault } from "./access.js";
const providers = {
  google: "google.com",
  apple: "apple.com",
  line: "oidc.line",
};
const digest = (value) =>
  createHash("sha256").update(value).digest("base64url");
const validSecret = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
// A browser proof completes authentication; a separate device proof redeems it.
// Neither proof is a Firebase token. Sessions expire and can only be consumed once.
export function createAuthBridge({
  store,
  verify,
  mint,
  getUser,
  now = Date.now,
}) {
  const requireStore = () => {
    if (!store || !verify || !mint || !getUser)
      throw fault(503, "authNotConfigured");
  };
  async function session(tx, body, browser = false) {
    if (
      !validSecret(body.id) ||
      !validSecret(browser ? body.browserKey : body.verifier)
    )
      throw fault(400, "invalidInput");
    const path = "authHandoffs/" + body.id,
      data = await tx.get(path);
    if (
      !data ||
      data.expiresMs <= now() ||
      data.consumed ||
      digest(browser ? body.browserKey : body.verifier) !==
        (browser ? data.browserHash : data.challenge)
    )
      throw fault(401, "authExpired");
    return { path, data };
  }
  return {
    async start(body) {
      requireStore();
      if (!providers[body.provider] || !validSecret(body.challenge))
        throw fault(400, "invalidInput");
      const user = body.idToken ? await verify(body.idToken) : null;
      if (
        body.link &&
        (!user || user.firebase?.sign_in_provider === "anonymous")
      )
        throw fault(401, "loginRequired");
      const id = randomBytes(32).toString("base64url"),
        browserKey = randomBytes(32).toString("base64url");
      await store.transaction(async (tx) => {
        if (user) {
          const p = "authRateLimits/" + user.uid,
            limit = await tx.get(p),
            minute = Math.floor(now() / 60000);
          const count = limit?.minute === minute ? limit.count + 1 : 1;
          if (count > 5) throw fault(429, "quotaReached");
          tx.set(p, { minute, count });
        }
        tx.set("authHandoffs/" + id, {
          provider: body.provider,
          challenge: body.challenge,
          browserHash: digest(browserKey),
          sourceUid: user?.uid || null,
          link: !!body.link,
          createdAt: now(),
          expiresMs: now() + 300000,
          expiresAt: new Date(now() + 300000),
          consumed: false,
        });
      });
      return { id, browserKey };
    },
    async bootstrap(body) {
      requireStore();
      const { data } = await store.transaction((tx) => session(tx, body, true));
      if (data.completedUid) throw fault(409, "authExpired");
      if (data.sourceUid && (await getUser(data.sourceUid)).disabled)
        throw fault(401, "loginRequired");
      return {
        provider: data.provider,
        link: data.link,
        upgrade: !!data.sourceUid && !data.link,
        token: data.sourceUid ? await mint(data.sourceUid) : null,
      };
    },
    async complete(body) {
      requireStore();
      const user = await verify(body.idToken),
        account = await getUser(user.uid);
      if (account.disabled) throw fault(401, "loginRequired");
      await store.transaction(async (tx) => {
        const { path, data } = await session(tx, body, true);
        if (
          data.completedUid ||
          (data.link && data.sourceUid !== user.uid) ||
          !account.providerData.some(
            (p) => p.providerId === providers[data.provider],
          ) ||
          user.auth_time * 1000 < data.createdAt - 10000 ||
          !Number.isFinite(user.auth_time)
        )
          throw fault(401, "loginRequired");
        tx.set(path, { ...data, completedUid: user.uid });
      });
      return { ok: true };
    },
    async consume(body) {
      requireStore();
      const uid = await store.transaction(async (tx) => {
        const { path, data } = await session(tx, body);
        if (!data.completedUid) return null;
        tx.set(path, { ...data, consumed: true });
        return data.completedUid;
      });
      if (!uid) return { pending: true };
      if ((await getUser(uid)).disabled) throw fault(401, "loginRequired");
      return { token: await mint(uid) };
    },
  };
}
export function registerAuthBridge(app, { asyncRoute, ...services }) {
  const bridge = createAuthBridge(services),
    bursts = new Map();
  for (const action of ["start", "bootstrap", "complete", "consume"])
    app.post(
      "/api/auth/" + action,
      asyncRoute(async (req, res) => {
        const minute = Math.floor(Date.now() / 60000),
          key = req.ip;
        for (const [k, v] of bursts) if (v.minute !== minute) bursts.delete(k);
        const old = bursts.get(key),
          count = old?.minute === minute ? old.count + 1 : 1;
        bursts.set(key, { minute, count });
        if (count > 120) throw fault(429, "quotaReached");
        res.json(await bridge[action](req.body || {}));
      }),
    );
}
