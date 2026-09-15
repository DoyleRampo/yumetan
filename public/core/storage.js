import { TYPES, LANGUAGES } from "./types.js";
import { localDate, validDate, validateSleep } from "./sleep.js";
const preferences = globalThis.Capacitor?.Plugins?.Preferences;
export async function read(key, fallback = null) {
  const raw = preferences
    ? (await preferences.get({ key })).value
    : localStorage.getItem(key);
  if (raw == null) return fallback;
  return JSON.parse(raw);
}
export async function write(key, value) {
  const raw = JSON.stringify(value);
  if (preferences) await preferences.set({ key, value: raw });
  else localStorage.setItem(key, raw);
}
export function normalizeRecord(raw) {
  if (
    !raw ||
    typeof raw.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id) ||
    !Number.isFinite(Date.parse(raw.createdAt))
  )
    throw new Error("Invalid record");
  const kind = raw.kind === "diary" ? "diary" : "dream";
  const date = raw.date || localDate(raw.createdAt);
  if (!validDate(date)) throw new Error("Invalid date");
  const messages = (Array.isArray(raw.messages) ? raw.messages : [])
    .filter(
      (m) =>
        m &&
        ["user", "assistant"].includes(m.role) &&
        typeof m.text === "string",
    )
    .slice(-40)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 20000) }));
  const text =
    typeof raw.text === "string"
      ? raw.text.slice(0, 20000)
      : messages
          .filter((m) => m.role === "user")
          .map((m) => m.text)
          .join("\n");
  const photo =
    typeof raw.photo === "string" &&
    /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(raw.photo) &&
    raw.photo.length <= 500000
      ? raw.photo
      : null;
  return {
    id: raw.id,
    kind,
    date,
    text,
    messages,
    createdAt: raw.createdAt,
    updatedAt: Number.isFinite(Date.parse(raw.updatedAt))
      ? raw.updatedAt
      : raw.createdAt,
    typeTags: [
      ...new Set(
        (Array.isArray(raw.typeTags) ? raw.typeTags : []).filter((id) =>
          TYPES.some((t) => t.id === id),
        ),
      ),
    ],
    sleep: validateSleep(raw.sleep)
      ? {
          hours: raw.sleep.hours,
          awakenings: raw.sleep.awakenings,
          rested: raw.sleep.rested,
          nightmare: !!raw.sleep.nightmare,
        }
      : null,
    photo,
    analysis:
      raw.analysis && typeof raw.analysis === "object"
        ? {
            ...raw.analysis, // Preserve legacy emotion/theme metadata in backups.
            title: String(raw.analysis.title || "").slice(0, 200),
            summary: String(raw.analysis.summary || "").slice(0, 6000),
            reply: String(raw.analysis.reply || "").slice(0, 6000),
            mental_state_hint: String(
              raw.analysis.mental_state_hint || "",
            ).slice(0, 2000),
            engine: raw.analysis.engine === "ai" ? "ai" : "local",
            language: LANGUAGES.includes(raw.analysis.language)
              ? raw.analysis.language
              : "ja",
            diaryDate: validDate(raw.analysis.diaryDate)
              ? raw.analysis.diaryDate
              : null,
          }
        : null,
  };
}
export function normalizeProfile(raw) {
  if (!raw || typeof raw.nickname !== "string" || !raw.nickname.trim())
    return null;
  return {
    ...raw,
    nickname: raw.nickname.trim().slice(0, 20),
    language: LANGUAGES.includes(raw.language) ? raw.language : "ja",
    typeAnswers:
      Array.isArray(raw.typeAnswers) &&
      raw.typeAnswers.length === 16 &&
      raw.typeAnswers.every((v) => [0, 1, 2].includes(v))
        ? raw.typeAnswers
        : null,
  };
}
export function parseBackup(value) {
  const records = Array.isArray(value)
    ? value
    : value?.records || value?.dreams;
  if (!Array.isArray(records) || records.length > 5000)
    throw new Error("Invalid backup");
  const normalized = records.map(normalizeRecord);
  if (new Set(normalized.map((r) => r.id)).size !== normalized.length)
    throw new Error("Duplicate IDs");
  return { records: normalized, profile: normalizeProfile(value?.profile) };
}
export function mergeRecords(local, remote, deleted = []) {
  const result = new Map(local.map((r) => [r.id, r]));
  for (const raw of remote) {
    const next = normalizeRecord(raw),
      prev = result.get(next.id);
    if (!prev || Date.parse(next.updatedAt) > Date.parse(prev.updatedAt))
      result.set(next.id, {
        ...next,
        photo: next.photo || prev?.photo || null,
      });
  }
  for (const id of deleted) result.delete(id);
  return [...result.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
