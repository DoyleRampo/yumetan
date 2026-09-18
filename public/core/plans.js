// Price in JPY. Usage periods are UTC; journal limits apply to the record's calendar date.
// AI fields (reflections, handwriting, aiBudgetMicros) are enforced server-side per signed-in
// user. Free AI allowances exist so newcomers can try GPT once or twice a week before paying;
// they also draw from a separate service-wide free pool (AI_FREE_GLOBAL_MONTHLY_USD).
export const PLANS = {
  free: {
    id: "free",
    names: ["フリー", "무료", "免费", "Free"],
    monthly: 0,
    yearly: 0,
    dreams: 1,
    diary: 1,
    reflections: 3,
    handwriting: 1,
    reads: 0,
    publishes: 0,
    activePosts: 0,
    comments: 0,
    reactions: 0,
    // 3 max-length reflections (≈13,700 µ$ each) + 1 OCR fit; typical use stays far below.
    aiBudgetMicros: 45000,
  },
  starter: {
    id: "starter",
    names: ["スターター", "스타터", "入门", "Starter"],
    monthly: 490,
    yearly: 4800,
    dreams: 3,
    diary: 1,
    reflections: 30,
    handwriting: 5,
    reads: 30,
    publishes: 1,
    activePosts: 10,
    comments: 10,
    reactions: 30,
    aiBudgetMicros: 500000,
  },
  standard: {
    id: "standard",
    names: ["スタンダード", "스탠더드", "标准", "Standard"],
    monthly: 980,
    yearly: 9800,
    dreams: 10,
    diary: 1,
    reflections: 90,
    handwriting: 20,
    reads: 150,
    publishes: 3,
    activePosts: 50,
    comments: 30,
    reactions: 100,
    aiBudgetMicros: 1250000,
  },
};
export const STAMPS = ["🌙", "✨", "🤝", "💭", "🌱"];
// Store / RevenueCat identifiers. One entitlement per paid plan; each store product maps to
// exactly one plan+cycle. Native purchases ship on the App Store only (no Google Play release).
// Keep in sync with docs/billing/REVENUECAT.md and the Stripe prices.
export const ENTITLEMENTS = {
  starter: { id: "starter", displayName: "Yumetan Starter" },
  standard: { id: "standard", displayName: "Yumetan Standard" },
};
export const STORE_PRODUCTS = {
  starter_monthly: {
    plan: "starter",
    cycle: "monthly",
    appStore: "com.doyle.yumetan.starter.monthly",
  },
  starter_yearly: {
    plan: "starter",
    cycle: "yearly",
    appStore: "com.doyle.yumetan.starter.yearly",
  },
  standard_monthly: {
    plan: "standard",
    cycle: "monthly",
    appStore: "com.doyle.yumetan.standard.monthly",
  },
  standard_yearly: {
    plan: "standard",
    cycle: "yearly",
    appStore: "com.doyle.yumetan.standard.yearly",
  },
};
export const OFFERING = {
  id: "default",
  displayName: "Yumetan plans",
  // RevenueCat package lookup keys; $rc_* keys are the SDK's standard names.
  packages: [
    {
      id: "$rc_monthly",
      displayName: "Standard monthly",
      products: ["standard_monthly"],
    },
    {
      id: "$rc_annual",
      displayName: "Standard yearly",
      products: ["standard_yearly"],
    },
    {
      id: "starter_monthly",
      displayName: "Starter monthly",
      products: ["starter_monthly"],
    },
    {
      id: "starter_yearly",
      displayName: "Starter yearly",
      products: ["starter_yearly"],
    },
  ],
};
export function storeProductPlan(identifier) {
  const found = Object.entries(STORE_PRODUCTS).find(
    ([, p]) => p.appStore === identifier,
  );
  return found ? { plan: found[1].plan, cycle: found[1].cycle } : null;
}
export function activePlan(member, now = Date.now()) {
  return member?.status === "active" &&
    Number(member.paidUntil) > now &&
    ["starter", "standard"].includes(member.plan)
    ? member.plan
    : "free";
}
export function canSaveRecord(records, record, plan = "free") {
  if (
    records.some(
      (r) =>
        r.id === record.id && r.kind === record.kind && r.date === record.date,
    )
  )
    return true;
  const limit = (PLANS[plan] || PLANS.free)[
    record.kind === "diary" ? "diary" : "dreams"
  ];
  return (
    records.filter(
      (r) =>
        r.id !== record.id && r.kind === record.kind && r.date === record.date,
    ).length < limit
  );
}
