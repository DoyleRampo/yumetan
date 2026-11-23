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
  ["まったくない", "전혀 없어요", "从来没有", "Never"],
  ["年に数回", "1년에 몇 번", "一年几次", "A few per year"],
  ["月に1〜2回", "한 달에 1~2번", "每月一两次", "1–2×/month"],
  ["週に1回", "주 1번", "每周一次", "Weekly"],
  ["週に数回", "주 몇 번", "每周几次", "Several per week"],
];
// Bipolar answers run -2 … 2; the label describes how strongly the pole applies.
export const SCALE_STRENGTH = [
  ["かなり", "많이", "非常", "Strongly"],
  ["やや", "조금", "有点", "Slightly"],
  ["どちらとも", "중간", "中间", "Neutral"],
  ["やや", "조금", "有点", "Slightly"],
  ["かなり", "많이", "非常", "Strongly"],
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

const frequency = (id, group, text) => ({
  id,
  kind: "frequency",
  part: "frequency",
  group,
  text,
});
const scene = (id, group, text, options) => ({
  id,
  kind: "scene",
  part: "scene",
  group,
  text,
  options, // [{ type, text }]
});
const style = (id, axis, text, left, right) => ({
  id,
  kind: "style",
  part: "style",
  axis,
  text,
  left,
  right,
});

export const QUESTIONS = [
  // ---- Part 1: group scales (0–4 each) ----
  frequency("n1", "nightmare", [
    "追いかけられて逃げる",
    "쫓겨서 달아나요",
    "被追赶，一直逃跑",
    "Running from someone",
  ]),
  frequency("n2", "nightmare", [
    "動けない、逃げられない、大切なものを失う",
    "움직이거나 달아날 수 없거나 소중한 걸 잃어요",
    "动不了、逃不掉，或失去重要的东西",
    "Unable to move or escape, or losing something dear",
  ]),
  frequency("n3", "nightmare", [
    "起きても怖さが残る",
    "깨고 나서도 무서워요",
    "醒来以后还觉得害怕",
    "Still scared after waking",
  ]),
  frequency("p1", "premonition", [
    "あとで夢と同じことが起きた気がする",
    "나중에 꿈과 같은 일이 일어난 것 같아요",
    "后来好像遇到了梦里的事",
    "Later, something seems to happen just as in the dream",
  ]),
  frequency("p2", "premonition", [
    "起きて「何かの知らせかも」と思う",
    "깨고 나서 무슨 신호 같다고 느껴요",
    "醒来后觉得梦在给自己提示",
    "Waking up feeling the dream was a sign",
  ]),
  frequency("p3", "premonition", [
    "夢に出た物が妙に気になる",
    "꿈에 나온 물건이 유독 마음에 걸려요",
    "梦里的一样东西总让你在意",
    "An object from the dream sticks in your mind",
  ]),
  frequency("l1", "lucid", [
    "夢の途中で「夢だ」と気づく",
    "꿈을 꾸다가 꿈인 걸 알아요",
    "做梦时意识到自己在做梦",
    "Realizing you're dreaming",
  ]),
  frequency("l2", "lucid", [
    "夢だと気づいて、飛んだり場面を変えたりする",
    "꿈인 걸 알고 날거나 장면을 바꿔요",
    "发现自己在做梦后飞起来或改变场景",
    "Knowing it's a dream and flying or changing the scene",
  ]),
  frequency("l3", "lucid", [
    "映画みたいに、離れて見る",
    "영화처럼 멀리서 봐요",
    "像看电影一样，从旁边看",
    "Watching from a distance, like a movie",
  ]),
  frequency("r1", "recurring", [
    "同じ場所や人がまた出てくる",
    "같은 장소나 사람이 또 나와요",
    "又梦到了同一个地方或同一个人",
    "The same place or person returns",
  ]),
  frequency("r2", "recurring", [
    "別の夜にも同じ話が進む",
    "다른 날에도 같은 이야기가 이어져요",
    "不同的夜晚，梦里却是同样的故事",
    "The same story plays out on different nights",
  ]),
  frequency("r3", "recurring", [
    "起きるといつも似た気持ち",
    "깨면 늘 비슷한 기분이에요",
    "醒来时总是有相似的感受",
    "Waking up with a familiar feeling",
  ]),
  // ---- Part 2: scene picks (index of the chosen option) ----
  scene(
    "sn",
    "nightmare",
    [
      "怖い夢で、どれが近い？",
      "무서운 꿈에서 뭐가 가장 가까워요?",
      "可怕的梦里，哪一幕最接近？",
      "In a scary dream, what feels closest?",
    ],
    [
      {
        type: "chase",
        text: [
          "追いかけられて、必死に走っている",
          "쫓겨서 필사적으로 달린다",
          "被追赶，拼命奔跑",
          "I am chased and run for my life",
        ],
      },
      {
        type: "loss",
        text: [
          "大切な人や物を失って、探し回っている",
          "소중한 사람이나 물건을 잃고 찾아 헤맨다",
          "失去重要的人或东西，四处寻找",
          "I lose someone or something dear and search everywhere",
        ],
      },
      {
        type: "bound",
        text: [
          "動きたいのに、体が動かない・声が出ない",
          "움직이고 싶은데 몸이 안 움직이거나 목소리가 안 나온다",
          "想动却动不了、发不出声音",
          "I want to move, but my body or voice will not respond",
        ],
      },
      {
        type: "collapse",
        text: [
          "建物や地面、自分の体が崩れていく",
          "건물이나 땅, 내 몸이 무너져 간다",
          "建筑、地面或自己的身体崩塌",
          "Buildings, the ground, or my own body fall apart",
        ],
      },
    ],
  ),
  scene(
    "sp",
    "premonition",
    [
      "夢が何かを知らせるとしたら？",
      "꿈이 무언가를 알려준다면?",
      "如果梦像是在提醒你什么？",
      "If a dream feels like a sign, what is it like?",
    ],
    [
      {
        type: "future",
        text: [
          "具体的な出来事や場面が、あとで本当に起きる",
          "구체적인 사건이나 장면이 나중에 실제로 일어난다",
          "具体的事情或场景后来真的发生",
          "A concrete event or scene later really happens",
        ],
      },
      {
        type: "intuition",
        text: [
          "理由はないのに、嫌な予感や胸騒ぎだけが残る",
          "이유는 없는데 불길한 예감이나 두근거림만 남는다",
          "说不出原因，只留下不祥的预感或心悸",
          "An uneasy feeling lingers, with no clear reason",
        ],
      },
      {
        type: "symbol",
        text: [
          "動物や水、光など、意味ありげなものが出てくる",
          "동물·물·빛 등 의미심장한 것이 나온다",
          "出现动物、水、光等意味深长的东西",
          "Meaningful things appear, like animals, water, or light",
        ],
      },
      {
        type: "deja",
        text: [
          "「この場面、前にも見た」という強い既視感がある",
          "'이 장면, 전에도 봤어'라는 강한 기시감이 든다",
          "有“这个场景以前见过”的强烈既视感",
          "A strong sense that I have seen this scene before",
        ],
      },
    ],
  ),
  scene(
    "sl",
    "lucid",
    [
      "「夢だ」と気づいたら？",
      "꿈인 걸 알아차리면?",
      "发现自己在做梦时？",
      "When you realize it's a dream?",
    ],
    [
      {
        type: "lucid",
        text: [
          "飛んだり場面を変えたり、自由に動き回る",
          "날거나 장면을 바꾸며 자유롭게 돌아다닌다",
          "飞行、切换场景，自由行动",
          "I fly, change the scene, and move freely",
        ],
      },
      {
        type: "aware",
        text: [
          "気づいてはいるけれど、思うように体が動かない",
          "알아차리긴 했지만 몸이 뜻대로 움직이지 않는다",
          "虽然意识到了，身体却不听使唤",
          "I know it, but my body will not do what I want",
        ],
      },
      {
        type: "observer",
        text: [
          "自分を外から眺めるように、ただ見ている",
          "나 자신을 밖에서 보듯 그저 바라본다",
          "像从外面看着自己一样，只是旁观",
          "I simply watch, as if looking at myself from outside",
        ],
      },
      {
        type: "challenge",
        text: [
          "目の前の相手や課題に、そのまま挑み続ける",
          "눈앞의 상대나 과제에 그대로 계속 도전한다",
          "继续挑战眼前的对手或课题",
          "I keep taking on whatever is in front of me",
        ],
      },
    ],
  ),
  scene(
    "sr",
    "recurring",
    [
      "夢で何が繰り返される？",
      "꿈에서 뭐가 반복돼요?",
      "梦里什么会反复出现？",
      "What repeats in your dreams?",
    ],
    [
      {
        type: "place",
        text: [
          "舞台になる場所（実家・学校・知らない街など）",
          "무대가 되는 장소(본가·학교·낯선 거리 등)",
          "作为舞台的地点（老家、学校、陌生的街道等）",
          "The setting, such as a childhood home, school, or an unknown town",
        ],
      },
      {
        type: "person",
        text: [
          "登場する人（家族・昔の恋人・知らない誰か）",
          "등장하는 사람(가족·옛 연인·낯선 누군가)",
          "出场的人（家人、旧情人、陌生人）",
          "The people, such as family, an old love, or a stranger",
        ],
      },
      {
        type: "story",
        text: [
          "ストーリーの流れや結末",
          "이야기의 흐름이나 결말",
          "故事的走向或结局",
          "The way the story unfolds or ends",
        ],
      },
      {
        type: "emotion",
        text: [
          "目覚めたときの気持ち",
          "깨어났을 때의 기분",
          "醒来时的心情",
          "The feeling I wake up with",
        ],
      },
    ],
  ),
  // ---- Part 3: style axes (-2 … 2, negative = left pole) ----
  style(
    "m1",
    "motion",
    [
      "夢でピンチになったら？",
      "꿈에서 곤란한 일이 생기면?",
      "梦里遇到麻烦时？",
      "When things go wrong in a dream?",
    ],
    [
      "走る・戦う・探すなど、とにかく動く",
      "달리거나 싸우거나 찾는 등 일단 움직인다",
      "奔跑、战斗、寻找，总之先行动",
      "I run, fight, or search: I move",
    ],
    [
      "体が固まる・ただ見ている",
      "몸이 굳거나 그저 바라본다",
      "身体僵住，只是看着",
      "I freeze, or just watch",
    ],
  ),
  style(
    "m2",
    "motion",
    [
      "夢の中の自分は？",
      "꿈속의 나는?",
      "梦里的自己是？",
      "What are you like in dreams?",
    ],
    [
      "自分から働きかける主人公",
      "스스로 움직이는 주인공",
      "主动出击的主角",
      "the lead who makes things happen",
    ],
    [
      "起きることを受け止める語り手",
      "일어나는 일을 받아들이는 화자",
      "接受发生之事的叙述者",
      "the narrator who takes in what happens",
    ],
  ),
  style(
    "f1",
    "focus",
    [
      "夢で強く印象に残るのは？",
      "꿈에서 가장 인상에 남는 건?",
      "梦里最难忘的是什么？",
      "What stands out in a dream?",
    ],
    [
      "相手・場所・出来事など、まわりで起きること",
      "상대·장소·사건 등 주변에서 일어나는 일",
      "对方、地点、事件等周围发生的事",
      "what happened around me: people, places, events",
    ],
    [
      "自分の体の感覚や心の動き",
      "내 몸의 감각이나 마음의 움직임",
      "自己身体的感觉或内心的波动",
      "how my body and heart felt",
    ],
  ),
  style(
    "f2",
    "focus",
    [
      "起きて最初に思い出すのは？",
      "깨고 나서 가장 먼저 떠오르는 건?",
      "醒来后先想起什么？",
      "What do you remember first on waking?",
    ],
    ["何が起きたか", "무슨 일이 있었는지", "发生了什么", "what happened"],
    [
      "自分がどう感じたか",
      "내가 어떻게 느꼈는지",
      "自己感受到了什么",
      "how I felt",
    ],
  ),
  style(
    "k1",
    "texture",
    [
      "夢を思い出すと？",
      "꿈을 떠올리면?",
      "回想起梦时？",
      "When you remember a dream?",
    ],
    [
      "場面や出来事をはっきり覚えている",
      "장면이나 사건을 또렷이 기억한다",
      "清楚记得场景和事件",
      "clear scenes and events",
    ],
    [
      "雰囲気や気配だけが残る",
      "분위기나 기운만 남는다",
      "只留下氛围和气息",
      "a mood or an atmosphere",
    ],
  ),
  style(
    "k2",
    "texture",
    [
      "夢の意味を考えるときは？",
      "꿈의 의미를 생각할 때는?",
      "想到梦的含义时？",
      "When you think about what the dream meant?",
    ],
    [
      "具体的な出来事と結びつける",
      "구체적인 사건과 연결한다",
      "与具体的事情联系起来",
      "I tie it to concrete events",
    ],
    [
      "イメージや感覚として味わう",
      "이미지나 감각으로 음미한다",
      "当作意象和感觉去体会",
      "I take it in as images and feelings",
    ],
  ),
  style(
    "t1",
    "direction",
    [
      "夢が知らせてくれるとしたら？",
      "꿈이 무언가를 알려준다면?",
      "如果梦在提醒你什么？",
      "If a dream is telling you something?",
    ],
    [
      "これから起こること",
      "앞으로 일어날 일",
      "将要发生的事",
      "what is coming",
    ],
    [
      "すでに知っている・過去の何か",
      "이미 알고 있는 것·과거의 무언가",
      "已经知道的、过去的事",
      "what I already know or have lived",
    ],
  ),
  style(
    "t2",
    "direction",
    [
      "夢が気になるのはどんなとき？",
      "어떤 꿈이 신경 쓰여요?",
      "什么时候一个梦会让你在意？",
      "What makes you wonder about a dream?",
    ],
    [
      "はじめて見るものが多い",
      "처음 보는 것이 많다",
      "多是第一次见到的",
      "mostly new to me",
    ],
    [
      "どこかで見た・懐かしいものが多い",
      "어디선가 본·그리운 것이 많다",
      "多是似曾相识、令人怀念的",
      "mostly familiar, from somewhere in my life",
    ],
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
