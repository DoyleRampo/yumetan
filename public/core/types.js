// Stable IDs are persisted. Labels and questions can change without invalidating records.
export const GROUPS = [
  {
    id: "nightmare",
    color: "#e7a8aa",
    names: ["悪夢タイプ", "악몽 유형", "噩梦类型", "Nightmare"],
    desc: [
      "恐怖や不安が夢に出やすい。心が「守り」に入っているサイン。",
      "공포나 불안이 꿈에 자주 나타나요. 마음이 '방어 모드'에 들어갔다는 신호.",
      "恐惧与不安容易出现在梦里，是内心进入“防御模式”的信号。",
      "Fear and unease surface in dreams: a sign the mind is in a protective mode.",
    ],
  },
  {
    id: "premonition",
    color: "#c4b0ed",
    names: ["予知タイプ", "예감 유형", "预感类型", "Premonition"],
    desc: [
      "夢が「先のこと」や「気づいていない何か」を知らせてくる気がする。直感が働く。",
      "꿈이 '앞일'이나 '아직 눈치채지 못한 무언가'를 알려주는 것 같아요. 직감이 예리한 편.",
      "梦似乎在提示“将来的事”或“尚未察觉的事”，直觉敏锐。",
      "Dreams seem to point at what is coming or what you have not noticed yet. Intuition at work.",
    ],
  },
  {
    id: "lucid",
    color: "#a5d8d1",
    names: ["明晰タイプ", "자각몽 유형", "清醒梦类型", "Lucid"],
    desc: [
      "夢の中で「これは夢だ」と気づける。自分を少し外から見る力がある。",
      "꿈속에서 '이건 꿈이다'라고 알아차릴 수 있어요. 자신을 조금 떨어져 보는 힘이 있어요.",
      "能在梦中意识到“这是梦”，有从外部审视自己的能力。",
      "You can notice you are dreaming. You are able to look at yourself from a little distance.",
    ],
  },
  {
    id: "recurring",
    color: "#ebca8a",
    names: ["反復タイプ", "반복 유형", "重复类型", "Recurring"],
    desc: [
      "同じ場所・人・展開・感情が繰り返す。心が何度も戻りたがるテーマがある。",
      "같은 장소·사람·전개·감정이 반복돼요. 마음이 자꾸 돌아가고 싶어 하는 주제가 있어요.",
      "同样的地点、人物、情节或情绪反复出现。内心有一个总想回去的主题。",
      "The same place, person, story, or feeling keeps returning. There is a theme your mind keeps revisiting.",
    ],
  },
];
const rows = [
  [
    "chase",
    "↗",
    ["追跡系", "추적형", "追逐型", "The Runner"],
    [
      "追いかけられて逃げる",
      "쫓겨서 달아나요",
      "被追赶，一直逃跑",
      "Running from someone",
    ],
    ["追われ", "追いかけ", "chased", "chasing", "쫓", "追赶", "追逐"],
  ],
  [
    "loss",
    "♡",
    ["喪失系", "상실형", "失落型", "The Keeper"],
    [
      "大切な人や物をなくす",
      "소중한 사람이나 물건을 잃어요",
      "失去重要的人或东西",
      "Losing someone or something dear",
    ],
    ["失う", "失った", "lose", "lost someone", "잃", "失去"],
  ],
  [
    "bound",
    "∞",
    ["拘束系", "속박형", "束缚型", "The Still One"],
    [
      "動きたいのに体が動かない",
      "움직이고 싶은데 몸이 안 움직여요",
      "想动，身体却动不了",
      "Trying to move, but your body won't",
    ],
    [
      "動けない",
      "動かな",
      "金縛り",
      "cannot move",
      "can't move",
      "paralysis",
      "움직이지",
      "가위눌",
      "动不了",
      "无法动",
    ],
  ],
  [
    "collapse",
    "◇",
    ["崩壊系", "붕괴형", "崩塌型", "The Rebuilder"],
    [
      "建物や地面が崩れていく",
      "건물이나 땅이 무너져요",
      "房屋或地面正在崩塌",
      "Buildings or the ground crumbling",
    ],
    ["崩れ", "崩壊", "collapse", "falling apart", "무너", "崩塌"],
  ],
  [
    "future",
    "✦",
    ["未来暗示系", "미래암시형", "未来暗示型", "The Stargazer"],
    [
      "起きて「これから起きそう」と思う",
      "깨고 나서 꿈속 일이 실제로 일어날 것 같아요",
      "醒来后觉得梦里的事可能会发生",
      "Waking up feeling the dream might come true",
    ],
    ["未来", "予兆", "future", "premonition", "미래", "未来", "预兆"],
  ],
  [
    "intuition",
    "△",
    ["直感警告系", "직감경고형", "直觉警示型", "The Sensor"],
    [
      "何も起きていないのに胸騒ぎがする",
      "아무 일도 없는데 불길한 느낌이 들어요",
      "明明没发生什么，心里却不安",
      "Feeling uneasy before anything happens",
    ],
    ["漠然", "胸騒ぎ", "unease", "unexplained", "막연", "불안", "莫名", "不安"],
  ],
  [
    "symbol",
    "☽",
    ["象徴解釈系", "상징해석형", "象征解读型", "The Decoder"],
    [
      "目覚めても、夢の中の物が妙に気になる",
      "깨어난 뒤에도 꿈속 물건이 유독 마음에 걸려요",
      "醒来后，梦里的一样东西总让你在意",
      "Waking up still wondering about an object in the dream",
    ],
    ["象徴", "シンボル", "symbol", "상징", "象征", "符号"],
  ],
  [
    "deja",
    "◎",
    ["デジャヴ系", "데자뷔형", "既视感型", "The Echo"],
    [
      "初めての場面なのに「前にも見た」と感じる",
      "처음 보는 장면인데 전에 본 것 같아요",
      "眼前的场景是第一次见，却像见过一样",
      "A new scene feels like you've seen it before",
    ],
    [
      "既視感",
      "デジャ",
      "deja",
      "déjà",
      "familiar",
      "데자",
      "본 듯",
      "似曾相识",
    ],
  ],
  [
    "lucid",
    "✧",
    ["明晰夢系", "자각몽형", "清醒梦型", "The Dreamweaver"],
    [
      "「夢だ」と気づいて、空を飛ぶなど展開を変える",
      "꿈인 걸 알고 날아오르는 등 꿈의 흐름을 바꿔요",
      "发现自己在做梦，就试着飞起来或改变情节",
      "Knowing it's a dream and changing what happens",
    ],
    ["自由に", "操れ", "操る", "control my dream", "lucid", "조종", "控制梦"],
  ],
  [
    "aware",
    "◐",
    ["部分自覚系", "부분자각형", "部分自觉型", "The Awakener"],
    [
      "「夢だ」と気づくけど、展開は変えられない",
      "꿈인 건 알지만 꿈의 흐름은 바꾸지 못해요",
      "知道自己在做梦，却改变不了情节",
      "Knowing it's a dream but unable to change it",
    ],
    [
      "夢だと",
      "夢と気づ",
      "aware",
      "know i am dreaming",
      "꿈인",
      "꿈임",
      "意识到在做梦",
    ],
  ],
  [
    "observer",
    "◉",
    ["観察者系", "관찰자형", "观察者型", "The Observer"],
    [
      "映画みたいに、離れたところから自分や場面を見る",
      "영화처럼 나 자신이나 장면을 멀리서 봐요",
      "像看电影一样，从旁边看自己或眼前的场景",
      "Watching yourself or the scene from outside, like a movie",
    ],
    ["眺め", "観察", "watching", "observer", "바라보", "관찰", "旁观", "观察"],
  ],
  [
    "challenge",
    "⚑",
    ["挑戦系", "도전형", "挑战型", "The Challenger"],
    [
      "試合や試験で「やりきるぞ」と挑む",
      "경기나 시험을 끝까지 해내려 해요",
      "参加比赛或考试，努力完成挑战",
      "Taking on a challenge, like a race or an exam",
    ],
    ["挑戦", "挑ん", "challenge", "climb", "도전", "挑战"],
  ],
  [
    "place",
    "⌂",
    ["場所固定系", "장소반복형", "固定地点型", "The Wanderer"],
    [
      "別の夢なのに、同じ場所にいる",
      "다른 꿈인데 같은 장소에 있어요",
      "不同的梦里，总在同一个地方",
      "Different dreams take you to the same place",
    ],
    ["同じ場所", "same place", "같은 장소", "同一个地方", "相同的地方"],
  ],
  [
    "person",
    "♧",
    ["人物固定系", "인물반복형", "固定人物型", "The Companion"],
    [
      "別の夢にも、同じ人が出てくる",
      "다른 꿈에도 같은 사람이 나와요",
      "不同的梦里，总出现同一个人",
      "The same person shows up in different dreams",
    ],
    ["同じ人", "same person", "같은 사람", "同一个人"],
  ],
  [
    "story",
    "⟳",
    ["展開固定系", "전개반복형", "固定情节型", "The Storyteller"],
    [
      "別の日にも、同じ流れで話が進む",
      "다른 날에도 꿈이 같은 순서로 흘러가요",
      "不同的夜晚，梦里的情节却一样",
      "The same story plays out on different nights",
    ],
    [
      "同じ展開",
      "同じストーリー",
      "same story",
      "repeating story",
      "같은 이야기",
      "同一情节",
    ],
  ],
  [
    "emotion",
    "♥",
    ["感情固定系", "감정반복형", "固定情感型", "The Resonator"],
    [
      "夢の内容は違っても、同じ気持ちになる",
      "꿈 내용은 달라도 같은 기분이 들어요",
      "梦的内容不同，感受却一样",
      "Different dreams bring up the same feeling",
    ],
    ["同じ感情", "same emotion", "same feeling", "같은 감정", "同样的情绪"],
  ],
];
// rows: [id, symbol, names, legacy question (v1 quiz, kept for reference), keywords]
export const TYPES = rows.map(([id, symbol, names, , keywords], i) => ({
  id,
  symbol,
  names,
  keywords,
  group: GROUPS[Math.floor(i / 4)].id,
}));
export const LANGUAGES = ["ja", "ko", "zh", "en"];
export const localized = (values, language) =>
  values[LANGUAGES.indexOf(language)] || values[0];
export const typeById = (id) => TYPES.find((t) => t.id === id);
// The questionnaire and the classification live in diagnosis.js.
export function detectTags(text) {
  const lower = String(text).toLocaleLowerCase();
  return TYPES.filter((t) => t.keywords.some((k) => lower.includes(k))).map(
    (t) => t.id,
  );
}
