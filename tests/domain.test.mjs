import test from "node:test";
import assert from "node:assert/strict";
import {
  TYPES,
  GROUPS,
  LANGUAGES,
  classify,
  detectTags,
} from "../public/core/types.js";
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
import {
  reflectionInput,
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
test("16 unique stable types in four equal groups, all reachable", () => {
  assert.equal(new Set(TYPES.map((t) => t.id)).size, 16);
  for (const group of GROUPS)
    assert.equal(TYPES.filter((t) => t.group === group.id).length, 4);
  TYPES.forEach((type, i) => {
    const answers = Array(16).fill(0);
    answers[i] = 2;
    assert.equal(classify(answers).id, type.id);
  });
});
test("incomplete questionnaire rejected, ties deterministic, no response weight invented", () => {
  assert.throws(() => classify([2]));
  assert.throws(() => classify(Array(16).fill(null)));
  const result = classify(Array(16).fill(0));
  assert.equal(result.provisional, true);
  assert.equal(result.tied, true);
  assert.deepEqual(result, classify(Array(16).fill(0)));
});
test("recent recorded themes can change type; diaries and repeated tags cannot multiply votes", () => {
  const answers = Array(16).fill(0);
  answers[0] = 2;
  const dreams = Array.from({ length: 3 }, (_, i) =>
    record({ id: `dream-${i}`, typeTags: ["challenge", "challenge"] }),
  );
  assert.equal(classify(answers, dreams).id, "challenge");
  assert.equal(
    classify(
      answers,
      dreams.map((d) => ({ ...d, kind: "diary" })),
    ).id,
    "chase",
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
  for (const type of TYPES)
    for (const values of [type.names, type.questions])
      assert.equal(values.filter(Boolean).length, 4);
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
      callClaude: async (args) => {
        calls.push(args);
        return args.schema.parse(
          args.messages[0].content instanceof Array
            ? { text: "Notebook text" }
            : {
                title: "Title",
                summary: "Summary",
                reply: "Reply",
                mental_state_hint: "Hint",
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
      },
    },
    { json: (value) => (payload = value) },
  );
  assert.ok(calls[0].system[0].text.includes("Korean"));
  assert.ok(calls[0].messages[0].content.includes("Yesterday"));
  assert.equal(payload.analysis.reply, "Reply");
  await routes.get("/api/handwriting")(
    { body: { language: "ja", image: "data:image/jpeg;base64,/9j/" } },
    { json: (value) => (payload = value) },
  );
  assert.equal(calls[1].messages[0].content[0].type, "image");
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
