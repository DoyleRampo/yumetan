import { z } from "zod/v4";
import { TYPES, GROUPS, LANGUAGES, localized } from "./public/core/types.js";
import { TYPE_LORE } from "./public/core/type-lore.js";
import { previousDate, validDate, validateSleep } from "./public/core/sleep.js";
import { MOOD_WEATHER } from "./public/core/storage.js";
import {
  reflectionSystemPrompt,
  handwritingSystemPrompt,
} from "./server/prompts.js";
// Every field is required: OpenAI strict JSON schemas reject optional keys.
const Reflection = z.object({
  title: z.string(),
  summary: z.string(),
  reply: z.string(),
  mental_state_hint: z.string(),
  mood_weather: z.enum(MOOD_WEATHER),
  mood_label: z.string(),
  mental_state: z.string(),
  fortune_overview: z.string(),
  fortune_mood: z.string(),
  lucky_hint: z.string(),
  advice: z.string(),
});
export const RECENT_DIARY_LIMIT = 7;
export const RECENT_DIARY_CHARS = 2000;
export const RECENT_DREAM_LIMIT = 7;
export const RECENT_DREAM_TITLE_CHARS = 80;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MOON_PHASES = [
  "new moon",
  "waxing crescent",
  "first quarter",
  "waxing gibbous",
  "full moon",
  "waning gibbous",
  "last quarter",
  "waning crescent",
];
// Light seasoning for the fortune: the moon phase on the wake-up date (synodic
// month from the 2000-01-06 18:14 UTC new moon; accurate to about a day).
export function moonPhase(date) {
  const days = (Date.parse(`${date}T12:00:00Z`) - 947182440000) / 86400000;
  const cycle = 29.530588853;
  const age = ((days % cycle) + cycle) % cycle;
  return MOON_PHASES[Math.round((age / cycle) * 8) % 8];
}
export const weekday = (date) =>
  WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
// The user's current 16-type, described in their language for the prompt.
export function typeProfile(typeId, language) {
  const type = TYPES.find((t) => t.id === typeId);
  if (!type) return null;
  const group = GROUPS.find((g) => g.id === type.group);
  return {
    id: type.id,
    name: localized(type.names, language),
    group: localized(group.names, language),
    basis: localized(TYPE_LORE[type.id].basis, language),
  };
}
const Handwriting = z.object({ text: z.string() });
const fail = (message) => Object.assign(new Error(message), { status: 400 });
export function reflectionInput(body) {
  if (
    !body ||
    !LANGUAGES.includes(body.language) ||
    !validDate(body.date) ||
    typeof body.text !== "string" ||
    body.text.length > 20000
  )
    throw fail("Invalid reflection input");
  const tags = body.typeTags ?? [];
  if (
    !Array.isArray(tags) ||
    tags.length > 16 ||
    tags.some((id) => !TYPES.some((t) => t.id === id))
  )
    throw fail("Invalid themes");
  let diary = null;
  if (body.diary != null) {
    if (
      body.diary.date !== previousDate(body.date) ||
      typeof body.diary.text !== "string" ||
      body.diary.text.length > 20000
    )
      throw fail("Diary must be from the previous calendar day");
    diary = { date: body.diary.date, text: body.diary.text };
  }
  // Recent diary pages give the reading its context. They must precede the dream's
  // wake-up date, stay short, and never repeat a date.
  const recent = body.recentDiaries ?? [];
  if (!Array.isArray(recent) || recent.length > RECENT_DIARY_LIMIT)
    throw fail("Invalid recent diaries");
  const seen = new Set();
  const recentDiaries = recent.map((entry) => {
    if (
      !entry ||
      !validDate(entry.date) ||
      entry.date >= body.date ||
      seen.has(entry.date) ||
      typeof entry.text !== "string" ||
      entry.text.length > RECENT_DIARY_CHARS
    )
      throw fail("Invalid recent diaries");
    seen.add(entry.date);
    return { date: entry.date, text: entry.text };
  });
  recentDiaries.sort((a, b) => b.date.localeCompare(a.date));
  // Earlier dreams, summarised: date, themes, title and the weather Luna gave them.
  const dreams = body.recentDreams ?? [];
  if (!Array.isArray(dreams) || dreams.length > RECENT_DREAM_LIMIT)
    throw fail("Invalid recent dreams");
  const recentDreams = dreams.map((entry) => {
    const entryTags = entry?.typeTags ?? [];
    if (
      !entry ||
      !validDate(entry.date) ||
      entry.date > body.date ||
      !Array.isArray(entryTags) ||
      entryTags.length > 16 ||
      entryTags.some((id) => !TYPES.some((t) => t.id === id)) ||
      (entry.title != null &&
        (typeof entry.title !== "string" ||
          entry.title.length > RECENT_DREAM_TITLE_CHARS)) ||
      (entry.mood_weather != null &&
        entry.mood_weather !== "" &&
        !MOOD_WEATHER.includes(entry.mood_weather))
    )
      throw fail("Invalid recent dreams");
    return {
      date: entry.date,
      typeTags: [...new Set(entryTags)],
      title: entry.title || "",
      mood_weather: entry.mood_weather || "",
    };
  });
  recentDreams.sort((a, b) => b.date.localeCompare(a.date));
  let sleep = null;
  if (body.sleep != null) {
    if (!validateSleep(body.sleep)) throw fail("Invalid sleep");
    sleep = {
      hours: body.sleep.hours,
      awakenings: body.sleep.awakenings,
      rested: body.sleep.rested,
      nightmare: Boolean(body.sleep.nightmare),
    };
  }
  const dreamType =
    body.dreamType == null
      ? null
      : TYPES.some((t) => t.id === body.dreamType)
        ? body.dreamType
        : null;
  if (body.dreamType != null && !dreamType) throw fail("Invalid dream type");
  return {
    text: body.text,
    date: body.date,
    typeTags: [...new Set(tags)],
    diary,
    recentDiaries,
    recentDreams,
    sleep,
    dreamType,
    language: body.language,
  };
}
export function handwritingInput(body) {
  if (
    !body ||
    !LANGUAGES.includes(body.language) ||
    typeof body.image !== "string" ||
    body.image.length > 500000
  )
    throw fail("Invalid image");
  const match = body.image.match(
    /^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/]+={0,2})$/,
  );
  if (!match || match[2].length % 4 !== 0) throw fail("Invalid image");
  const bytes = Buffer.from(match[2], "base64");
  const valid =
    match[1] === "jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : match[1] === "png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw fail("Invalid image signature");
  return {
    language: body.language,
    source: { type: "base64", media_type: `image/${match[1]}`, data: match[2] },
  };
}
export function registerFeatures(app, { gate, callAI, knowledge, asyncRoute }) {
  app.post(
    "/api/reflect",
    asyncRoute(async (req, res) => {
      const data = reflectionInput(req.body);
      const client = await gate(req);
      const analysis = await callAI({
        client,
        system: [
          {
            type: "text",
            text: reflectionSystemPrompt(data.language, knowledge),
          },
        ],
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              language: data.language,
              date: data.date,
              weekday: weekday(data.date),
              moon: moonPhase(data.date),
              typeProfile: typeProfile(data.dreamType, data.language),
              typeTags: data.typeTags,
              dream: data.text,
              sleep: data.sleep,
              previousDayDiary: data.diary,
              recentDiaries: data.recentDiaries,
              recentDreams: data.recentDreams,
            }),
          },
        ],
        schema: Reflection,
        kind: "reflections",
        date: data.date,
      });
      res.json({ analysis });
    }),
  );
  app.post(
    "/api/handwriting",
    asyncRoute(async (req, res) => {
      const data = handwritingInput(req.body);
      const client = await gate(req);
      const output = await callAI({
        client,
        system: [
          {
            type: "text",
            text: handwritingSystemPrompt(),
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: data.source },
              { type: "text", text: "Transcribe this notebook." },
            ],
          },
        ],
        schema: Handwriting,
        kind: "handwriting",
      });
      res.json({ text: output.text.slice(0, 20000) });
    }),
  );
}
