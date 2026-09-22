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
  ["年に数回", "1년에 몇 번", "一年几次", "A few times a year"],
  ["月に1〜2回", "한 달에 1~2번", "每月一两次", "Once or twice a month"],
  ["週に1回くらい", "일주일에 1번 정도", "每周一次左右", "About once a week"],
  ["週に何度も", "일주일에 여러 번", "每周好几次", "Several times a week"],
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
    "誰かや何かに追われたり、襲われたりして逃げる夢",
    "누군가 혹은 무언가에게 쫓기거나 습격당해 도망치는 꿈",
    "被人或某种东西追赶、袭击而逃跑的梦",
    "Dreams of being chased or attacked and running away",
  ]),
  frequency("n2", "nightmare", [
    "動けない・逃げられない・大切なものを失うなど、どうにもできない夢",
    "움직일 수 없거나 도망칠 수 없거나, 소중한 것을 잃는 등 어찌할 수 없는 꿈",
    "动不了、逃不掉、失去重要的东西等无能为力的梦",
    "Dreams where you cannot move, escape, or hold on to what matters",
  ]),
  frequency("n3", "nightmare", [
    "目が覚めたあとも、怖さや不安がしばらく残る夢",
    "깨어난 뒤에도 무서움이나 불안이 한동안 남는 꿈",
    "醒来之后恐惧或不安仍会持续一阵的梦",
    "Dreams that leave fear or unease after you wake up",
  ]),
  frequency("p1", "premonition", [
    "夢で見た場面や出来事が、あとで現実と重なったと感じること",
    "꿈에서 본 장면이나 사건이 나중에 현실과 겹쳤다고 느끼는 일",
    "觉得梦里的场景或事情后来与现实重合",
    "Feeling that a scene or event from a dream later overlapped with real life",
  ]),
  frequency("p2", "premonition", [
    "夢のあとで「何かを知らせている気がする」と感じること",
    "꿈을 꾼 뒤 '무언가를 알려주는 것 같다'고 느끼는 일",
    "做梦之后觉得“它在告诉我什么”",
    "Waking with the feeling that a dream was telling you something",
  ]),
  frequency("p3", "premonition", [
    "夢に出てきた動物・水・光・場所などが、意味を持っている気がすること",
    "꿈에 나온 동물·물·빛·장소 등이 의미를 지닌 것처럼 느끼는 일",
    "觉得梦里出现的动物、水、光、地点等有着某种含义",
    "Sensing that animals, water, light, or places in a dream carry a meaning",
  ]),
  frequency("l1", "lucid", [
    "夢の途中で「これは夢だ」と気づくこと",
    "꿈을 꾸는 도중 '이건 꿈이다'라고 알아차리는 일",
    "在梦中意识到“这是梦”",
    "Realizing “this is a dream” while still dreaming",
  ]),
  frequency("l2", "lucid", [
    "夢だと気づいてから、飛ぶ・場面を変えるなど夢に働きかけること",
    "꿈인 걸 알아차린 뒤 날거나 장면을 바꾸는 등 꿈에 개입하는 일",
    "意识到在做梦后，飞行、切换场景等去影响梦境",
    "Acting on a dream once you know it is one, such as flying or changing the scene",
  ]),
  frequency("l3", "lucid", [
    "映画を観るように、少し離れたところから夢を眺めていること",
    "영화를 보듯 조금 떨어진 곳에서 꿈을 바라보는 일",
    "像看电影一样，从稍远的地方观看自己的梦",
    "Watching a dream from a little distance, like a film",
  ]),
  frequency("r1", "recurring", [
    "同じ場所や同じ人が、何度も夢に出てくること",
    "같은 장소나 같은 사람이 꿈에 몇 번이고 나오는 일",
    "同一个地方或同一个人反复出现在梦里",
    "The same place or the same person returning in your dreams",
  ]),
  frequency("r2", "recurring", [
    "内容は違っても、同じ展開や同じ結末になる夢",
    "내용은 달라도 같은 전개나 같은 결말로 이어지는 꿈",
    "内容不同，却总是同样的发展或结局的梦",
    "Dreams that follow the same course or ending even when the details differ",
  ]),
  frequency("r3", "recurring", [
    "目覚めたときの気持ちが、いつも似ていること",
    "깨어났을 때의 기분이 늘 비슷한 일",
    "醒来时的心情总是很相似",
    "Waking up with much the same feeling, dream after dream",
  ]),
  // ---- Part 2: scene picks (index of the chosen option) ----
  scene(
    "sn",
    "nightmare",
    [
      "怖い夢の中で、いちばんよく起きるのは？",
      "무서운 꿈에서 가장 자주 일어나는 일은?",
      "在可怕的梦里，最常发生的是？",
      "In a frightening dream, what happens most often?",
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
      "夢が「何かを知らせている」と感じるとき、それはどんなかたち？",
      "꿈이 '무언가를 알려준다'고 느낄 때, 어떤 모습인가요?",
      "当你觉得梦“在告诉你什么”时，它是怎样的？",
      "When a dream seems to be telling you something, what form does it take?",
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
      "夢の中で「これは夢かも」と感じたとき、あなたは？",
      "꿈속에서 '이건 꿈일지도'라고 느꼈을 때, 당신은?",
      "在梦里觉得“这可能是梦”时，你会？",
      "When you sense “this might be a dream,” what do you do?",
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
      "あなたの夢で、いちばん「繰り返す」ものは？",
      "당신의 꿈에서 가장 '반복되는' 것은?",
      "你的梦里，最常“重复”的是什么？",
      "What repeats most in your dreams?",
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
      "夢の中で怖いことや困ったことが起きたとき",
      "꿈에서 무섭거나 곤란한 일이 생겼을 때",
      "梦里发生可怕或棘手的事时",
      "When something frightening or difficult happens in a dream",
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
    ["夢の中の自分は", "꿈속의 나는", "梦里的自己是", "In the dream, I am"],
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
      "夢で印象に残るのは",
      "꿈에서 인상에 남는 것은",
      "梦里印象最深的是",
      "What stays with me from a dream is",
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
      "目覚めて最初に思い出すのは",
      "깨어나서 가장 먼저 떠오르는 것은",
      "醒来最先想起的是",
      "The first thing I recall on waking is",
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
      "夢の残り方は",
      "꿈이 남는 방식은",
      "梦留下的方式是",
      "A dream stays with me as",
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
      "夢の意味を考えるとき",
      "꿈의 의미를 생각할 때",
      "思考梦的含义时",
      "When I think about what a dream means",
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
      "夢が「知らせている」と感じるとき、それは",
      "꿈이 '알려준다'고 느낄 때, 그것은",
      "当觉得梦“在提示”时，它关于",
      "When a dream seems to be telling me something, it is about",
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
      "夢に出てくる場所や人は",
      "꿈에 나오는 장소나 사람은",
      "梦里出现的地点和人",
      "The places and people in my dreams are",
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
