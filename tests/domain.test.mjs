import test from "node:test";
import assert from "node:assert/strict";
import { TYPES, GROUPS, LANGUAGES, detectTags } from "../public/core/types.js";
import {
  QUESTIONS,
  AXES,
  PARTS,
  GROUP_AXES,
  TYPE_POLES,
  FREQUENCY_OPTIONS,
  SCALE_STRENGTH,
  classify,
  quizVersion,
} from "../public/core/diagnosis.js";
import { TYPE_LORE } from "../public/core/type-lore.js";
import { messages, translator } from "../public/core/i18n.js";
import {
  sleepScore,
  growth,
  previousDiary,
  previousDate,
  localDate,
  validDate,
  adviceKeys,
} from "../public/core/sleep.js";
import {
  normalizeRecord,
  parseBackup,
  mergeRecords,
} from "../public/core/storage.js";
import { reflect } from "../public/core/reflection.js";
import { dreamLevel, levelThreshold } from "../public/core/level.js";
import {
  reflectionInput,
  moonPhase,
  weekday,
  typeProfile,
  handwritingInput,
  registerFeatures,
} from "../server-features.js";
const now = "2026-09-15T10:00:00Z";
const record = (extra = {}) => ({
  id: "test-1",
  kind: "dream",
  date: "2026-09-15",
  createdAt: now,
  updatedAt: now,
  text: "dream",
  typeTags: [],
  ...extra,
});
// A version-2 answer sheet that points clearly at one type: its group scale high, its
// scene option chosen, and the two style axes on its poles. `strength` scales it down.
function sheetFor(typeId, strength = 1) {
  const type = TYPES.find((t) => t.id === typeId);
  return QUESTIONS.map((q) => {
    if (q.kind === "frequency")
      return q.group === type.group ? Math.round(4 * strength) : 0;
    if (q.kind === "scene")
      return Math.max(
        0,
        q.options.findIndex((o) => o.type === typeId),
      );
    const i = GROUP_AXES[type.group].indexOf(q.axis);
    return i < 0 ? 0 : TYPE_POLES[typeId][i] * Math.round(2 * strength);
  });
}
test("16 unique stable types in four equal groups, all reachable with matching evidence", () => {
  assert.equal(new Set(TYPES.map((t) => t.id)).size, 16);
  for (const group of GROUPS)
    assert.equal(TYPES.filter((t) => t.group === group.id).length, 4);
  assert.equal(QUESTIONS.length, 24);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length);
  for (const type of TYPES) {
    const result = classify(sheetFor(type.id));
    assert.equal(result.id, type.id);
    assert.equal(result.version, 2);
    assert.equal(result.evidence.group.rank, 1);
    assert.ok(result.evidence.axes.every((a) => a.match));
    assert.equal(result.evidence.scene.match, true);
    assert.equal(result.tied, false);
    assert.equal(result.provisional, false);
    // Every type also wins on a half-strength sheet: the model has no dead corners.
    assert.equal(classify(sheetFor(type.id, 0.5)).id, type.id);
  }
  // Each group is split by exactly two axes, and its four types cover all four pole combinations.
  for (const group of GROUPS) {
    assert.equal(GROUP_AXES[group.id].length, 2);
    const combos = TYPES.filter((t) => t.group === group.id).map((t) =>
      TYPE_POLES[t.id].join(","),
    );
    assert.equal(new Set(combos).size, 4);
  }
});
test("incomplete questionnaire rejected; empty sheets are provisional and never default to nightmare", () => {
  assert.throws(() => classify([2]));
  assert.throws(() => classify(Array(16).fill(null)));
  assert.throws(() => classify(Array(24).fill(9)));
  assert.equal(quizVersion(Array(24).fill(0)), 2);
  assert.equal(quizVersion(Array(16).fill(0)), 1);
  assert.equal(quizVersion(Array(24).fill(-3)), null);
  const blank = classify(Array(24).fill(0));
  assert.equal(blank.provisional, true);
  assert.equal(blank.tied, true);
  assert.notEqual(TYPES.find((t) => t.id === blank.id).group, "nightmare");
  assert.deepEqual(blank, classify(Array(24).fill(0)));
  // Legacy 16-answer sheets still classify, with the same all-zero rule.
  const legacy = Array(16).fill(0);
  assert.equal(classify(legacy).provisional, true);
  assert.equal(classify(legacy).version, 1);
  legacy[0] = 2;
  assert.equal(classify(legacy).id, "chase");
});
test("recent recorded themes can change type; diaries and repeated tags cannot multiply votes", () => {
  const answers = sheetFor("chase", 0.5);
  const dreams = Array.from({ length: 6 }, (_, i) =>
    record({ id: `dream-${i}`, typeTags: ["challenge", "challenge"] }),
  );
  assert.equal(classify(answers).id, "chase");
  assert.equal(classify(answers, dreams.slice(0, 3)).id, "chase");
  const flipped = classify(answers, dreams);
  assert.equal(flipped.id, "challenge");
  assert.equal(flipped.evidence.dreams, 6);
  assert.equal(flipped.evidence.scene.match, false);
  assert.equal(
    classify(
      answers,
      dreams.map((d) => ({ ...d, kind: "diary" })),
    ).id,
    "chase",
  );
  // Only the 12 most recent dream records vote.
  const many = Array.from({ length: 30 }, (_, i) =>
    record({
      id: `many-${i}`,
      createdAt: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T10:00:00Z`,
      typeTags: ["place"],
    }),
  );
  assert.equal(classify(answers, many).evidence.dreams, 12);
  assert.equal(
    classify(answers, many).scores.find((s) => s.id === "place").score,
    classify(answers, many.slice(0, 12)).scores.find((s) => s.id === "place")
      .score,
  );
});
test("keyword evidence works in all four languages", () => {
  for (const text of [
    "目標に挑戦していた",
    "꿈에서 도전했다",
    "在梦中挑战困难",
    "I faced a challenge",
  ])
    assert.ok(detectTags(text).includes("challenge"));
});
test("sleep boundaries and missing data do not fake measurements", () => {
  assert.equal(sleepScore(null), null);
  assert.equal(sleepScore({ hours: "", awakenings: 0, rested: 5 }), null);
  assert.equal(sleepScore({ hours: 25, awakenings: 0, rested: 5 }), null);
  assert.equal(sleepScore({ hours: 7, awakenings: 0, rested: 5 }).level, 5);
  assert.equal(sleepScore({ hours: 0, awakenings: 30, rested: 1 }).level, 1);
  assert.equal(
    sleepScore({ hours: 8, awakenings: 0, rested: 5, nightmare: true }).score,
    100,
  );
  assert.ok(
    sleepScore({ hours: 7, awakenings: 0, rested: 5 }, "10代").score < 100,
  );
});
test("growth takes one latest report per day and only seven calendar days", () => {
  const good = { hours: 8, awakenings: 0, rested: 5 },
    bad = { hours: 0, awakenings: 30, rested: 1 };
  const values = [
    record({ sleep: good }),
    record({ id: "older", sleep: bad, updatedAt: "2026-09-15T09:00:00Z" }),
    record({ id: "old-day", date: "2026-09-08", sleep: bad }),
    record({ id: "future", date: "2026-09-16", sleep: bad }),
  ];
  assert.deepEqual(growth(values, "20代", "2026-09-15"), {
    score: 100,
    level: 5,
    days: 1,
  });
  assert.equal(growth([], "20代", "2026-09-15").level, null);
  assert.equal(growth([record({ sleep: bad })], "20代", "2026-09-15").level, 1);
});
test("previous diary uses a local calendar date across month, leap year, and DST boundaries", () => {
  assert.equal(previousDate("2026-01-01"), "2025-12-31");
  assert.equal(previousDate("2024-03-01"), "2024-02-29");
  assert.equal(previousDate("2026-03-09"), "2026-03-08");
  assert.equal(previousDate("2026-11-02"), "2026-11-01");
  assert.equal(validDate("2026-02-30"), false);
  const diary = record({
    kind: "diary",
    date: "2026-09-14",
    text: "Yesterday challenge",
  });
  assert.equal(previousDiary([diary], "2026-09-15"), diary);
  const result = reflect({
    text: "challenge",
    date: "2026-09-15",
    records: [diary],
    language: "en",
  });
  assert.equal(result.analysis.diaryDate, "2026-09-14");
  assert.deepEqual(result.sharedThemes, ["challenge"]);
  assert.equal(
    reflect({ text: "challenge", date: "2026-09-16", records: [diary] }).diary,
    null,
  );
});
test("nightmare prompts advice but never lowers score", () => {
  assert.ok(
    adviceKeys({
      hours: 8,
      awakenings: 0,
      rested: 5,
      nightmare: true,
    }).includes("nightmare"),
  );
});
test("all interface and catalog copy has four nonempty translations", () => {
  for (const [key, translations] of Object.entries(messages)) {
    assert.equal(translations.length, 4, key);
    for (const lang of LANGUAGES) assert.ok(translator(lang)(key).length, key);
  }
  const four = (values, key) =>
    assert.equal(values.filter(Boolean).length, 4, key);
  for (const type of TYPES) {
    four(type.names, type.id);
    four(TYPE_LORE[type.id].basis, type.id);
    four(TYPE_LORE[type.id].story, type.id);
  }
  for (const group of GROUPS) four(group.desc, group.id);
  for (const q of QUESTIONS) {
    four(q.text, q.id);
    for (const o of q.options || []) four(o.text, q.id);
    if (q.left) four(q.left, q.id);
    if (q.right) four(q.right, q.id);
  }
  for (const axis of AXES) {
    four(axis.names, axis.id);
    four(axis.hint, axis.id);
    for (const pole of axis.poles) four(pole, axis.id);
  }
  for (const part of PARTS) {
    four(part.names, part.id);
    four(part.hint, part.id);
  }
  for (const values of [...FREQUENCY_OPTIONS, ...SCALE_STRENGTH]) four(values);
});
test("legacy backups retain conversation and analysis; malformed entries rejected", () => {
  const legacy = {
    id: "old-1",
    createdAt: now,
    messages: [{ role: "user", text: "My old dream" }],
    analysis: {
      title: "Old dream",
      summary: "Safe",
      mood: 1,
      emotions: ["喜び"],
    },
  };
  const result = parseBackup({ dreams: [legacy] });
  assert.equal(result.records[0].text, "My old dream");
  assert.equal(result.records[0].analysis.title, "Old dream");
  assert.equal(result.records[0].analysis.mood, 1);
  assert.deepEqual(result.records[0].analysis.emotions, ["喜び"]);
  assert.throws(() => parseBackup({ dreams: [{ id: "bad" }] }));
  assert.throws(() => parseBackup({ dreams: [legacy, legacy] }));
  assert.equal(
    normalizeRecord(record({ photo: "javascript:alert(1)" })).photo,
    null,
  );
});
test("sync merges by update time, retains local image, and honors deletions", () => {
  const photo = "data:image/jpeg;base64,/9j/";
  const local = record({ photo }),
    remote = record({ text: "new", updatedAt: "2026-09-15T12:00:00Z" });
  assert.equal(mergeRecords([local], [remote])[0].photo, photo);
  assert.equal(mergeRecords([local], [remote])[0].text, "new");
  assert.deepEqual(mergeRecords([local], [remote], ["test-1"]), []);
});
test("API validates locale, image format, and the exact previous diary date", () => {
  const input = {
    language: "en",
    date: "2026-09-15",
    text: "hello",
    typeTags: ["challenge"],
    diary: { date: "2026-09-14", text: "Yesterday" },
  };
  assert.equal(reflectionInput(input).diary.text, "Yesterday");
  assert.throws(() => reflectionInput({ ...input, language: "xx" }));
  assert.throws(() =>
    reflectionInput({ ...input, diary: { date: "2026-09-13", text: "wrong" } }),
  );
  // Recent diaries: at most seven, before the wake-up date, unique dates, bounded text.
  const recent = reflectionInput({
    ...input,
    recentDiaries: [
      { date: "2026-09-10", text: "older" },
      { date: "2026-09-14", text: "newer" },
    ],
    sleep: { hours: 6.5, awakenings: 0, rested: 3, nightmare: true },
    dreamType: "chase",
  });
  assert.deepEqual(
    recent.recentDiaries.map((d) => d.date),
    ["2026-09-14", "2026-09-10"],
  );
  assert.equal(recent.sleep.nightmare, true);
  assert.equal(recent.dreamType, "chase");
  for (const bad of [
    [{ date: "2026-09-15", text: "same day" }],
    [{ date: "2026-09-16", text: "future" }],
    [
      { date: "2026-09-14", text: "a" },
      { date: "2026-09-14", text: "b" },
    ],
    [{ date: "2026-09-14", text: "x".repeat(2001) }],
    Array.from({ length: 8 }, (_, i) => ({
      date: `2026-09-0${i + 1}`,
      text: "too many",
    })),
    "not a list",
  ])
    assert.throws(() => reflectionInput({ ...input, recentDiaries: bad }));
  assert.throws(() =>
    reflectionInput({
      ...input,
      sleep: { hours: 30, awakenings: 0, rested: 3 },
    }),
  );
  assert.throws(() => reflectionInput({ ...input, dreamType: "unicorn" }));
  // Recent dreams: at most seven summaries on or before the wake-up date, known
  // theme ids, short titles, and only the app's weather words.
  const withDreams = reflectionInput({
    ...input,
    recentDreams: [
      {
        date: "2026-09-13",
        typeTags: ["chase", "chase"],
        title: "Old",
        mood_weather: "rainy",
      },
      { date: "2026-09-15", typeTags: [], title: null, mood_weather: "" },
    ],
  });
  assert.deepEqual(
    withDreams.recentDreams.map((d) => [
      d.date,
      d.typeTags,
      d.title,
      d.mood_weather,
    ]),
    [
      ["2026-09-15", [], "", ""],
      ["2026-09-13", ["chase"], "Old", "rainy"],
    ],
  );
  for (const bad of [
    [{ date: "2026-09-16", typeTags: [] }],
    [{ date: "2026-09-14", typeTags: ["unicorn"] }],
    [{ date: "2026-09-14", typeTags: [], title: "x".repeat(81) }],
    [{ date: "2026-09-14", typeTags: [], mood_weather: "foggy" }],
    Array.from({ length: 8 }, () => ({ date: "2026-09-14", typeTags: [] })),
    "not a list",
  ])
    assert.throws(() => reflectionInput({ ...input, recentDreams: bad }));
  // Prompt seasoning is deterministic and the type profile speaks the user's language.
  assert.equal(weekday("2026-09-15"), "Tuesday");
  assert.equal(moonPhase("2026-09-11"), "new moon");
  assert.equal(moonPhase("2026-09-26"), "full moon");
  assert.equal(typeProfile("chase", "en").name, "The Runner");
  assert.equal(typeProfile("chase", "ja").group, "悪夢タイプ");
  assert.equal(typeProfile("unicorn", "ja"), null);
  assert.throws(() =>
    handwritingInput({
      language: "en",
      image: "data:image/svg+xml;base64,AAAA",
    }),
  );
  assert.throws(() =>
    handwritingInput({ language: "en", image: "data:image/png;base64,AAAA" }),
  );
  assert.equal(
    handwritingInput({ language: "en", image: "data:image/jpeg;base64,/9j/" })
      .source.media_type,
    "image/jpeg",
  );
});
test("AI routes propagate requested language, context, and multimodal content using a mock provider", async () => {
  const routes = new Map(),
    calls = [];
  let gates = 0;
  registerFeatures(
    { post: (path, fn) => routes.set(path, fn) },
    {
      gate: () => gates++,
      asyncRoute: (fn) => fn,
      knowledge: "Evidence",
      callAI: async (args) => {
        calls.push(args);
        return args.schema.parse(
          args.messages[0].content instanceof Array
            ? { text: "Notebook text" }
            : {
                title: "Title",
                summary: "Summary",
                reply: "Reply",
                mental_state_hint: "Hint",
                mood_weather: "sunny",
                mood_label: "Calm",
                mental_state: "State",
                fortune_overview: "Outlook",
                fortune_mood: "Mood",
                lucky_hint: "Lucky",
                advice: "Advice",
              },
        );
      },
    },
  );
  let payload;
  await routes.get("/api/reflect")(
    {
      body: {
        language: "ko",
        text: "Dream",
        date: "2026-09-15",
        diary: { date: "2026-09-14", text: "Yesterday" },
        recentDiaries: [
          { date: "2026-09-12", text: "Two days before" },
          { date: "2026-09-14", text: "Yesterday" },
        ],
        sleep: { hours: 7, awakenings: 1, rested: 4, nightmare: false },
        dreamType: "challenge",
      },
    },
    { json: (value) => (payload = value) },
  );
  assert.ok(calls[0].system[0].text.includes("Korean"));
  assert.ok(calls[0].system[0].text.includes("fortune"));
  assert.ok(calls[0].messages[0].content.includes("Yesterday"));
  assert.ok(calls[0].messages[0].content.includes("Two days before"));
  assert.ok(calls[0].messages[0].content.includes('"rested":4'));
  const sent = JSON.parse(calls[0].messages[0].content);
  assert.equal(sent.typeProfile.id, "challenge");
  assert.equal(sent.typeProfile.name, "도전형");
  assert.equal(sent.weekday, "Tuesday");
  assert.ok(sent.moon);
  assert.deepEqual(sent.recentDreams, []);
  assert.ok(calls[0].system[0].text.includes("mood_weather"));
  assert.ok(calls[0].system[0].text.includes("Evidence"));
  assert.equal(payload.analysis.reply, "Reply");
  assert.equal(payload.analysis.fortune_overview, "Outlook");
  assert.equal(payload.analysis.mood_weather, "sunny");
  await routes.get("/api/handwriting")(
    { body: { language: "ja", image: "data:image/jpeg;base64,/9j/" } },
    { json: (value) => (payload = value) },
  );
  assert.equal(calls[1].messages[0].content[0].type, "image");
  assert.ok(calls[1].system[0].text.includes("transcribe"));
  assert.equal(payload.text, "Notebook text");
  assert.equal(gates, 2);
});

test("main v4 migration retains separate diary, questionnaire, aliases, and old sleep evidence", async () => {
  const { migrateLegacy, legacyAnswers } =
    await import("../public/core/storage.js");
  const quiz = TYPES.map((type) => ({
    type:
      type.id === "deja" ? "dejavu" : type.id === "aware" ? "partial" : type.id,
    value: type.id === "challenge" ? 2 : 0,
  }));
  const oldSleep = { score: 82, level: 5, hours: 7, check: { feel: "good" } };
  const oldDream = record({
    tags: ["dejavu", "partial"],
    typeTags: undefined,
    sleep: oldSleep,
  });
  const oldDiary = record({
    id: "diary-1",
    date: "2026-09-14",
    mood: 4,
    tags: ["exercise"],
    text: "Previous day",
  });
  const state = migrateLegacy(
    { profile: { nickname: "Existing" }, lang: "ko", typeState: { quiz } },
    [oldDream],
    [oldDiary],
  );
  assert.equal(state.profile.language, "ko");
  assert.equal(classify(state.profile.typeAnswers).id, "challenge");
  assert.deepEqual(state.records[0].typeTags, ["deja", "aware"]);
  assert.equal(state.records[0].sleep, null);
  assert.equal(state.records[0].legacySleep.score, 82);
  assert.equal(state.records[1].kind, "diary");
  assert.equal(state.records[1].diaryMood, 4);
  const backup = parseBackup({
    dreams: [oldDream],
    diary: [oldDiary],
    typeState: { quiz },
  });
  assert.equal(backup.records.length, 2);
  assert.deepEqual(backup.typeAnswers, legacyAnswers({ quiz }));
});

test("character collection defaults and fallbacks retain all stable type IDs and translations", async () => {
  const {
    CHARACTER_SETS,
    DEFAULT_CHARACTER_SET,
    normalizeCharacterSet,
    allowedCharacterSet,
    characterById,
  } = await import("../public/core/characters.js");
  assert.equal(DEFAULT_CHARACTER_SET, "animal");
  assert.equal(normalizeCharacterSet(undefined), "animal");
  assert.equal(normalizeCharacterSet("unknown"), "animal");
  assert.equal(normalizeCharacterSet("human"), "human");
  // Human characters are a paid perk: the free plan always falls back to animals.
  assert.equal(allowedCharacterSet("human", "free"), "animal");
  assert.equal(allowedCharacterSet("human", "starter"), "human");
  assert.equal(allowedCharacterSet("human", "standard"), "human");
  assert.equal(allowedCharacterSet("animal", "free"), "animal");
  assert.equal(allowedCharacterSet("unknown", "starter"), "animal");
  for (const set of CHARACTER_SETS) {
    assert.deepEqual(
      Object.keys(set.characters),
      TYPES.map((t) => t.id),
    );
    for (const type of TYPES) {
      const character = characterById(type.id, set.id);
      assert.equal(character.id, type.id);
      for (const field of ["names", "titles", "stories", "quotes"]) {
        assert.equal(character[field].length, 4);
        assert.ok(
          character[field].every(
            (text) => typeof text === "string" && text.trim(),
          ),
        );
      }
    }
  }
  assert.equal(characterById("challenge").names[3], "Kiro");
  assert.equal(characterById("challenge", "human").names[3], "Kakeru");
  assert.equal(characterById("missing").id, "chase");
});

test("dream level grows with logged dreams only, on a widening curve without a cap", () => {
  const dreams = (n) =>
    Array.from({ length: n }, (_, i) => record({ id: `d${i}` }));
  const diaries = Array.from({ length: 50 }, (_, i) =>
    record({ id: `j${i}`, kind: "diary" }),
  );
  assert.deepEqual(dreamLevel([]), {
    level: 1,
    count: 0,
    next: 3,
    remaining: 3,
    progress: 0,
    stars: 1,
  });
  assert.equal(dreamLevel(diaries).level, 1);
  assert.equal(dreamLevel(dreams(2)).remaining, 1);
  assert.equal(dreamLevel(dreams(3)).level, 2);
  assert.equal(dreamLevel(dreams(3)).progress, 0);
  assert.equal(dreamLevel(dreams(5)).progress, 50);
  assert.equal(dreamLevel(dreams(20)).level, 5);
  assert.equal(dreamLevel(dreams(90)).level, 10);
  assert.equal(dreamLevel(dreams(115)).level, 11);
  assert.equal(dreamLevel(dreams(7)).stars, 1);
  assert.equal(dreamLevel(dreams(12)).stars, 2);
  assert.equal(dreamLevel(dreams(500)).stars, 5);
  for (let level = 2; level < 30; level++)
    assert.ok(levelThreshold(level) < levelThreshold(level + 1));
});
