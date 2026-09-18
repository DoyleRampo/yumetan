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
    // Free members may only use fields with a non-zero free allowance (the AI taster).
    // Their AI cost is also charged to a service-wide free pool so a surge of new accounts
    // can never spend the budget reserved for paying members.
    async consume(
      uid,
      field,
      amount = 1,
      monthly = false,
      budget = 0,
      globalBudget = 20000000,
      freeGlobalBudget = 5000000,
    ) {
      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        !Number.isFinite(budget) ||
        budget < 0 ||
        !Number.isFinite(globalBudget) ||
        globalBudget <= 0 ||
        !Number.isFinite(freeGlobalBudget) ||
        freeGlobalBudget < 0
      )
        throw fault(400, "invalidInput");
      const period = monthly ? monthKey(now()) : dayKey(now());
      const path = `usage/${uid}_${monthly ? "m" : "d"}_${period}`;
      return store.transaction(async (tx) => {
        const member = (await tx.get(memberPath(uid))) || {};
        const plan = activePlan(member, now());
        if (!Number.isInteger(PLANS[plan][field]))
          throw fault(400, "invalidInput");
        if (plan === "free" && PLANS.free[field] < 1)
          throw fault(403, "paidRequired");
        if (member.suspended) throw fault(403, "accountSuspended");
        const usage = (await tx.get(path)) || {};
        const globalPath = `serviceBudgets/${monthKey(now())}`;
        const global = budget ? (await tx.get(globalPath)) || {} : {};
        if ((usage[field] || 0) + amount > PLANS[plan][field])
          throw fault(429, "quotaReached");
        if (
          budget &&
          ((usage.aiCost || 0) + budget > PLANS[plan].aiBudgetMicros ||
            (global.aiCost || 0) + budget > globalBudget ||
            (plan === "free" &&
              (global.freeAiCost || 0) + budget > freeGlobalBudget))
        )
          throw fault(429, "aiBudgetReached");
        tx.set(path, {
          ...usage,
          [field]: (usage[field] || 0) + amount,
          ...(budget ? { aiCost: (usage.aiCost || 0) + budget } : {}),
        });
        if (budget)
          tx.set(globalPath, {
            ...global,
            aiCost: (global.aiCost || 0) + budget,
            ...(plan === "free"
              ? { freeAiCost: (global.freeAiCost || 0) + budget }
              : {}),
          });
      });
    },
  };
}
