// Product heuristic v1, NOT a validated clinical sleep-quality scale.
export const RULE_VERSION = "sleep-v1";
export function validateSleep(value) {
  if (
    !value ||
    value.hours === "" ||
    value.awakenings === "" ||
    value.rested === ""
  )
    return false;
  return (
    typeof value.hours === "number" &&
    Number.isFinite(value.hours) &&
    value.hours >= 0 &&
    value.hours <= 24 &&
    Number.isInteger(value.awakenings) &&
    value.awakenings >= 0 &&
    value.awakenings <= 30 &&
    Number.isInteger(value.rested) &&
    value.rested >= 1 &&
    value.rested <= 5
  );
}
export function sleepScore(sleep, ageGroup = "") {
  if (!validateSleep(sleep)) return null;
  const minHours = ageGroup === "10代" ? 8 : 7;
  const duration =
    sleep.hours >= minHours
      ? 100
      : Math.max(0, 100 - (minHours - sleep.hours) * 25);
  const continuity = Math.max(0, 100 - sleep.awakenings * 20);
  const rest = (sleep.rested - 1) * 25;
  const score = Math.round(duration * 0.3 + continuity * 0.2 + rest * 0.5);
  return {
    score,
    level: Math.min(5, Math.floor(score / 20) + 1),
    version: RULE_VERSION,
    components: { duration, continuity, rest },
  };
}
export function localDate(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime()) && localDate(d) === value;
}
export function previousDate(date) {
  if (!validDate(date)) throw new Error("Invalid date");
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return localDate(d);
}
export function previousDiary(records, date) {
  return (
    records.find((r) => r.kind === "diary" && r.date === previousDate(date)) ||
    null
  );
}
export function growth(records, ageGroup, today = localDate()) {
  // One latest report per local calendar day in the last seven calendar days.
  const start = new Date(`${today}T12:00:00`);
  start.setDate(start.getDate() - 6);
  const first = localDate(start),
    days = new Map();
  [...records]
    .filter((r) => r.kind !== "diary" && r.date >= first && r.date <= today)
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt || b.createdAt) -
        Date.parse(a.updatedAt || a.createdAt),
    )
    .forEach((r) => {
      if (!days.has(r.date) && validateSleep(r.sleep))
        days.set(r.date, sleepScore(r.sleep, ageGroup));
    });
  const values = [...days.values()];
  if (!values.length) return { level: null, score: null, days: 0 };
  const score = Math.round(
    values.reduce((n, v) => n + v.score, 0) / values.length,
  );
  return {
    score,
    level: Math.min(5, Math.floor(score / 20) + 1),
    days: values.length,
  };
}
export function adviceKeys(sleep, ageGroup) {
  if (!validateSleep(sleep)) return ["routine", "quiet"];
  const keys = [];
  if (sleep.hours < (ageGroup === "10代" ? 8 : 7)) keys.push("duration");
  if (sleep.awakenings >= 2) keys.push("room");
  if (sleep.rested <= 2) keys.push("quiet");
  if (sleep.nightmare) keys.push("nightmare");
  return keys.length ? keys : ["routine"];
}
