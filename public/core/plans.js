// Price in JPY. Journal limits and AI readings apply per record date (the
// user's calendar day); handwriting, community and cost budgets use UTC periods.
// An AI reading comes with every dream on every plan: `reflections` equals the
// number of dreams a date allows. Sharing a dream is free; reading other
// members' dreams is not. Free members see a daily teaser of `teaserPosts`
// other members' posts, TEASER_CHARS characters of the dream each (the name and
// the title are always whole), plus their own posts in full.
export const PLANS = {
  free: {
    id: "free",
    names: ["フリー", "무료", "免费", "Free"],
    monthly: 0,
    yearly: 0,
    dreams: 1,
    diary: 3,
    reflections: 1,
    handwriting: 0,
    reads: 0,
    teaserPosts: 3,
    publishes: 1,
    activePosts: 10,
    reactions: 0,
    aiBudgetMicros: 250000,
  },
  starter: {
    id: "starter",
    names: ["スターター", "스타터", "入门", "Starter"],
    monthly: 490,
    yearly: 4900,
    dreams: 3,
    diary: 5,
    reflections: 3,
    handwriting: 5,
    reads: 30,
    teaserPosts: 0,
    publishes: 1,
    activePosts: 10,
    reactions: 30,
    aiBudgetMicros: 750000,
  },
  standard: {
    id: "standard",
    names: ["スタンダード", "스탠더드", "标准", "Standard"],
    monthly: 980,
    yearly: 9800,
    dreams: 10,
    diary: 10,
    reflections: 10,
    handwriting: 20,
    reads: 150,
    teaserPosts: 0,
    publishes: 3,
    activePosts: 50,
    reactions: 100,
    aiBudgetMicros: 2000000,
  },
};
// How much of another member's dream a free account sees in the daily teaser.
export const TEASER_CHARS = 15;
// The stamps a paid member reacts with, one per post (another replaces it).
// Free members see the counts only. Names are ja, ko, zh, en.
export const STAMPS = [
  { id: "funny", emoji: "😂", names: ["面白い", "재밌어", "有趣", "Funny"] },
  {
    id: "amazing",
    emoji: "🤩",
    names: ["すごい", "대단해", "厉害", "Amazing"],
  },
  {
    id: "wonder",
    emoji: "🔮",
    names: ["不思議", "신기해", "奇妙", "Wondrous"],
  },
  { id: "mystery", emoji: "🤔", names: ["謎", "수수께끼", "谜", "Puzzling"] },
  { id: "scary", emoji: "😱", names: ["怖い", "무서워", "可怕", "Scary"] },
  { id: "fun", emoji: "🥳", names: ["楽しい", "즐거워", "开心", "Fun"] },
  {
    id: "same",
    emoji: "🙋",
    names: ["同じです", "저도요", "我也是", "Me too"],
  },
  {
    id: "similar",
    emoji: "👯",
    names: ["似てる", "비슷해", "很像", "Similar"],
  },
  {
    id: "wantToSee",
    emoji: "👀",
    names: ["見てみたい", "보고 싶어", "想看看", "Want to see it"],
  },
  { id: "good", emoji: "👍", names: ["グッド", "좋아요", "赞", "Good"] },
  {
    id: "seen",
    emoji: "💭",
    names: ["見たことある", "본 적 있어", "见过", "Seen it"],
  },
  { id: "heart", emoji: "❤️", names: ["ハート", "하트", "爱心", "Heart"] },
];
export const STAMP_IDS = STAMPS.map((s) => s.id);
// A post's counts as [stamp, count] pairs in STAMPS order, leaving out stamps
// nobody chose and any stored under an id no longer offered.
export const stampCounts = (reactions = {}) =>
  STAMPS.map((s) => [s, Number(reactions?.[s.id]) || 0]).filter(
    ([, n]) => n > 0,
  );
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
