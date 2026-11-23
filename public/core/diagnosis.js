// 16-type questionnaire, version 2. Locale order: ja, ko, zh, en.
//
// Model: 4 group scales + 4 style axes + 4 scene picks.
//  - Group scales (12 items, 5-point frequency): how often each of the four dream
//    tendencies (nightmare / premonition / lucid / recurring) shows up. Frequency
//    scales are what dream research uses for recall, nightmare and lucid-dream rates.
//  - Style axes (8 items, 5-point bipolar): four contrasts that split each group
//    into its 2 × 2 sub-types. Each group uses two of the four axes.
//  - Scene picks (4 items, one per group): a concrete situation with one option per
//    sub-type, giving direct evidence for a single type.
// The quiz produces a 0–100 score for every one of the 16 types, so recent dream
// records can keep adding votes on the same scale. Stable IDs are persisted; copy can
// change without invalidating stored answers.
import { TYPES, GROUPS, typeById } from "./types.js";

export const QUIZ_VERSION = 2;
export const GROUP_WEIGHT = 50; // group scale → up to 50 points
export const STYLE_WEIGHT = 30; // fit of the two style axes → up to 30 points
export const SCENE_WEIGHT = 20; // scene pick → 20 points
export const DREAM_VOTE = 8; // one recent record carrying the type's tag → 8 points
export const DREAM_WINDOW = 12; // at most this many recent dream records vote
// Ties never fall back to the nightmare group by default.
const TIE_GROUP_ORDER = ["lucid", "recurring", "premonition", "nightmare"];

export const AXES = [
  {
    id: "motion",
    names: ["動きかた", "움직임", "行动方式", "Motion"],
    poles: [
      ["動く", "움직인다", "行动", "Act"],
      ["見つめる", "바라본다", "静观", "Watch"],
    ],
    hint: [
      "夢の中で困ったとき、体を動かすか、その場で見つめるか。",
      "꿈에서 곤란할 때 몸을 움직이는지, 그 자리에서 바라보는지.",
      "梦里遇到困难时，是行动起来，还是停在原地观看。",
      "When a dream turns difficult: do you move, or stay and watch?",
    ],
  },
  {
    id: "focus",
    names: ["まなざし", "시선", "视线", "Focus"],
    poles: [
      ["外の世界", "바깥 세계", "外部世界", "The world"],
      ["自分の内側", "내 안", "内心", "Within"],
    ],
    hint: [
      "印象に残るのが、まわりの出来事か、自分の感覚や気持ちか。",
      "인상에 남는 것이 주변의 사건인지, 내 감각과 마음인지.",
      "留在记忆里的，是周围发生的事，还是自己的感觉和心情。",
      "What stays: what happened around you, or what you felt inside?",
    ],
  },
  {
    id: "texture",
    names: ["残りかた", "남는 방식", "留存方式", "Texture"],
    poles: [
      ["はっきりした場面", "또렷한 장면", "清晰的场景", "Clear scenes"],
      ["雰囲気・気配", "분위기·기운", "氛围·气息", "Atmosphere"],
    ],
    hint: [
      "夢が、具体的な場面として残るか、気配として残るか。",
      "꿈이 구체적인 장면으로 남는지, 기운으로 남는지.",
      "梦是以具体场景留下来，还是以气息留下来。",
      "Does a dream remain as concrete scenes, or as a mood?",
    ],
  },
  {
    id: "direction",
    names: ["時間の向き", "시간의 방향", "时间方向", "Direction"],
    poles: [
      ["これから", "앞으로", "将来", "Ahead"],
      ["見覚え", "낯익음", "似曾相识", "Familiar"],
    ],
    hint: [
      "夢が指しているのが、まだ来ていないことか、すでに知っていることか。",
      "꿈이 가리키는 것이 아직 오지 않은 일인지, 이미 아는 것인지.",
      "梦指向的是尚未到来的事，还是早已熟悉的事。",
      "Does a dream point ahead, or back to what you already know?",
    ],
  },
];
export const axisById = (id) => AXES.find((a) => a.id === id);

// Which two axes split each group, and where each type sits (-1 = left pole, +1 = right pole).
export const GROUP_AXES = {
  nightmare: ["motion", "focus"],
  premonition: ["texture", "direction"],
  lucid: ["motion", "focus"],
  recurring: ["texture", "focus"],
};
export const TYPE_POLES = {
  chase: [-1, -1], // act, the world
  loss: [-1, 1], // act (search), within
  bound: [1, 1], // watch (cannot move), within (the body)
  collapse: [1, -1], // watch, the world
  future: [-1, -1], // clear scenes, ahead
  intuition: [1, -1], // atmosphere, ahead
  symbol: [1, 1], // atmosphere, familiar (a private language of images)
  deja: [-1, 1], // clear scenes, familiar
  lucid: [-1, 1], // act, within (self-directed)
  aware: [1, 1], // watch (limited control), within
  observer: [1, -1], // watch, the world
  challenge: [-1, -1], // act, the world
  place: [-1, -1], // clear scenes, the world
  person: [-1, 1], // clear scenes, within (relationships)
  story: [1, -1], // atmosphere (a course of events), the world
  emotion: [1, 1], // atmosphere, within
};

export const FREQUENCY_OPTIONS = [
  ["ない", "없음", "没有", "Never"],
  ["年に数回", "1년에 몇 번", "一年几次", "Yearly"],
  ["月1〜2回", "한 달 1~2번", "每月一两次", "Monthly"],
  ["週1回", "주 1번", "每周一次", "Weekly"],
  ["週に数回", "주 몇 번", "每周几次", "2+ a week"],
];
// The frequency scale reads like the moon filling up.
export const FREQUENCY_ICONS = ["🌑", "🌒", "🌓", "🌔", "🌕"];
// Bipolar answers run -2 … 2; the label describes how strongly the pole applies.
export const SCALE_STRENGTH = [
  ["とても", "많이", "非常", "Very"],
  ["やや", "조금", "有点", "A bit"],
  ["半々", "반반", "一半", "Both"],
  ["やや", "조금", "有点", "A bit"],
  ["とても", "많이", "非常", "Very"],
];
export const PARTS = [
  {
    id: "frequency",
    names: ["どのくらい見る？", "얼마나 자주?", "多常出现？", "How often?"],
    hint: [
      "この1年くらいを思い出して、近いものを選んでね。",
      "최근 1년 정도를 떠올리며 가까운 것을 골라 주세요.",
      "回想最近一年左右，选择最接近的选项。",
      "Think back over the past year or so and pick what comes closest.",
    ],
  },
  {
    id: "scene",
    names: ["どんな場面？", "어떤 장면?", "什么场景？", "Which scene?"],
    hint: [
      "いちばん近いものをひとつ。ぴったりでなくて大丈夫。",
      "가장 가까운 것을 하나만. 딱 맞지 않아도 괜찮아요.",
      "选一个最接近的，不必完全吻合。",
      "Pick the closest one. It does not have to be a perfect match.",
    ],
  },
  {
    id: "style",
    names: ["あなたの見かた", "나의 방식", "你的方式", "Your style"],
    hint: [
      "どちらに近いか、5段階で選んでね。",
      "어느 쪽에 가까운지 5단계로 골라 주세요.",
      "在五个等级中选择更接近的一边。",
      "Choose which side feels closer, on a five-point scale.",
    ],
  },
];

// Every question keeps its id, position and answer values (saved answers stay
// valid); only the words and the way they are shown change. Answers are short
// words with an icon, so every choice fits on one screen at a glance.
const frequency = (id, group, icon, text) => ({
  id,
  kind: "frequency",
  part: "frequency",
  group,
  icon,
  text,
});
const scene = (id, group, text, options) => ({
  id,
  kind: "scene",
  part: "scene",
  group,
  text,
  options, // [{ type, icon, text }]
});
const option = (type, icon, text) => ({ type, icon, text });
const style = (id, axis, text, [leftIcon, left], [rightIcon, right]) => ({
  id,
  kind: "style",
  part: "style",
  axis,
  text,
  icons: [leftIcon, rightIcon],
  left,
  right,
});

export const QUESTIONS = [
  // ---- Part 1: how often (0–4 each). The dream is the question. ----
  frequency("n1", "nightmare", "🏃", [
    "追いかけられる夢",
    "쫓기는 꿈",
    "被追赶的梦",
    "Being chased",
  ]),
  frequency("n2", "nightmare", "⛓️", [
    "体が動かない夢",
    "몸이 안 움직이는 꿈",
    "身体动不了的梦",
    "Being unable to move",
  ]),
  frequency("n3", "nightmare", "😨", [
    "起きても怖い夢",
    "깨도 무서운 꿈",
    "醒来还害怕的梦",
    "Still scared after waking",
  ]),
  frequency("p1", "premonition", "🎬", [
    "あとで本当に起きる夢",
    "나중에 정말 일어나는 꿈",
    "后来真的发生的梦",
    "A dream that later comes true",
  ]),
  frequency("p2", "premonition", "📯", [
    "お知らせのような夢",
    "신호 같은 꿈",
    "像是预兆的梦",
    "A dream that feels like a sign",
  ]),
  frequency("p3", "premonition", "🔮", [
    "出てきた物が気になる夢",
    "나온 물건이 신경 쓰이는 꿈",
    "梦里的东西让人在意",
    "An object you can't forget",
  ]),
  frequency("l1", "lucid", "💡", [
    "「夢だ」と気づく夢",
    "꿈인 걸 알아차리는 꿈",
    "意识到在做梦",
    "Knowing you're dreaming",
  ]),
  frequency("l2", "lucid", "🕊️", [
    "思いどおりに動ける夢",
    "마음대로 움직이는 꿈",
    "随心所欲的梦",
    "Steering the dream yourself",
  ]),
  frequency("l3", "lucid", "🎞️", [
    "映画のように眺める夢",
    "영화처럼 바라보는 꿈",
    "像看电影一样的梦",
    "Watching it like a movie",
  ]),
  frequency("r1", "recurring", "🏠", [
    "同じ場所や人が出る夢",
    "같은 장소나 사람이 나오는 꿈",
    "同一个地方或人出现",
    "The same place or person again",
  ]),
  frequency("r2", "recurring", "📖", [
    "前の夢の続き",
    "지난 꿈의 이어짐",
    "上次梦的后续",
    "Picking up where it left off",
  ]),
  frequency("r3", "recurring", "🌫️", [
    "いつも同じ気分で目覚める",
    "늘 같은 기분으로 깨는 꿈",
    "醒来总是同样的心情",
    "Waking with the same feeling",
  ]),
  // ---- Part 2: scene picks (index of the chosen option) ----
  scene(
    "sn",
    "nightmare",
    [
      "怖い夢といえば？",
      "무서운 꿈이라면?",
      "说到可怕的梦？",
      "Your kind of scary dream?",
    ],
    [
      option("chase", "🏃", ["追われる", "쫓긴다", "被追", "Chased"]),
      option("loss", "🔍", [
        "なくして探す",
        "잃고 찾는다",
        "丢了在找",
        "Lost, searching",
      ]),
      option("bound", "🪨", [
        "動けない",
        "못 움직인다",
        "动不了",
        "Can't move",
      ]),
      option("collapse", "🏚️", [
        "崩れていく",
        "무너진다",
        "崩塌",
        "Falling apart",
      ]),
    ],
  ),
  scene(
    "sp",
    "premonition",
    [
      "夢のお知らせは、どんな形？",
      "꿈의 신호는 어떤 모습?",
      "梦的预兆是什么样？",
      "How does a dream's sign come?",
    ],
    [
      option("future", "🎬", [
        "本当に起きる",
        "실제로 일어난다",
        "真的发生",
        "It comes true",
      ]),
      option("intuition", "💓", [
        "胸さわぎ",
        "불길한 예감",
        "心神不宁",
        "A bad feeling",
      ]),
      option("symbol", "🐚", [
        "意味ありげな物",
        "의미심장한 것",
        "神秘的象征",
        "A symbol",
      ]),
      option("deja", "🔁", [
        "前にも見た",
        "전에도 봤다",
        "以前见过",
        "Seen it before",
      ]),
    ],
  ),
  scene(
    "sl",
    "lucid",
    [
      "「夢だ」と気づいたら？",
      "꿈인 걸 알아차리면?",
      "发现在做梦时？",
      "When you know it's a dream?",
    ],
    [
      option("lucid", "🕊️", [
        "自由に飛ぶ",
        "자유롭게 난다",
        "自由飞翔",
        "Fly freely",
      ]),
      option("aware", "🫧", [
        "思うように動けない",
        "뜻대로 안 된다",
        "不听使唤",
        "Can't steer it",
      ]),
      option("observer", "👀", [
        "ただ眺める",
        "그저 바라본다",
        "静静旁观",
        "Just watch",
      ]),
      option("challenge", "⚔️", [
        "立ち向かう",
        "맞선다",
        "迎难而上",
        "Face it",
      ]),
    ],
  ),
  scene(
    "sr",
    "recurring",
    [
      "夢でくり返すのは？",
      "꿈에서 반복되는 건?",
      "梦里反复出现的是？",
      "What keeps coming back?",
    ],
    [
      option("place", "🏠", ["場所", "장소", "地点", "A place"]),
      option("person", "👤", ["人", "사람", "人物", "A person"]),
      option("story", "📖", ["ストーリー", "이야기", "情节", "The story"]),
      option("emotion", "💭", [
        "目覚めの気分",
        "깨어날 때 기분",
        "醒来的心情",
        "The feeling",
      ]),
    ],
  ),
  // ---- Part 3: this or that (-2 … 2, negative = left) ----
  style(
    "m1",
    "motion",
    [
      "夢でピンチ！どうする？",
      "꿈에서 위기! 어떻게 해?",
      "梦里遇到危机！怎么办？",
      "Trouble in a dream! You…",
    ],
    ["🏃", ["とにかく動く", "일단 움직인다", "先行动", "Move"]],
    ["🧊", ["固まって見る", "굳어서 본다", "僵住旁观", "Freeze and watch"]],
  ),
  style(
    "m2",
    "motion",
    [
      "夢の中の自分は？",
      "꿈속의 나는?",
      "梦里的自己是？",
      "In your dreams, you are…",
    ],
    ["🦸", ["主人公", "주인공", "主角", "The lead"]],
    ["🎥", ["見ている人", "지켜보는 사람", "旁观者", "The onlooker"]],
  ),
  style(
    "f1",
    "focus",
    [
      "強く残るのは？",
      "강하게 남는 건?",
      "印象最深的是？",
      "What stays with you?",
    ],
    ["🌍", ["起きた出来事", "일어난 일", "发生的事", "What happened"]],
    ["💗", ["自分の気持ち", "내 마음", "自己的心情", "How I felt"]],
  ),
  style(
    "f2",
    "focus",
    [
      "起きて最初に思い出すのは？",
      "깨서 먼저 떠오르는 건?",
      "醒来先想起的是？",
      "On waking, you recall…",
    ],
    ["🧭", ["誰と・どこで", "누구와·어디서", "和谁、在哪", "Who and where"]],
    ["🫀", ["体の感覚", "몸의 감각", "身体的感觉", "A bodily feeling"]],
  ),
  style(
    "k1",
    "texture",
    [
      "思い出す夢は？",
      "떠오르는 꿈은?",
      "回想起的梦是？",
      "The dreams you recall are…",
    ],
    ["📷", ["くっきり場面", "또렷한 장면", "清晰的画面", "Sharp scenes"]],
    ["☁️", ["ふんわり空気", "흐릿한 분위기", "朦胧的氛围", "A hazy mood"]],
  ),
  style(
    "k2",
    "texture",
    [
      "夢の意味を考えるなら？",
      "꿈의 의미를 생각한다면?",
      "思考梦的含义时？",
      "Making sense of a dream?",
    ],
    ["🧩", ["出来事と結ぶ", "사건과 연결", "联系现实", "Link it to events"]],
    [
      "🎨",
      ["イメージで味わう", "이미지로 느낀다", "品味意象", "Savor the images"],
    ],
  ),
  style(
    "t1",
    "direction",
    [
      "夢が教えてくれるのは？",
      "꿈이 알려주는 건?",
      "梦告诉你的是？",
      "A dream tells you about…",
    ],
    ["🌅", ["これから", "앞으로", "将来", "What's ahead"]],
    ["🕰️", ["過去のこと", "지난 일", "过去", "What's past"]],
  ),
  style(
    "t2",
    "direction",
    [
      "気になる夢の景色は？",
      "신경 쓰이는 꿈의 풍경은?",
      "让你在意的梦境是？",
      "The dream scenery that stays?",
    ],
    ["✨", ["初めて見る", "처음 본다", "初次见到", "Brand new"]],
    ["🌙", ["なつかしい", "그립다", "似曾相识", "Familiar"]],
  ),
];
export const questionById = (id) => QUESTIONS.find((q) => q.id === id);
export const partOf = (question) => PARTS.find((p) => p.id === question.part);

// The answer values a question accepts, in display order.
export function answerValues(question) {
  if (question.kind === "frequency") return [0, 1, 2, 3, 4];
  if (question.kind === "scene") return question.options.map((_, i) => i);
  return [-2, -1, 0, 1, 2];
}
export const validAnswer = (question, value) =>
  Number.isInteger(value) && answerValues(question).includes(value);
// Version 1 stored 16 answers in {0,1,2}; version 2 stores one answer per QUESTIONS entry.
export function quizVersion(answers) {
  if (!Array.isArray(answers)) return null;
  if (
    answers.length === QUESTIONS.length &&
    answers.every((v, i) => validAnswer(QUESTIONS[i], v))
  )
    return 2;
  if (answers.length === 16 && answers.every((v) => [0, 1, 2].includes(v)))
    return 1;
  return null;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const round = (v) => Math.round(v * 10) / 10;

// Group scales (0–1) and style axes (-1 … 1) from a version-2 answer sheet.
export function profileOf(answers) {
  const groups = Object.fromEntries(
    GROUPS.map((g) => [g.id, { sum: 0, max: 0 }]),
  );
  const axes = Object.fromEntries(AXES.map((a) => [a.id, { sum: 0, max: 0 }]));
  const scenes = {};
  QUESTIONS.forEach((q, i) => {
    const v = answers[i];
    if (q.kind === "frequency") {
      groups[q.group].sum += v;
      groups[q.group].max += 4;
    } else if (q.kind === "style") {
      axes[q.axis].sum += v;
      axes[q.axis].max += 2;
    } else scenes[q.group] = q.options[v].type;
  });
  return {
    groups: Object.fromEntries(
      GROUPS.map((g) => [g.id, clamp01(groups[g.id].sum / groups[g.id].max)]),
    ),
    axes: Object.fromEntries(
      AXES.map((a) => [a.id, axes[a.id].sum / axes[a.id].max]),
    ),
    scenes,
  };
}

// How well a type's pole pattern matches the measured axes: -1 … 1.
export function styleFit(typeId, axes) {
  const type = typeById(typeId);
  const ids = GROUP_AXES[type.group];
  const poles = TYPE_POLES[typeId];
  return (
    ids.reduce((sum, axis, i) => sum + poles[i] * (axes[axis] || 0), 0) /
    ids.length
  );
}

function quizScores(answers) {
  const profile = profileOf(answers);
  const scores = {};
  for (const type of TYPES)
    scores[type.id] =
      GROUP_WEIGHT * profile.groups[type.group] +
      (STYLE_WEIGHT * (styleFit(type.id, profile.axes) + 1)) / 2 +
      (profile.scenes[type.group] === type.id ? SCENE_WEIGHT : 0);
  return { profile, scores };
}
function legacyScores(answers) {
  const scores = {};
  TYPES.forEach((type, i) => {
    scores[type.id] = answers[i] * 25;
  });
  const groups = {};
  for (const g of GROUPS) {
    const own = TYPES.filter((t) => t.group === g.id);
    groups[g.id] =
      own.reduce((s, t) => s + scores[t.id], 0) / (own.length * 50);
  }
  return { profile: { groups, axes: null, scenes: {} }, scores };
}

// One vote per tag per record, at most DREAM_WINDOW recent dream records. Diaries never vote.
export function dreamVotes(dreams = []) {
  const votes = Object.fromEntries(TYPES.map((t) => [t.id, 0]));
  [...dreams]
    .filter((d) => d && d.kind !== "diary")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, DREAM_WINDOW)
    .forEach((d) => {
      for (const id of new Set(d.typeTags || []))
        if (id in votes) votes[id] += 1;
    });
  return votes;
}

function compare(scores) {
  return (a, b) =>
    scores[b] - scores[a] ||
    TIE_GROUP_ORDER.indexOf(typeById(a).group) -
      TIE_GROUP_ORDER.indexOf(typeById(b).group) ||
    TYPES.findIndex((t) => t.id === a) - TYPES.findIndex((t) => t.id === b);
}

export function classify(answers, dreams = []) {
  const version = quizVersion(answers);
  if (!version) throw new Error("Incomplete questionnaire");
  const { profile, scores: quiz } =
    version === 2 ? quizScores(answers) : legacyScores(answers);
  const votes = dreamVotes(dreams);
  const scores = Object.fromEntries(
    TYPES.map((t) => [t.id, quiz[t.id] + votes[t.id] * DREAM_VOTE]),
  );
  const ranked = TYPES.map((t) => t.id).sort(compare(scores));
  const id = ranked[0],
    type = typeById(id),
    runnerUp = ranked[1];
  const groupRank = GROUPS.map((g) => g.id).sort(
    (a, b) => profile.groups[b] - profile.groups[a],
  );
  const provisional =
    version === 2
      ? Object.values(profile.groups).every((v) => v === 0)
      : Math.max(...Object.values(quiz)) === 0;
  return {
    id,
    version,
    scores: TYPES.map((t) => ({ id: t.id, score: round(scores[t.id]) })),
    ranked,
    tied: round(scores[id]) === round(scores[runnerUp]),
    provisional,
    groups: GROUPS.map((g) => ({
      id: g.id,
      percent: Math.round(profile.groups[g.id] * 100),
      rank: groupRank.indexOf(g.id) + 1,
    })),
    axes: profile.axes,
    evidence: {
      group: {
        id: type.group,
        percent: Math.round(profile.groups[type.group] * 100),
        rank: groupRank.indexOf(type.group) + 1,
      },
      axes: profile.axes
        ? GROUP_AXES[type.group].map((axis, i) => ({
            axis,
            value: profile.axes[axis],
            pole: TYPE_POLES[id][i] < 0 ? 0 : 1,
            match: profile.axes[axis] * TYPE_POLES[id][i] > 0,
          }))
        : [],
      scene: profile.scenes[type.group]
        ? {
            type: profile.scenes[type.group],
            match: profile.scenes[type.group] === id,
          }
        : null,
      dreams: votes[id],
    },
    runnerUp: { id: runnerUp, score: round(scores[runnerUp]) },
  };
}
