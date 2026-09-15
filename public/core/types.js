// Stable IDs are persisted. Labels and questions can change without invalidating records.
export const GROUPS = [
  {
    id: "nightmare",
    color: "#e7a8aa",
    names: ["悪夢タイプ", "악몽 유형", "噩梦类型", "Nightmare"],
  },
  {
    id: "premonition",
    color: "#c4b0ed",
    names: ["予知タイプ", "예감 유형", "预感类型", "Premonition"],
  },
  {
    id: "lucid",
    color: "#a5d8d1",
    names: ["明晰タイプ", "자각몽 유형", "清醒梦类型", "Lucid"],
  },
  {
    id: "recurring",
    color: "#ebca8a",
    names: ["反復タイプ", "반복 유형", "重复类型", "Recurring"],
  },
];
const rows = [
  [
    "chase",
    "↗",
    ["追跡系", "추적형", "追逐型", "The Runner"],
    [
      "誰かに追いかけられる夢を見ることがある？",
      "누군가에게 쫓기는 꿈을 꾸나요?",
      "你会梦见被人追赶吗？",
      "Do you dream of being chased?",
    ],
    ["追われ", "追いかけ", "chased", "chasing", "쫓", "追赶", "追逐"],
  ],
  [
    "loss",
    "♡",
    ["喪失系", "상실형", "失落型", "The Keeper"],
    [
      "大切なものを失う夢を見る？",
      "소중한 것을 잃는 꿈을 꾸나요?",
      "你会梦见失去珍贵的东西吗？",
      "Do you dream of losing something precious?",
    ],
    ["失う", "失った", "lose", "lost someone", "잃", "失去"],
  ],
  [
    "bound",
    "∞",
    ["拘束系", "속박형", "束缚型", "The Still One"],
    [
      "体が動かず、もどかしい夢を見る？",
      "몸이 움직이지 않아 답답한 꿈을 꾸나요?",
      "你会梦见身体无法动弹吗？",
      "Do you dream of being unable to move?",
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
      "世界や自分が崩れていく夢を見る？",
      "세상이나 자신이 무너지는 꿈을 꾸나요?",
      "你会梦见世界或自己崩塌吗？",
      "Do you dream of a world falling apart?",
    ],
    ["崩れ", "崩壊", "collapse", "falling apart", "무너", "崩塌"],
  ],
  [
    "future",
    "✦",
    ["未来暗示系", "미래암시형", "未来暗示型", "The Stargazer"],
    [
      "これからの出来事を示すように感じる夢を見る？",
      "미래의 일을 암시하는 듯한 꿈을 꾸나요?",
      "你会做感觉暗示未来的梦吗？",
      "Do dreams sometimes feel like hints of the future?",
    ],
    ["未来", "予兆", "future", "premonition", "미래", "未来", "预兆"],
  ],
  [
    "intuition",
    "△",
    ["直感警告系", "직감경고형", "直觉警示型", "The Sensor"],
    [
      "理由のわからない不安を感じる夢を見る？",
      "이유를 알 수 없는 불안한 꿈을 꾸나요?",
      "你会做感到莫名不安的梦吗？",
      "Do you feel unexplained unease in dreams?",
    ],
    ["漠然", "胸騒ぎ", "unease", "unexplained", "막연", "불안", "莫名", "不安"],
  ],
  [
    "symbol",
    "☽",
    ["象徴解釈系", "상징해석형", "象征解读型", "The Decoder"],
    [
      "意味深なモチーフがたくさん出る夢を見る？",
      "의미심장한 상징이 많이 나오는 꿈을 꾸나요?",
      "你会梦见许多意味深长的符号吗？",
      "Do your dreams contain meaningful symbols?",
    ],
    ["象徴", "シンボル", "symbol", "상징", "象征", "符号"],
  ],
  [
    "deja",
    "◎",
    ["デジャヴ系", "데자뷔형", "既视感型", "The Echo"],
    [
      "どこかで見た気がする夢を見る？",
      "어디선가 본 듯한 꿈을 꾸나요?",
      "你会做似曾相识的梦吗？",
      "Do dreams feel strangely familiar?",
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
      "夢だと気づいて自由に操ることがある？",
      "꿈임을 알고 자유롭게 조종하나요?",
      "你会意识到在做梦并自由控制梦境吗？",
      "Can you recognize and freely control a dream?",
    ],
    ["自由に", "操れ", "操る", "control my dream", "lucid", "조종", "控制梦"],
  ],
  [
    "aware",
    "◐",
    ["部分自覚系", "부분자각형", "部分自觉型", "The Awakener"],
    [
      "夢だとわかるけれど、思うように動けない？",
      "꿈인 줄 알지만 원하는 대로 움직이지 못하나요?",
      "你会意识到在做梦却无法随心行动吗？",
      "Do you know you are dreaming but have limited control?",
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
      "自分や出来事を外から眺める夢を見る？",
      "자신이나 사건을 밖에서 바라보는 꿈을 꾸나요?",
      "你会从旁观者视角看自己或事件吗？",
      "Do you watch yourself or events from the outside?",
    ],
    ["眺め", "観察", "watching", "observer", "바라보", "관찰", "旁观", "观察"],
  ],
  [
    "challenge",
    "⚑",
    ["挑戦系", "도전형", "挑战型", "The Challenger"],
    [
      "夢の中で目標や難しいことに挑んでいる？",
      "꿈속에서 목표나 어려운 일에 도전하나요?",
      "你会在梦中挑战目标或困难吗？",
      "Do you take on goals or challenges in dreams?",
    ],
    ["挑戦", "挑ん", "challenge", "climb", "도전", "挑战"],
  ],
  [
    "place",
    "⌂",
    ["場所固定系", "장소반복형", "固定地点型", "The Wanderer"],
    [
      "いつも同じ場所が夢に出てくる？",
      "꿈에 늘 같은 장소가 나오나요?",
      "你的梦里总是出现同一个地方吗？",
      "Does the same place keep appearing in your dreams?",
    ],
    ["同じ場所", "same place", "같은 장소", "同一个地方", "相同的地方"],
  ],
  [
    "person",
    "♧",
    ["人物固定系", "인물반복형", "固定人物型", "The Companion"],
    [
      "同じ人が何度も夢に出てくる？",
      "같은 사람이 꿈에 반복해서 나오나요?",
      "同一个人会反复出现在你的梦里吗？",
      "Does the same person return in your dreams?",
    ],
    ["同じ人", "same person", "같은 사람", "同一个人"],
  ],
  [
    "story",
    "⟳",
    ["展開固定系", "전개반복형", "固定情节型", "The Storyteller"],
    [
      "同じストーリーが繰り返される夢を見ることがある？",
      "같은 이야기가 반복되는 꿈을 꾸나요?",
      "你会做重复同一情节的梦吗？",
      "Do you have dreams with a repeating storyline?",
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
      "内容が違っても、同じ感情の夢を繰り返す？",
      "내용이 달라도 같은 감정의 꿈이 반복되나요?",
      "即使内容不同，梦中的情绪仍反复出现吗？",
      "Do different dreams leave you with the same emotion?",
    ],
    ["同じ感情", "same emotion", "same feeling", "같은 감정", "同样的情绪"],
  ],
];
export const TYPES = rows.map(
  ([id, symbol, names, questions, keywords], i) => ({
    id,
    symbol,
    names,
    questions,
    keywords,
    group: GROUPS[Math.floor(i / 4)].id,
  }),
);
export const LANGUAGES = ["ja", "ko", "zh", "en"];
export const localized = (values, language) =>
  values[LANGUAGES.indexOf(language)] || values[0];
export const typeById = (id) => TYPES.find((t) => t.id === id);
export function classify(answers, dreams = []) {
  if (
    !Array.isArray(answers) ||
    answers.length !== 16 ||
    answers.some((v) => ![0, 1, 2].includes(v))
  )
    throw new Error("Incomplete questionnaire");
  const scores = TYPES.map((type, i) => ({ id: type.id, score: answers[i] }));
  // At most 12 recent records; one vote per tag per record, never repeated words.
  [...dreams]
    .filter((d) => d.kind !== "diary")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12)
    .forEach((d) => {
      const tags = d.typeTags || [];
      scores.forEach((s) => {
        if (tags.includes(s.id)) s.score += 1;
      });
    });
  const max = Math.max(...scores.map((s) => s.score));
  // Stable tie rule: catalog order. No randomness or clinical meaning.
  return {
    id: scores.find((s) => s.score === max).id,
    scores,
    tied: scores.filter((s) => s.score === max).length > 1,
    provisional: max === 0,
    version: 1,
  };
}
export function detectTags(text) {
  const lower = String(text).toLocaleLowerCase();
  return TYPES.filter((t) => t.keywords.some((k) => lower.includes(k))).map(
    (t) => t.id,
  );
}
