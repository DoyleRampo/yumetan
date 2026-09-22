import { TYPES, LANGUAGES } from "./types.js";
import { quizVersion } from "./diagnosis.js";
import { localDate, validDate, validateSleep } from "./sleep.js";
// GPT reading fields beyond the original four; kept short in every record.
export const READING_FIELDS = [
  "mood_label",
  "mental_state",
  "fortune_overview",
  "fortune_mood",
  "lucky_hint",
  "advice",
];
export const MOOD_WEATHER = [
  "sunny",
  "partly_cloudy",
  "cloudy",
  "rainy",
  "stormy",
];
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
export const typeAlias = (id) =>
  ({ dejavu: "deja", partial: "aware" })[id] || id;
export function legacyAnswers(typeState) {
  const quiz = typeState?.quiz;
  if (!Array.isArray(quiz) || quiz.length !== 16) return null;
  const values = TYPES.map((type, i) =>
    typeof quiz[i] === "number"
      ? quiz[i]
      : quiz.find((q) => typeAlias(q?.type) === type.id)?.value,
  );
  return values.every((v) => [0, 1, 2].includes(v)) ? values : null;
}
export function migrateLegacy(settings, dreams = [], diary = []) {
  return {
    version: 4,
    profile: normalizeProfile(
      settings?.profile
        ? {
            ...settings.profile,
            language: settings.lang || settings.profile.language,
            typeAnswers:
              settings.profile.typeAnswers || legacyAnswers(settings.typeState),
            legacyTypeState: settings.typeState || null,
          }
        : null,
    ),
    records: [...dreams, ...diary.map((d) => ({ ...d, kind: "diary" }))].map(
      normalizeRecord,
    ),
    deleted: [],
  };
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
    messages: messages.length ? messages : text ? [{ role: "user", text }] : [],
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((x) => typeof x === "string").slice(0, 20)
      : [],
    diaryMood: raw.diaryMood ?? raw.mood ?? null,
    legacySleep:
      raw.legacySleep ||
      (raw.sleep && !validateSleep(raw.sleep) ? raw.sleep : null),
    createdAt: raw.createdAt,
    updatedAt: Number.isFinite(Date.parse(raw.updatedAt))
      ? raw.updatedAt
      : raw.createdAt,
    typeTags: [
      ...new Set(
        (Array.isArray(raw.typeTags)
          ? raw.typeTags
          : kind !== "diary" && Array.isArray(raw.tags)
            ? raw.tags
            : []
        )
          .map(typeAlias)
          .filter((id) => TYPES.some((t) => t.id === id)),
      ),
    ],
    shared: raw.shared === true,
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
            ...Object.fromEntries(
              READING_FIELDS.map((key) => [
                key,
                String(raw.analysis[key] || "").slice(0, 2000),
              ]),
            ),
            mood_weather: MOOD_WEATHER.includes(raw.analysis.mood_weather)
              ? raw.analysis.mood_weather
              : "",
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
    // Version 1 (16 answers) and version 2 (one per question) sheets both stay valid.
    typeAnswers: quizVersion(raw.typeAnswers) ? raw.typeAnswers : null,
  };
}
export function parseBackup(value) {
  const records = Array.isArray(value)
    ? value
    : value?.records || value?.dreams;
  if (!Array.isArray(records) || records.length > 5000)
    throw new Error("Invalid backup");
  const diaries = Array.isArray(value?.diary) ? value.diary : [];
  const normalized = [
    ...records,
    ...diaries.map((d) => ({ ...d, kind: "diary" })),
  ].map(normalizeRecord);
  if (new Set(normalized.map((r) => r.id)).size !== normalized.length)
    throw new Error("Duplicate IDs");
  return {
    records: normalized,
    profile: normalizeProfile(value?.profile),
    typeAnswers: legacyAnswers(value?.typeState),
  };
}
export function mergeRecords(local, remote, deleted = []) {
  const result = new Map(local.map((r) => [r.id, r]));
  for (const raw of remote) {
    const next = normalizeRecord(raw),
      prev = result.get(next.id);
    if (!prev || Date.parse(next.updatedAt) > Date.parse(prev.updatedAt))
      result.set(next.id, {
        ...next,
        photo: Object.hasOwn(raw, "photo") ? next.photo : prev?.photo || null,
      });
  }
  for (const id of deleted) result.delete(id);
  return [...result.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
