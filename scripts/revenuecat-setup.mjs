// Creates the RevenueCat entitlements, products, offering and packages that match
// public/core/plans.js, using REST API v2 (https://www.revenuecat.com/docs/api-v2).
//
//   node scripts/revenuecat-setup.mjs            # dry run: prints what would be created
//   node scripts/revenuecat-setup.mjs --apply    # creates only the missing objects
//
// Requires REVENUECAT_SECRET_API_KEY (a v2 secret key with write access to products,
// entitlements and offerings) and REVENUECAT_PROJECT_ID in .env or the environment.
// Store products must already exist in App Store Connect (the app ships on iOS only; Stripe
// prices are added when a Stripe app exists). RevenueCat product objects only reference them.
// The script never deletes anything.
import {
  PLANS,
  ENTITLEMENTS,
  STORE_PRODUCTS,
  OFFERING,
} from "../public/core/plans.js";
try {
  process.loadEnvFile();
} catch {}
const apply = process.argv.includes("--apply");
const env = process.env;
const base = "https://api.revenuecat.com/v2";
const project = env.REVENUECAT_PROJECT_ID;
const stripePrices = Object.fromEntries(
  Object.keys(STORE_PRODUCTS).map((k) => [
    k,
    env[`STRIPE_PRICE_${k.toUpperCase()}`] || null,
  ]),
);

function plan() {
  const products = [];
  for (const [key, p] of Object.entries(STORE_PRODUCTS)) {
    const label = `${PLANS[p.plan].names[3]} ${p.cycle} (¥${PLANS[p.plan][p.cycle].toLocaleString()})`;
    products.push({
      key,
      appType: "app_store",
      storeIdentifier: p.appStore,
      displayName: `${label} · iOS`,
      plan: p.plan,
    });
    if (stripePrices[key])
      products.push({
        key,
        appType: "stripe",
        storeIdentifier: stripePrices[key],
        displayName: `${label} · Web`,
        plan: p.plan,
      });
  }
  return {
    entitlements: Object.values(ENTITLEMENTS).map((e) => ({
      lookupKey: e.id,
      displayName: e.displayName,
      productKeys: Object.entries(STORE_PRODUCTS)
        .filter(([, p]) => p.plan === e.id)
        .map(([k]) => k),
    })),
    products,
    offering: {
      lookupKey: OFFERING.id,
      displayName: OFFERING.displayName,
      packages: OFFERING.packages.map((pkg, i) => ({
        lookupKey: pkg.id,
        displayName: pkg.displayName,
        position: i + 1,
        productKeys: pkg.products,
      })),
    },
  };
}

async function rc(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after") || 2);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return rc(method, path, body);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}
async function listAll(path) {
  const items = [];
  let next = `${path}${path.includes("?") ? "&" : "?"}limit=100`;
  while (next) {
    const page = await rc("GET", next.replace(base, ""));
    items.push(...(page.items || []));
    next = page.next_page ? page.next_page.replace(/^.*\/v2/, "") : null;
  }
  return items;
}

async function main() {
  const spec = plan();
  console.log(JSON.stringify(spec, null, 2));
  if (!apply) {
    console.log(
      "\nDry run. Re-run with --apply after the store products exist and REVENUECAT_* are set.",
    );
    return;
  }
  if (!env.REVENUECAT_SECRET_API_KEY || !project)
    throw new Error("Set REVENUECAT_SECRET_API_KEY and REVENUECAT_PROJECT_ID.");
  const P = `/projects/${project}`;
  const apps = await listAll(`${P}/apps`);
  const appByType = Object.fromEntries(apps.map((a) => [a.type, a]));
  if (!appByType.app_store)
    throw new Error(
      `No App Store app in project ${project}. Add the iOS app in the RevenueCat dashboard first.`,
    );
  if (!appByType.stripe && spec.products.some((p) => p.appType === "stripe"))
    console.warn(
      "STRIPE_PRICE_* are set but the project has no Stripe app; skipping Stripe products.",
    );

  const existingProducts = await listAll(`${P}/products`);
  const productIds = {}; // `${key}:${appType}` → RevenueCat product id
  for (const p of spec.products) {
    const app = appByType[p.appType];
    if (!app) continue;
    let found = existingProducts.find(
      (x) => x.store_identifier === p.storeIdentifier && x.app_id === app.id,
    );
    if (!found) {
      found = await rc("POST", `${P}/products`, {
        store_identifier: p.storeIdentifier,
        app_id: app.id,
        type: "subscription",
        display_name: p.displayName,
      });
      console.log("created product", p.storeIdentifier);
    }
    productIds[`${p.key}:${p.appType}`] = found.id;
  }
  const idsFor = (keys) =>
    Object.entries(productIds)
      .filter(([k]) => keys.includes(k.split(":")[0]))
      .map(([, id]) => id);

  const existingEntitlements = await listAll(`${P}/entitlements`);
  for (const e of spec.entitlements) {
    let ent = existingEntitlements.find((x) => x.lookup_key === e.lookupKey);
    if (!ent) {
      ent = await rc("POST", `${P}/entitlements`, {
        lookup_key: e.lookupKey,
        display_name: e.displayName,
      });
      console.log("created entitlement", e.lookupKey);
    }
    const attached = (
      await listAll(`${P}/entitlements/${ent.id}/products`)
    ).map((x) => x.id);
    const missing = idsFor(e.productKeys).filter(
      (id) => !attached.includes(id),
    );
    if (missing.length) {
      await rc("POST", `${P}/entitlements/${ent.id}/actions/attach_products`, {
        product_ids: missing,
      });
      console.log(`attached ${missing.length} products to`, e.lookupKey);
    }
  }

  const offerings = await listAll(`${P}/offerings`);
  let offering = offerings.find(
    (x) => x.lookup_key === spec.offering.lookupKey,
  );
  if (!offering) {
    offering = await rc("POST", `${P}/offerings`, {
      lookup_key: spec.offering.lookupKey,
      display_name: spec.offering.displayName,
    });
    console.log("created offering", spec.offering.lookupKey);
  }
  if (!offering.is_current) {
    try {
      await rc("POST", `${P}/offerings/${offering.id}`, { is_current: true });
      console.log("marked offering as current");
    } catch (e) {
      console.warn(
        "Could not mark the offering as current via API; set it in the dashboard.",
        e.message,
      );
    }
  }
  const packages = await listAll(`${P}/offerings/${offering.id}/packages`);
  for (const pkg of spec.offering.packages) {
    let found = packages.find((x) => x.lookup_key === pkg.lookupKey);
    if (!found) {
      found = await rc("POST", `${P}/offerings/${offering.id}/packages`, {
        lookup_key: pkg.lookupKey,
        display_name: pkg.displayName,
        position: pkg.position,
      });
      console.log("created package", pkg.lookupKey);
    }
    const attached = (await listAll(`${P}/packages/${found.id}/products`)).map(
      (x) => x.product?.id || x.id,
    );
    const missing = idsFor(pkg.productKeys).filter(
      (id) => !attached.includes(id),
    );
    if (missing.length) {
      await rc("POST", `${P}/packages/${found.id}/actions/attach_products`, {
        products: missing.map((id) => ({
          product_id: id,
          eligibility_criteria: "all",
        })),
      });
      console.log(
        `attached ${missing.length} products to package`,
        pkg.lookupKey,
      );
    }
  }
  console.log(
    "Done. Verify in the RevenueCat dashboard: Products, Entitlements, Offerings → default (current).",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
