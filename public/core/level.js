// Dream level: a game-style progression driven purely by how many dreams the
// user has logged. Sleep check-ins never score anything.
//
// Early levels come fast so the first week feels rewarding; the curve then
// widens like an RPG experience table and continues without a cap.
const TABLE = [0, 3, 7, 12, 20, 30, 42, 56, 72, 90];
const STEP_AFTER_TABLE = 25;
export function levelThreshold(level) {
  if (level <= 1) return 0;
  if (level <= TABLE.length) return TABLE[level - 1];
  return TABLE.at(-1) + (level - TABLE.length) * STEP_AFTER_TABLE;
}
export function dreamLevel(records = []) {
  const count = records.filter((r) => r && r.kind !== "diary").length;
  let level = 1;
  while (count >= levelThreshold(level + 1)) level++;
  const current = levelThreshold(level),
    next = levelThreshold(level + 1);
  return {
    level,
    count,
    next,
    remaining: next - count,
    progress: Math.round(((count - current) / (next - current)) * 100),
    // Stars on the character portrait: one more star every three levels, max five.
    stars: Math.min(5, Math.floor((level - 1) / 3) + 1),
  };
}
