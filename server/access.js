import { PLANS, activePlan } from "../public/core/plans.js";
export const fault = (status, code) =>
  Object.assign(new Error(code), { status, code });
export const memberPath = (uid) => `memberships/${uid}`;
export const dayKey = (now) => new Date(now).toISOString().slice(0, 10);
export const monthKey = (now) => dayKey(now).slice(0, 7);
export function createAccess({ store, verify, now = Date.now }) {
  return {
    store,
    now,
    async user(req) {
      if (!store || !verify) throw fault(503, "serviceUnavailable");
      const token = /^Bearer (.+)$/.exec(req.get("Authorization") || "")?.[1];
      if (!token) throw fault(401, "loginRequired");
      let user;
      try {
        user = await verify(token);
      } catch {
        throw fault(401, "loginRequired");
      }
      if (!user.uid || user.firebase?.sign_in_provider === "anonymous")
        throw fault(401, "loginRequired");
      return user;
    },
    async member(uid) {
      return (await store.get(memberPath(uid))) || {};
    },
    async paid(uid) {
      const member = await this.member(uid);
      const plan = activePlan(member, now());
      if (plan === "free") throw fault(403, "paidRequired");
      if (member.suspended) throw fault(403, "accountSuspended");
      return { member, plan, limits: PLANS[plan] };
    },
    // `countDate` (YYYY-MM-DD) counts the call against that calendar date (an AI
    // reading belongs to its dream's date) while the cost stays in the month.
    async consume(
      uid,
      field,
      amount = 1,
      monthly = false,
      budget = 0,
      globalBudget = 20000000,
      countDate = null,
    ) {
      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        !Number.isFinite(budget) ||
        budget < 0 ||
        !Number.isFinite(globalBudget) ||
        globalBudget <= 0 ||
        (countDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(countDate))
      )
        throw fault(400, "invalidInput");
      const period = monthly ? monthKey(now()) : dayKey(now());
      const path = `usage/${uid}_${monthly ? "m" : "d"}_${period}`;
      const countPath = countDate ? `usage/${uid}_d_${countDate}` : path;
      return store.transaction(async (tx) => {
        const member = await tx.get(memberPath(uid));
        const plan = activePlan(member, now());
        if (!Number.isInteger(PLANS[plan][field]))
          throw fault(400, "invalidInput");
        // Free members may use what the free plan includes; the rest is paid.
        if (plan === "free" && !PLANS.free[field])
          throw fault(403, "paidRequired");
        if (member?.suspended) throw fault(403, "accountSuspended");
        const usage = (await tx.get(path)) || {};
        const counts =
          countPath === path ? usage : (await tx.get(countPath)) || {};
        const globalPath = `serviceBudgets/${monthKey(now())}`;
        const global = budget ? (await tx.get(globalPath)) || {} : {};
        if ((counts[field] || 0) + amount > PLANS[plan][field])
          throw fault(429, "quotaReached");
        if (
          budget &&
          ((usage.aiCost || 0) + budget > PLANS[plan].aiBudgetMicros ||
            (global.aiCost || 0) + budget > globalBudget)
        )
          throw fault(429, "aiBudgetReached");
        const counted = { ...counts, [field]: (counts[field] || 0) + amount };
        if (countPath === path)
          tx.set(path, {
            ...counted,
            ...(budget ? { aiCost: (usage.aiCost || 0) + budget } : {}),
          });
        else {
          tx.set(countPath, counted);
          if (budget)
            tx.set(path, { ...usage, aiCost: (usage.aiCost || 0) + budget });
        }
        if (budget)
          tx.set(globalPath, { aiCost: (global.aiCost || 0) + budget });
      });
    },
  };
}
