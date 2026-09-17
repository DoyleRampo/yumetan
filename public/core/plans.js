// Price in JPY. Usage periods are UTC; journal limits apply to the record's calendar date.
export const PLANS = {
  free: {
    id: "free",
    names: ["フリー", "무료", "免费", "Free"],
    monthly: 0,
    yearly: 0,
    dreams: 1,
    diary: 1,
    reflections: 0,
    handwriting: 0,
    reads: 0,
    publishes: 0,
    activePosts: 0,
    comments: 0,
    reactions: 0,
    aiBudgetMicros: 0,
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
