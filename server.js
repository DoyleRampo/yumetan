// Private journals stay on the device / in owner-only Firestore documents.
// Paid community, billing and GPT requests pass through this authenticated server.
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerFeatures } from "./server-features.js";
import { firebaseServices } from "./server/store.js";
import { createAccess, fault } from "./server/access.js";
import { createBilling } from "./server/billing.js";
import { createAI } from "./server/openai.js";
import { registerCommunity } from "./server/community.js";
try {
  process.loadEnvFile();
} catch {}
const here = path.dirname(fileURLToPath(import.meta.url));
const knowledge = await fs.readFile(
  path.join(here, "knowledge/sleep_quality.json"),
  "utf8",
);
const services = firebaseServices() || {};
const access = createAccess(services),
  billing = createBilling({ access }),
  ai = createAI({ access });
const app = express();
app.disable("x-powered-by");
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Yumetan-User, X-Yumetan-Code, X-Yumetan-Key",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  asyncRoute(async (req, res) => {
    await billing.webhook(req.body, req.get("stripe-signature"));
    res.json({ received: true });
  }),
);
app.use(express.json({ limit: "750kb" }));
const bursts = new Map();
app.use(
  "/api",
  asyncRoute(async (req, res, next) => {
    if (!req.get("Authorization")) return next();
    const user = await access.user(req);
    const key = user.uid,
      minute = Math.floor(Date.now() / 60000),
      previous = bursts.get(key);
    if (bursts.size > 10000)
      for (const [k, v] of bursts) if (v.minute !== minute) bursts.delete(k);
    const count = previous?.minute === minute ? previous.count + 1 : 1;
    bursts.set(key, { minute, count });
    if (count > 90) throw fault(429, "quotaReached");
    req.verifiedUser = user;
    next();
  }),
);
const user = (req) => req.verifiedUser || access.user(req);
// Verification cannot be bypassed with local storage, a fake device ID or a personal API key.
const verifiedAccess = Object.assign(Object.create(access), { user });
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: ai.model,
    hasServerKey: Boolean(process.env.OPENAI_API_KEY),
    acceptsUserKey: false,
    billingConfigured: billing.configured,
    communityConfigured: Boolean(services.store && process.env.OPENAI_API_KEY),
    langs: ["ja", "ko", "zh", "en"],
  }),
);
app.get(
  "/api/account",
  asyncRoute(async (req, res) =>
    res.json(await billing.account((await user(req)).uid)),
  ),
);
app.post(
  "/api/billing/checkout",
  asyncRoute(async (req, res) =>
    res.json(await billing.checkout(await user(req), req.body)),
  ),
);
app.post(
  "/api/billing/portal",
  asyncRoute(async (req, res) =>
    res.json(await billing.portal(await user(req))),
  ),
);
registerCommunity(app, {
  access: verifiedAccess,
  asyncRoute,
  moderate: (text) => ai.moderate(text),
});
registerFeatures(app, {
  gate: user,
  callAI: ({ client, ...args }) => ai.call({ ...args, user: client }),
  knowledge,
  asyncRoute,
});
app.get("/api/sleep-knowledge", (req, res) => res.type("json").send(knowledge));
for (const [route, file] of [
  ["sleep", "sleep_quality.md"],
  ["types", "dream_types16.md"],
  ["", "dream_psychology.md"],
])
  app.get(
    `/api/knowledge${route ? "/" + route : ""}`,
    asyncRoute(async (req, res) =>
      res
        .type("text/markdown")
        .send(await fs.readFile(path.join(here, "knowledge", file), "utf8")),
    ),
  );
app.use("/api", (req, res) =>
  res.status(404).json({ error: "notFound", code: "notFound" }),
);
app.use(
  express.static(path.join(here, "public"), {
    setHeaders: (res, file) =>
      res.setHeader(
        "Cache-Control",
        /\.(png|webp|svg|ico)$/.test(file)
          ? "public, max-age=604800"
          : "no-cache",
      ),
  }),
);
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500)
    console.error("Request failed", { status, name: err.name });
  res
    .status(status)
    .json({
      error:
        err.code || (status === 400 ? "invalidInput" : "serviceUnavailable"),
      code:
        err.code || (status === 400 ? "invalidInput" : "serviceUnavailable"),
    });
});
app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log("Yumetan API ready"),
);
