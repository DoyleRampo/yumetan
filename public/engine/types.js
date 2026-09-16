// ユメタン 16タイプ診断エンジン（API不要）
// 4グループ × 4タイプ = 16タイプ。アンケート（16問）で初期タイプを決め、夢を記録するたびにスコアが動いて
// タイプが変わることもある。レベル（1〜5）は睡眠の質（engine/sleep.js）から決まる。
(function (root) {
  // ---------- 4グループ ----------
  const GROUPS = [
    { id: "nightmare", no: 1, color: "#e28a8a", bg: "#2a1418", line: "#5a2f36",
      name: { ja: "悪夢タイプ", en: "Nightmare", ko: "악몽 타입", zh: "噩梦型" },
      short: { ja: "N", en: "N", ko: "N", zh: "N" },
      desc: { ja: "恐怖や不安が夢に出やすい。心が「守り」に入っているサイン。", en: "Fear and anxiety surface in dreams. A sign the mind is in a protective mode.", ko: "공포나 불안이 꿈에 자주 나타납니다. 마음이 '방어 모드'에 들어갔다는 신호.", zh: "恐惧与不安容易出现在梦里，是内心进入“防御模式”的信号。" },
      types: ["chase", "loss", "bound", "collapse"] },
    { id: "premonition", no: 2, color: "#8fb8e8", bg: "#14202e", line: "#2f4a66",
      name: { ja: "予知タイプ", en: "Premonition", ko: "예지 타입", zh: "预知型" },
      short: { ja: "P", en: "P", ko: "P", zh: "P" },
      desc: { ja: "夢が「先のこと」や「気づいていない何か」を知らせてくる。直感が鋭い。", en: "Dreams seem to point at what is coming or what you have not noticed yet. Strong intuition.", ko: "꿈이 '앞일'이나 '아직 눈치채지 못한 무언가'를 알려줍니다. 직감이 예리한 편.", zh: "梦会提示“将来的事”或“尚未察觉的事”，直觉敏锐。" },
      types: ["future", "intuition", "symbol", "dejavu"] },
    { id: "lucid", no: 3, color: "#a8d8b0", bg: "#14281f", line: "#2f5a45",
      name: { ja: "明晰タイプ", en: "Lucid", ko: "자각몽 타입", zh: "清醒型" },
      short: { ja: "L", en: "L", ko: "L", zh: "L" },
      desc: { ja: "夢の中で「これは夢だ」と気づける。自分を客観視する力がある。", en: "You can realize you are dreaming while dreaming. Good at looking at yourself from outside.", ko: "꿈속에서 '이건 꿈이다'라고 알아차릴 수 있습니다. 자신을 객관적으로 보는 힘이 있음.", zh: "能在梦中意识到“这是梦”，有客观审视自己的能力。" },
      types: ["lucid", "partial", "observer", "challenge"] },
    { id: "recurring", no: 4, color: "#d8c4a0", bg: "#2a2412", line: "#4a3a1a",
      name: { ja: "反復タイプ", en: "Recurring", ko: "반복 타입", zh: "重复型" },
      short: { ja: "R", en: "R", ko: "R", zh: "R" },
      desc: { ja: "同じ場所・人・展開・感情が繰り返し出てくる。心に「未処理の何か」がある。", en: "The same place, person, plot or feeling keeps returning. Something is still being processed.", ko: "같은 장소·사람·전개·감정이 반복해서 나타납니다. 마음에 '아직 처리되지 않은 무언가'가 있음.", zh: "同样的地点、人物、剧情或情绪反复出现，内心有“尚未处理的事情”。" },
      types: ["place", "person", "story", "emotion"] },
  ];

  // ---------- 16タイプ ----------
  // themes: 夢の分析（engine/analyze.js の theme_ids）からこのタイプに加点する対応
  // tag: 記録画面で選ぶ「この夢の特徴」チップ
  const TYPES = [
    // 1 悪夢
    { id: "chase", no: 1, group: "nightmare",
      name: { ja: "追跡系", en: "The Chased", ko: "추적형", zh: "追逐系" },
      sub: { ja: "誰かに追われる", en: "Being chased", ko: "누군가에게 쫓김", zh: "被人追赶" },
      title: { ja: "追われる夢", en: "Chase dreams", ko: "쫓기는 꿈", zh: "被追的梦" },
      desc: { ja: "誰かや何かに追いかけられ、逃げる夢が多いタイプ。", en: "You often dream of being chased and running away from someone or something.", ko: "누군가 혹은 무언가에게 쫓겨 도망치는 꿈이 많은 타입.", zh: "经常梦见被人或某种事物追赶并逃跑的类型。" },
      chara: { ja: "追われる恐怖を感じている、緊張した表情の子。", en: "A tense-looking kid feeling the fear of being chased.", ko: "쫓기는 공포를 느끼는, 긴장한 표정의 아이.", zh: "感受到被追赶的恐惧、表情紧张的孩子。" },
      trait: { ja: "現実で「向き合いたくないこと」から距離を取っている時期に増えます。責任感が強く、逃げていることに自分でも気づいている人が多いです。", en: "These dreams increase when you are keeping distance from something you would rather not face. Often responsible people who know they are avoiding something.", ko: "현실에서 '마주하고 싶지 않은 일'과 거리를 두는 시기에 늘어납니다. 책임감이 강하고, 스스로도 피하고 있음을 아는 사람이 많습니다.", zh: "在现实中回避“不想面对的事”时会增多。多为责任感强、自己也知道在逃避的人。" },
      tag: { ja: "追われる", en: "Chased", ko: "쫓김", zh: "被追" },
      themes: { chase: 3, hide: 2, violence: 1, ghost: 1, stranger: 1 }, emotions: ["恐怖"] },
    { id: "loss", no: 2, group: "nightmare",
      name: { ja: "喪失系", en: "The Bereft", ko: "상실형", zh: "丧失系" },
      sub: { ja: "大切なものを失う", en: "Losing what matters", ko: "소중한 것을 잃음", zh: "失去重要的东西" },
      title: { ja: "失う夢", en: "Loss dreams", ko: "잃는 꿈", zh: "失去的梦" },
      desc: { ja: "大切な人や物を失ったり、探しても見つからない夢が多いタイプ。", en: "You often dream of losing someone or something precious, or searching without finding.", ko: "소중한 사람이나 물건을 잃거나, 찾아도 찾지 못하는 꿈이 많은 타입.", zh: "经常梦见失去重要的人或物，或怎么找也找不到的类型。" },
      chara: { ja: "大切なものを失ってしまった悲しみを抱える子。", en: "A kid holding the sadness of having lost something dear.", ko: "소중한 것을 잃어버린 슬픔을 안고 있는 아이.", zh: "怀着失去珍贵之物的悲伤的孩子。" },
      trait: { ja: "人や関係を大切にする気持ちが強い人。別れ・変化・「自分の価値」への不安が夢に映りやすいです。", en: "You care deeply about people and relationships. Partings, change and doubts about your own worth show up in dreams.", ko: "사람과 관계를 소중히 여기는 마음이 강한 사람. 이별·변화·'자기 가치'에 대한 불안이 꿈에 비치기 쉽습니다.", zh: "重视人和关系的人。离别、变化以及对“自我价值”的不安容易反映在梦里。" },
      tag: { ja: "失う", en: "Losing", ko: "잃음", zh: "失去" },
      themes: { search: 3, deceased: 2, death: 2, ignored: 2, alone: 2, cry: 1, betrayal: 1 }, emotions: ["悲しみ", "孤独"] },
    { id: "bound", no: 3, group: "nightmare",
      name: { ja: "拘束系", en: "The Bound", ko: "구속형", zh: "束缚系" },
      sub: { ja: "体が動かない・金縛り", en: "Cannot move / sleep paralysis", ko: "몸이 움직이지 않음·가위눌림", zh: "身体动不了・鬼压床" },
      title: { ja: "動けない夢", en: "Frozen dreams", ko: "움직일 수 없는 꿈", zh: "动不了的梦" },
      desc: { ja: "体が動かない・金縛りのような状態で不安を感じる夢が多いタイプ。", en: "You often dream of being unable to move, or wake into sleep paralysis, feeling anxious.", ko: "몸이 움직이지 않거나 가위눌림 같은 상태에서 불안을 느끼는 꿈이 많은 타입.", zh: "经常梦见身体动不了、像鬼压床一样感到不安的类型。" },
      chara: { ja: "動けないもどかしさと恐怖を感じている子。", en: "A kid feeling the frustration and fear of not being able to move.", ko: "움직일 수 없는 답답함과 공포를 느끼는 아이.", zh: "感受到动弹不得的焦躁与恐惧的孩子。" },
      trait: { ja: "「やらなきゃ」と「できない」の板挟みになりやすい人。体の疲れや睡眠不足が、そのまま夢の重さになります。", en: "Often caught between 'I must' and 'I can't'. Physical fatigue and lack of sleep show up directly as heaviness in dreams.", ko: "'해야 해'와 '할 수 없어' 사이에 끼기 쉬운 사람. 몸의 피로와 수면 부족이 그대로 꿈의 무게가 됩니다.", zh: "容易夹在“必须做”和“做不到”之间的人。身体疲劳和睡眠不足会直接变成梦的沉重感。" },
      tag: { ja: "動けない", en: "Frozen", ko: "움직일 수 없음", zh: "动不了" },
      themes: { paralysis: 3, trapped: 3, voice: 2, elevator: 1, drive: 1 }, emotions: ["焦り"] },
    { id: "collapse", no: 4, group: "nightmare",
      name: { ja: "崩壊系", en: "The Unraveling", ko: "붕괴형", zh: "崩坏系" },
      sub: { ja: "世界や自分が壊れる", en: "The world or self falls apart", ko: "세계나 자신이 무너짐", zh: "世界或自我崩塌" },
      title: { ja: "崩れていく夢", en: "Collapse dreams", ko: "무너져 가는 꿈", zh: "崩塌的梦" },
      desc: { ja: "災害・崩壊・自分の体や顔が変わっていくような夢が多いタイプ。", en: "You often dream of disasters, things collapsing, or your own body or face changing.", ko: "재해·붕괴·자신의 몸이나 얼굴이 변해 가는 듯한 꿈이 많은 타입.", zh: "经常梦见灾难、崩塌、自己的身体或面容发生变化的类型。" },
      chara: { ja: "世界や自分が壊れていく感覚を感じている子。", en: "A kid sensing the world, or the self, breaking apart.", ko: "세계나 자신이 무너져 가는 감각을 느끼는 아이.", zh: "感受到世界或自我正在崩塌的孩子。" },
      trait: { ja: "大きな変化や環境の揺れに敏感な人。「今の土台が続くのか」という不安が、災害や崩れる建物として出やすいです。", en: "Sensitive to big changes and unstable surroundings. Worry about whether your foundation will hold appears as disasters and crumbling buildings.", ko: "큰 변화나 환경의 흔들림에 민감한 사람. '지금의 기반이 계속될까'라는 불안이 재해나 무너지는 건물로 나타나기 쉽습니다.", zh: "对巨大变化和环境动荡敏感的人。“现在的基础能否持续”的不安容易化作灾难或倒塌的建筑。" },
      tag: { ja: "崩れていく", en: "Collapsing", ko: "무너짐", zh: "崩塌" },
      themes: { quake: 3, flood: 2, fire: 2, mirror: 2, teeth: 2, hair: 1, illness: 1 }, emotions: ["混乱"] },
    // 2 予知
    { id: "future", no: 5, group: "premonition",
      name: { ja: "未来暗示系", en: "The Foreseer", ko: "미래암시형", zh: "未来暗示系" },
      sub: { ja: "具体的な出来事を示唆", en: "Hints at concrete events", ko: "구체적인 사건을 암시", zh: "暗示具体事件" },
      title: { ja: "予兆の夢", en: "Foreshadowing dreams", ko: "징조의 꿈", zh: "预兆之梦" },
      desc: { ja: "現実で起こりそうな具体的な場面が、先に夢に出てくるタイプ。", en: "Concrete scenes that could happen in real life show up in your dreams first.", ko: "현실에서 일어날 법한 구체적인 장면이 먼저 꿈에 나타나는 타입.", zh: "现实中可能发生的具体场景会先出现在梦里的类型。" },
      chara: { ja: "これから起こる出来事を暗示しているような子。", en: "A kid who seems to hint at what is about to happen.", ko: "앞으로 일어날 일을 암시하는 듯한 아이.", zh: "仿佛在暗示即将发生之事的孩子。" },
      trait: { ja: "先を読んで準備するのが得意な人。頭が「明日の予行練習」を寝ている間にしています。試験・面接・大事な予定の前に増えます。", en: "Good at reading ahead and preparing. Your mind rehearses tomorrow while you sleep. More frequent before exams, interviews and big days.", ko: "앞을 읽고 준비하는 데 능한 사람. 머리가 자는 동안 '내일의 예행연습'을 합니다. 시험·면접·중요한 일정 전에 늘어납니다.", zh: "擅长预判并做准备的人。大脑在睡眠中“预演明天”。考试、面试、重要日程前会增多。" },
      tag: { ja: "予兆", en: "Omen", ko: "징조", zh: "预兆" },
      themes: { exam: 2, late: 2, work: 2, wedding: 1, train: 1, money: 1 }, emotions: [] },
    { id: "intuition", no: 6, group: "premonition",
      name: { ja: "直感警告系", en: "The Sentinel", ko: "직감경고형", zh: "直觉警告系" },
      sub: { ja: "漠然とした不安", en: "Vague unease", ko: "막연한 불안", zh: "模糊的不安" },
      title: { ja: "胸騒ぎの夢", en: "Uneasy dreams", ko: "가슴이 술렁이는 꿈", zh: "心神不宁的梦" },
      desc: { ja: "理由ははっきりしないけれど、なんとなく嫌な予感や不安が残る夢が多いタイプ。", en: "You often wake with a vague bad feeling, without a clear reason.", ko: "이유는 확실하지 않지만 왠지 불길한 예감이나 불안이 남는 꿈이 많은 타입.", zh: "说不清原因、却总留下不祥预感或不安的梦较多的类型。" },
      chara: { ja: "理由ははっきりしないけど、なんとなく不安を感じている子。", en: "A kid feeling uneasy without quite knowing why.", ko: "이유는 분명하지 않지만 왠지 불안을 느끼는 아이.", zh: "说不清原因、却隐隐感到不安的孩子。" },
      trait: { ja: "空気を読む力が強く、言葉にする前に感じ取るタイプ。日中に飲み込んだ違和感が、夜に「胸騒ぎ」として出ます。", en: "Highly perceptive; you sense things before you can name them. Discomfort swallowed during the day returns at night as unease.", ko: "분위기를 읽는 힘이 강하고, 말로 하기 전에 먼저 느끼는 타입. 낮에 삼킨 위화감이 밤에 '가슴 술렁임'으로 나타납니다.", zh: "很会察言观色、在说出口之前就能感觉到的类型。白天咽下的违和感会在夜里化作“心神不宁”。" },
      tag: { ja: "漠然とした不安", en: "Vague unease", ko: "막연한 불안", zh: "模糊不安" },
      themes: { stranger: 2, invisible: 2, crowd: 1, hide: 1, surreal: 1 }, emotions: ["不安"] },
    { id: "symbol", no: 7, group: "premonition",
      name: { ja: "象徴解釈系", en: "The Symbolist", ko: "상징해석형", zh: "象征解读系" },
      sub: { ja: "意味深なモチーフが多い", en: "Rich in meaningful motifs", ko: "의미심장한 모티프가 많음", zh: "意味深长的意象很多" },
      title: { ja: "象徴の夢", en: "Symbolic dreams", ko: "상징의 꿈", zh: "象征之梦" },
      desc: { ja: "動物・水・光・鏡など、象徴的なモチーフがよく出てくるタイプ。", en: "Symbolic motifs such as animals, water, light or mirrors appear often.", ko: "동물·물·빛·거울 등 상징적인 모티프가 자주 나오는 타입.", zh: "动物、水、光、镜子等象征性意象经常出现的类型。" },
      chara: { ja: "象徴的なモチーフを通してメッセージを伝えてくる子。", en: "A kid who speaks through symbols and motifs.", ko: "상징적인 모티프를 통해 메시지를 전하는 아이.", zh: "通过象征性意象传达讯息的孩子。" },
      trait: { ja: "想像力が豊かで、感情を「絵」で処理する人。夢の中の物や動物は、そのときの気持ちの化身であることが多いです。", en: "Imaginative; you process feelings as images. Objects and animals in your dreams often embody your current emotions.", ko: "상상력이 풍부하고 감정을 '그림'으로 처리하는 사람. 꿈속의 물건이나 동물은 그때의 기분이 형상화된 것일 때가 많습니다.", zh: "想象力丰富、用“画面”处理情绪的人。梦里的物品和动物常常是当时心情的化身。" },
      tag: { ja: "象徴が多い", en: "Symbolic", ko: "상징이 많음", zh: "象征很多" },
      themes: { snake: 2, animal: 2, water: 2, sky: 2, mirror: 1, god: 2, surreal: 2, fly: 1 }, emotions: ["驚き"] },
    { id: "dejavu", no: 8, group: "premonition",
      name: { ja: "デジャヴ系", en: "The Déjà Vu", ko: "데자뷔형", zh: "既视感系" },
      sub: { ja: "強い既視感", en: "Strong déjà vu", ko: "강한 기시감", zh: "强烈的既视感" },
      title: { ja: "既視感の夢", en: "Déjà vu dreams", ko: "기시감의 꿈", zh: "既视感之梦" },
      desc: { ja: "「これ、前にも見た」「どこかで経験した」という感覚が強いタイプ。", en: "A strong sense of 'I have seen this before' or 'I have been here'.", ko: "'이거 전에도 봤어', '어디선가 경험했어'라는 감각이 강한 타입.", zh: "“这个以前见过”“在哪里经历过”这种感觉很强的类型。" },
      chara: { ja: "「どこかで見たことがある」という感覚を持つ子。", en: "A kid with the feeling of having seen it all somewhere before.", ko: "'어디선가 본 적이 있다'는 감각을 지닌 아이.", zh: "带着“好像在哪里见过”感觉的孩子。" },
      trait: { ja: "記憶と今をつなげて考える人。過去の経験を無意識が何度も参照していて、懐かしい場所や昔の人が出やすいです。", en: "You connect memory with the present. Your unconscious keeps referring back to past experiences; old places and people appear often.", ko: "기억과 현재를 연결해 생각하는 사람. 무의식이 과거 경험을 반복해서 참조하기 때문에 그리운 장소나 옛 사람이 나타나기 쉽습니다.", zh: "把记忆与当下联系起来思考的人。潜意识反复参照过去的经历，怀念的地方和旧人容易出现。" },
      tag: { ja: "既視感", en: "Déjà vu", ko: "기시감", zh: "既视感" },
      themes: { childhood: 2, school: 2, ex: 2, house: 1, trip: 1 }, emotions: ["懐かしさ"] },
    // 3 明晰
    { id: "lucid", no: 9, group: "lucid",
      name: { ja: "明晰夢系", en: "The Dreamwalker", ko: "자각몽형", zh: "清醒梦系" },
      sub: { ja: "自由自在に操作する", en: "Full control", ko: "자유자재로 조작", zh: "自由操控" },
      title: { ja: "自由な夢", en: "Free dreams", ko: "자유로운 꿈", zh: "自由之梦" },
      desc: { ja: "夢だと気づいて、飛んだり場面を変えたり、自由に動けるタイプ。", en: "You realize you are dreaming and can fly, change scenes and move freely.", ko: "꿈이라는 걸 알아차리고 날거나 장면을 바꾸는 등 자유롭게 움직일 수 있는 타입.", zh: "意识到在做梦后可以飞翔、切换场景、自由行动的类型。" },
      chara: { ja: "夢の中で自由に行動できる子。", en: "A kid who moves freely inside dreams.", ko: "꿈속에서 자유롭게 행동할 수 있는 아이.", zh: "能在梦中自由行动的孩子。" },
      trait: { ja: "自己認識が高く、感情に飲まれにくい人。夢の中の自由さは、現実でも「選べる」感覚がある証拠です。", en: "High self-awareness; not easily swept away by emotion. Freedom in dreams mirrors a sense of choice in waking life.", ko: "자기 인식이 높고 감정에 휩쓸리지 않는 사람. 꿈속의 자유로움은 현실에서도 '선택할 수 있다'는 감각이 있다는 증거입니다.", zh: "自我认知高、不易被情绪吞没的人。梦中的自由证明在现实里也有“可以选择”的感觉。" },
      tag: { ja: "自由に操れる", en: "In control", ko: "자유롭게 조종", zh: "自由操控" },
      themes: { lucid_kw: 3, fly: 3, sky: 1, win: 1 }, emotions: ["解放感"] },
    { id: "partial", no: 10, group: "lucid",
      name: { ja: "部分自覚系", en: "The Half-Awake", ko: "부분자각형", zh: "部分自觉系" },
      sub: { ja: "夢だと気づくが操作は限定的", en: "Aware but limited control", ko: "꿈인 줄 알지만 조작은 제한적", zh: "知道是梦但操控有限" },
      title: { ja: "気づいている夢", en: "Half-lucid dreams", ko: "알아차리는 꿈", zh: "有所察觉的梦" },
      desc: { ja: "夢だと気づいてはいるけれど、思うように体や場面が動かせないタイプ。", en: "You know it is a dream, yet cannot move your body or the scene the way you want.", ko: "꿈이라는 건 알지만 몸이나 장면을 뜻대로 움직일 수 없는 타입.", zh: "知道是梦，却无法随心所欲地控制身体或场景的类型。" },
      chara: { ja: "夢だと気づいているが思うように動けない子。", en: "A kid who knows it is a dream but cannot quite move.", ko: "꿈인 줄 알지만 뜻대로 움직이지 못하는 아이.", zh: "知道是梦却无法如愿行动的孩子。" },
      trait: { ja: "状況を冷静に見ているのに、体がついてこない感覚。現実でも「分かってるけど動けない」場面が多い時期に増えます。", en: "You see the situation clearly but your body will not follow. Increases when waking life is full of 'I know, but I can't move' moments.", ko: "상황은 냉정하게 보고 있는데 몸이 따라오지 않는 감각. 현실에서도 '알지만 움직일 수 없는' 장면이 많은 시기에 늘어납니다.", zh: "冷静地看着状况，身体却跟不上的感觉。现实中“明白却动不了”的场面多的时期会增多。" },
      tag: { ja: "気づいてるけど動けない", en: "Aware but stuck", ko: "알지만 움직일 수 없음", zh: "察觉却动不了" },
      themes: { lucid_kw: 2, paralysis: 2, voice: 1, elevator: 1 }, emotions: ["焦り", "混乱"] },
    { id: "observer", no: 11, group: "lucid",
      name: { ja: "観察者系", en: "The Observer", ko: "관찰자형", zh: "观察者系" },
      sub: { ja: "客観的に眺めている", en: "Watching from outside", ko: "객관적으로 바라봄", zh: "客观地旁观" },
      title: { ja: "眺めている夢", en: "Observer dreams", ko: "바라보는 꿈", zh: "旁观之梦" },
      desc: { ja: "自分を外側から見ているような、映画を観ているような夢が多いタイプ。", en: "You often watch yourself from outside, as if viewing a film.", ko: "자신을 바깥에서 보는 듯한, 영화를 보는 듯한 꿈이 많은 타입.", zh: "像从外面看自己、像在看电影一样的梦较多的类型。" },
      chara: { ja: "自分を外側から見ているような感覚の子。", en: "A kid who feels like watching themselves from the outside.", ko: "자신을 바깥에서 보는 듯한 감각의 아이.", zh: "仿佛从外部看着自己的孩子。" },
      trait: { ja: "感情と少し距離を置いて物事を見る人。落ち着いている反面、気持ちを後回しにしがちなので、夢が「見せて」くることがあります。", en: "You look at things with a little distance from emotion. Calm, but you tend to postpone feelings, so dreams show them to you instead.", ko: "감정과 약간 거리를 두고 사물을 보는 사람. 차분한 반면 기분을 뒤로 미루기 쉬워서 꿈이 대신 '보여 주는' 경우가 있습니다.", zh: "与情绪保持一点距离看待事物的人。虽然沉稳，但容易把感受往后放，于是梦会替你“演出来”。" },
      tag: { ja: "眺めている", en: "Watching", ko: "바라봄", zh: "旁观" },
      themes: { surreal: 1, celebrity: 1, crowd: 1, sky: 1, invisible: 1 }, emotions: ["無感情"] },
    { id: "challenge", no: 12, group: "lucid",
      name: { ja: "挑戦系", en: "The Challenger", ko: "도전형", zh: "挑战系" },
      sub: { ja: "夢の中で目標に挑む", en: "Taking on goals in dreams", ko: "꿈속에서 목표에 도전", zh: "在梦中挑战目标" },
      title: { ja: "挑む夢", en: "Challenge dreams", ko: "도전하는 꿈", zh: "挑战之梦" },
      desc: { ja: "夢の中で戦ったり、試合や試験に挑んだり、何かを成し遂げようとするタイプ。", en: "In dreams you fight, compete, take tests and try to achieve something.", ko: "꿈속에서 싸우거나 시합·시험에 도전하거나 무언가를 이루려 하는 타입.", zh: "在梦中战斗、参加比赛或考试、努力达成某事的类型。" },
      chara: { ja: "夢の中で何かに挑戦している意欲的な子。", en: "An eager kid taking on challenges inside dreams.", ko: "꿈속에서 무언가에 도전하는 의욕적인 아이.", zh: "在梦中挑战某事、充满干劲的孩子。" },
      trait: { ja: "目標志向で、寝ている間も「攻略」を考えているタイプ。うまくいく夢は自信のサイン、負ける夢は準備不足の不安のサインです。", en: "Goal-driven; even asleep you are working out how to win. Success in dreams signals confidence, defeat signals worry about preparation.", ko: "목표 지향적이고 자는 동안에도 '공략'을 생각하는 타입. 잘 되는 꿈은 자신감의 신호, 지는 꿈은 준비 부족에 대한 불안의 신호입니다.", zh: "目标导向、睡着时也在思考“攻略”的类型。成功的梦是自信的信号，失败的梦是对准备不足的不安。" },
      tag: { ja: "挑んでいる", en: "Challenging", ko: "도전 중", zh: "挑战中" },
      themes: { win: 3, violence: 2, exam: 2, fail: 1, drive: 1, trip: 1 }, emotions: ["達成感"] },
    // 4 反復
    { id: "place", no: 13, group: "recurring",
      name: { ja: "場所固定系", en: "The Homebound", ko: "장소고정형", zh: "地点固定系" },
      sub: { ja: "同じ場所が繰り返す", en: "The same place returns", ko: "같은 장소가 반복", zh: "同一地点反复出现" },
      title: { ja: "同じ場所の夢", en: "Same-place dreams", ko: "같은 장소의 꿈", zh: "同一地点的梦" },
      desc: { ja: "いつも同じ場所（実家・学校・知らない街など）が舞台になるタイプ。", en: "The same place — childhood home, school, an unknown town — keeps being the stage.", ko: "항상 같은 장소(본가·학교·낯선 거리 등)가 무대가 되는 타입.", zh: "总是以同一个地方（老家、学校、陌生的街道等）为舞台的类型。" },
      chara: { ja: "いつも同じ場所が舞台になる子。", en: "A kid whose dreams always take place on the same stage.", ko: "항상 같은 장소가 무대가 되는 아이.", zh: "总是以同一地点为舞台的孩子。" },
      trait: { ja: "「居場所」や「安心できる場」を大事にする人。その場所に、まだ整理しきれていない思い出や役割があることが多いです。", en: "You value belonging and safe places. That place usually holds memories or roles you have not finished sorting out.", ko: "'있을 곳'과 '안심할 수 있는 장소'를 소중히 하는 사람. 그 장소에 아직 정리하지 못한 추억이나 역할이 있는 경우가 많습니다.", zh: "重视“归属”和“安心之地”的人。那个地方往往还留着未整理完的回忆或角色。" },
      tag: { ja: "同じ場所", en: "Same place", ko: "같은 장소", zh: "同一地点" },
      themes: { house: 3, school: 2, train: 1, lost: 1, water: 1 }, emotions: [] },
    { id: "person", no: 14, group: "recurring",
      name: { ja: "人物固定系", en: "The Companion", ko: "인물고정형", zh: "人物固定系" },
      sub: { ja: "同じ人物が繰り返す", en: "The same person returns", ko: "같은 인물이 반복", zh: "同一人物反复出现" },
      title: { ja: "同じ人の夢", en: "Same-person dreams", ko: "같은 사람의 꿈", zh: "同一人物的梦" },
      desc: { ja: "同じ人（家族・元恋人・昔の友達など）が何度も登場するタイプ。", en: "The same person — family, an ex, an old friend — keeps appearing.", ko: "같은 사람(가족·옛 연인·옛 친구 등)이 몇 번이고 등장하는 타입.", zh: "同一个人（家人、前任、旧友等）反复登场的类型。" },
      chara: { ja: "同じ人が何度も登場する子。", en: "A kid whose dreams keep featuring the same person.", ko: "같은 사람이 몇 번이고 등장하는 아이.", zh: "同一个人反复登场的孩子。" },
      trait: { ja: "人との関係を深く考える人。その人に対して「言えていないこと」や「決着していない気持ち」があるサインです。", en: "You think deeply about relationships. A sign there is something unsaid or unresolved with that person.", ko: "사람과의 관계를 깊이 생각하는 사람. 그 사람에게 '말하지 못한 것'이나 '매듭짓지 못한 감정'이 있다는 신호입니다.", zh: "会深入思考人际关系的人。这是对那个人还有“没说出口的话”或“未了结的感情”的信号。" },
      tag: { ja: "同じ人が出る", en: "Same person", ko: "같은 사람이 나옴", zh: "同一人物" },
      themes: { ex: 3, parent: 2, sibling: 2, friend: 2, deceased: 2, celebrity: 1 }, emotions: ["ときめき"] },
    { id: "story", no: 15, group: "recurring",
      name: { ja: "展開固定系", en: "The Looper", ko: "전개고정형", zh: "剧情固定系" },
      sub: { ja: "同じストーリー展開", en: "The same storyline", ko: "같은 스토리 전개", zh: "同样的故事展开" },
      title: { ja: "同じ展開の夢", en: "Same-story dreams", ko: "같은 전개의 꿈", zh: "同样剧情的梦" },
      desc: { ja: "いつも同じストーリー（遅刻する・試験に間に合わない・探し続ける等）が繰り返されるタイプ。", en: "The same story keeps repeating — running late, missing an exam, endless searching.", ko: "항상 같은 스토리(지각·시험에 못 감·계속 찾음 등)가 반복되는 타입.", zh: "总是重复同样剧情（迟到、赶不上考试、不停寻找等）的类型。" },
      chara: { ja: "いつも同じストーリーが繰り返される子。", en: "A kid living the same story over and over.", ko: "항상 같은 스토리가 반복되는 아이.", zh: "总是重复同一个故事的孩子。" },
      trait: { ja: "同じ課題に何度も向き合っている人。夢の「ループ」は、現実で同じパターンを繰り返していることへの気づきの促しです。", en: "You keep facing the same task. The dream loop nudges you to notice a pattern you repeat in waking life.", ko: "같은 과제를 몇 번이고 마주하는 사람. 꿈의 '루프'는 현실에서 같은 패턴을 반복하고 있음을 알아차리라는 재촉입니다.", zh: "反复面对同一课题的人。梦的“循环”是在提醒你，现实中也在重复同样的模式。" },
      tag: { ja: "同じ展開", en: "Same story", ko: "같은 전개", zh: "同样剧情" },
      themes: { cheat_exam: 3, late: 2, exam: 1, lost: 1, search: 1 }, emotions: [] },
    { id: "emotion", no: 16, group: "recurring",
      name: { ja: "感情固定系", en: "The Constant", ko: "감정고정형", zh: "情绪固定系" },
      sub: { ja: "内容は違うが感情が同じ", en: "Different content, same feeling", ko: "내용은 달라도 감정이 같음", zh: "内容不同但情绪相同" },
      title: { ja: "同じ気持ちの夢", en: "Same-feeling dreams", ko: "같은 감정의 꿈", zh: "同样心情的梦" },
      desc: { ja: "場面は毎回違うのに、目が覚めたときの気持ちがいつも同じタイプ。", en: "The scenes differ every time, but the feeling on waking is always the same.", ko: "장면은 매번 다른데 깨어났을 때의 기분이 항상 같은 타입.", zh: "场景每次不同，醒来时的心情却总是一样的类型。" },
      chara: { ja: "内容は違っても、いつも同じ感情を抱く子。", en: "A kid who feels the same emotion no matter the dream.", ko: "내용은 달라도 항상 같은 감정을 품는 아이.", zh: "无论内容如何，总怀着同样情绪的孩子。" },
      trait: { ja: "気持ちの「基調」がはっきりしている人。その感情（寂しさ・焦り・懐かしさなど）が、今の心のベースになっています。", en: "Your emotional keynote is clear. That feeling — loneliness, hurry, nostalgia — is the base tone of your mind right now.", ko: "감정의 '기조'가 뚜렷한 사람. 그 감정(외로움·초조함·그리움 등)이 지금 마음의 바탕이 되어 있습니다.", zh: "情绪“基调”鲜明的人。那种感情（寂寞、焦急、怀念等）正是你此刻内心的底色。" },
      tag: { ja: "同じ感情", en: "Same feeling", ko: "같은 감정", zh: "同样情绪" },
      themes: { cry: 2, alone: 2, laugh: 1, ignored: 1 }, emotions: ["懐かしさ", "孤独"] },
  ];
  const byId = Object.fromEntries(TYPES.map((t) => [t.id, t]));
  const groupById = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

  // ---------- アンケート（16問。1問が1タイプに対応。よくある=2 / たまにある=1 / ほとんどない=0） ----------
  const QUIZ = [
    { type: "chase", q: { ja: "誰かに追いかけられる夢を見ることがある？", en: "Do you dream of being chased by someone?", ko: "누군가에게 쫓기는 꿈을 꾸는 편인가요?", zh: "你会梦见被人追赶吗？" } },
    { type: "loss", q: { ja: "大切な人や物を失う夢を見ることがある？", en: "Do you dream of losing someone or something important?", ko: "소중한 사람이나 물건을 잃는 꿈을 꾸나요?", zh: "你会梦见失去重要的人或东西吗？" } },
    { type: "bound", q: { ja: "体が動かない・金縛りのような夢を見ることがある？", en: "Do you dream of being unable to move, or experience sleep paralysis?", ko: "몸이 움직이지 않거나 가위눌리는 듯한 꿈을 꾸나요?", zh: "你会梦见身体动不了或类似鬼压床的情况吗？" } },
    { type: "collapse", q: { ja: "世界や建物、自分の体が壊れていく夢を見ることがある？", en: "Do you dream of the world, buildings or your own body falling apart?", ko: "세계나 건물, 자신의 몸이 무너져 가는 꿈을 꾸나요?", zh: "你会梦见世界、建筑或自己的身体崩塌吗？" } },
    { type: "future", q: { ja: "夢で見た具体的な出来事が、あとで現実に起きたことがある？", en: "Has a concrete event from a dream later happened in real life?", ko: "꿈에서 본 구체적인 일이 나중에 현실에서 일어난 적이 있나요?", zh: "梦里的具体事件后来在现实中发生过吗？" } },
    { type: "intuition", q: { ja: "理由は分からないけど、嫌な予感が残る夢を見ることがある？", en: "Do you wake with a bad feeling from a dream, without knowing why?", ko: "이유는 모르지만 불길한 예감이 남는 꿈을 꾸나요?", zh: "你会做那种说不清原因、却留下不祥预感的梦吗？" } },
    { type: "symbol", q: { ja: "動物・水・光・鏡など、意味ありげなモチーフが夢によく出てくる？", en: "Do meaningful motifs — animals, water, light, mirrors — appear often in your dreams?", ko: "동물·물·빛·거울 등 의미심장한 모티프가 꿈에 자주 나오나요?", zh: "动物、水、光、镜子等意味深长的意象经常出现在梦里吗？" } },
    { type: "dejavu", q: { ja: "「この場面、前にも見た」という強い既視感を夢で感じることがある？", en: "Do you get a strong sense of déjà vu in your dreams?", ko: "'이 장면, 전에도 봤어'라는 강한 기시감을 꿈에서 느끼나요?", zh: "你会在梦里产生“这个场景以前见过”的强烈既视感吗？" } },
    { type: "lucid", q: { ja: "夢だと気づいて、飛んだり場面を変えたり自由に動けることがある？", en: "Do you realize you are dreaming and then fly, change scenes or move freely?", ko: "꿈인 걸 알아차리고 날거나 장면을 바꾸는 등 자유롭게 움직인 적이 있나요?", zh: "你会意识到在做梦，然后飞行、切换场景或自由行动吗？" } },
    { type: "partial", q: { ja: "夢だと気づいているのに、思うように動けないことがある？", en: "Do you know it is a dream but still cannot move the way you want?", ko: "꿈인 걸 알면서도 뜻대로 움직이지 못한 적이 있나요?", zh: "你会明知是梦却无法随心行动吗？" } },
    { type: "observer", q: { ja: "自分を外から眺めているような、映画を観ているような夢を見ることがある？", en: "Do you dream of watching yourself from outside, like a film?", ko: "자신을 밖에서 바라보는, 영화를 보는 듯한 꿈을 꾸나요?", zh: "你会做那种像从外面看着自己、像看电影一样的梦吗？" } },
    { type: "challenge", q: { ja: "夢の中で戦ったり、試合や試験に挑んだりすることがある？", en: "In dreams, do you fight, compete or take on tests and challenges?", ko: "꿈속에서 싸우거나 시합·시험에 도전하는 편인가요?", zh: "你会在梦里战斗、参加比赛或挑战考试吗？" } },
    { type: "place", q: { ja: "いつも同じ場所（実家・学校・知らない街など）が夢の舞台になる？", en: "Is the same place — home, school, an unknown town — often the stage of your dreams?", ko: "항상 같은 장소(본가·학교·낯선 거리 등)가 꿈의 무대가 되나요?", zh: "同一个地方（老家、学校、陌生街道等）总是成为梦的舞台吗？" } },
    { type: "person", q: { ja: "同じ人が何度も夢に出てくることがある？", en: "Does the same person appear in your dreams again and again?", ko: "같은 사람이 꿈에 몇 번이고 나오나요?", zh: "同一个人会反复出现在梦里吗？" } },
    { type: "story", q: { ja: "同じストーリーが繰り返される夢を見ることがある？", en: "Do you have dreams where the same story repeats?", ko: "같은 스토리가 반복되는 꿈을 꾸나요?", zh: "你会做同样剧情反复出现的梦吗？" } },
    { type: "emotion", q: { ja: "内容は違うのに、目が覚めたときの気持ちがいつも同じことがある？", en: "Do different dreams leave you with the same feeling on waking?", ko: "내용은 다른데 깨어났을 때의 기분이 항상 같은가요?", zh: "梦的内容不同，醒来时的心情却总是一样吗？" } },
  ];
  const QUIZ_OPTIONS = [
    { value: 2, label: { ja: "よくある", en: "Often", ko: "자주 있다", zh: "经常" } },
    { value: 1, label: { ja: "たまにある", en: "Sometimes", ko: "가끔 있다", zh: "偶尔" } },
    { value: 0, label: { ja: "ほとんどない", en: "Rarely", ko: "거의 없다", zh: "几乎没有" } },
  ];

  const QUIZ_WEIGHT = 5; // アンケート1点 = 夢の記録およそ5件分の重み
  const CHANGE_MARGIN = 6; // 現在のタイプをこれ以上上回ったら交代
  const CHANGE_MIN_DREAMS = 3; // 交代には直近の記録がこの件数以上必要
  const DECAY = 0.96; // 記録1件ごとに古いスコアを少しだけ薄める（最近の傾向を重視）

  const emptyScores = () => Object.fromEntries(TYPES.map((t) => [t.id, 0]));
  function topOf(scores) {
    return TYPES.map((t) => t.id).sort((a, b) => (scores[b] || 0) - (scores[a] || 0) || byId[a].no - byId[b].no)[0];
  }
  function groupScores(scores) {
    const g = {};
    for (const grp of GROUPS) g[grp.id] = grp.types.reduce((s, id) => s + (scores[id] || 0), 0);
    return g;
  }

  // answers: [{ type, value }] または [value×16]（QUIZ の順）
  function diagnose(answers) {
    const scores = emptyScores();
    (answers || []).forEach((a, i) => {
      const type = typeof a === "object" ? a.type : QUIZ[i]?.type;
      const value = Number(typeof a === "object" ? a.value : a) || 0;
      if (type && byId[type]) scores[type] += value * QUIZ_WEIGHT;
    });
    // 全部「ほとんどない」なら、内省的な「観察者系」に寄せる
    if (!Object.values(scores).some((v) => v > 0)) scores.observer = 1;
    const typeId = topOf(scores);
    const now = new Date().toISOString();
    return {
      typeId, groupId: byId[typeId].group, scores, groupScores: groupScores(scores),
      level: 1, sleepScore: null, dreamsSince: 0, diagnosedAt: now, updatedAt: now, quiz: answers,
      history: [{ typeId, at: now, reason: "quiz" }],
    };
  }

  // 夢1件の分析から各タイプへの加点を出す。tags: 記録画面で選んだタイプ・チップ（type id の配列）
  function scoreDream(analysis, tags = []) {
    const delta = emptyScores();
    for (const id of tags) if (byId[id]) delta[id] += 3;
    if (!analysis) return delta;
    const ids = analysis.theme_ids || [];
    ids.forEach((themeId, i) => {
      const w = i === 0 ? 1 : 0.5; // 主テーマは強く
      for (const t of TYPES) if (t.themes[themeId]) delta[t.id] += t.themes[themeId] * w;
    });
    for (const e of analysis.emotions || []) for (const t of TYPES) if (t.emotions.includes(e)) delta[t.id] += 0.5;
    if (analysis.dream_type === "lucid") { delta.lucid += 2; delta.partial += 1; }
    if (analysis.dream_type === "recurring") for (const id of groupById.recurring.types) delta[id] += 1;
    if (analysis.dream_type === "nightmare") for (const id of groupById.nightmare.types) delta[id] += 0.5;
    return delta;
  }

  // 記録が増えたときにタイプ状態を更新する。戻り値 { state, changed, from, to }
  function evolve(state, analysis, tags = []) {
    if (!state) return { state: null, changed: false };
    const scores = { ...emptyScores(), ...(state.scores || {}) };
    for (const k in scores) scores[k] *= DECAY;
    const delta = scoreDream(analysis, tags);
    for (const k in delta) scores[k] += delta[k];
    const next = { ...state, scores, groupScores: groupScores(scores), dreamsSince: (state.dreamsSince || 0) + 1, updatedAt: new Date().toISOString() };
    const cand = topOf(scores);
    let changed = false;
    if (cand !== state.typeId && next.dreamsSince >= CHANGE_MIN_DREAMS && scores[cand] - (scores[state.typeId] || 0) >= CHANGE_MARGIN) {
      changed = true;
      next.history = [...(state.history || []), { typeId: cand, at: next.updatedAt, reason: "dreams", from: state.typeId }];
      next.typeId = cand; next.groupId = byId[cand].group; next.dreamsSince = 0;
    }
    return { state: next, changed, from: state.typeId, to: next.typeId };
  }

  // 「次に近いタイプ」（結果画面の補足）
  function runnerUp(state) {
    if (!state?.scores) return null;
    const order = TYPES.map((t) => t.id).sort((a, b) => (state.scores[b] || 0) - (state.scores[a] || 0));
    return order.find((id) => id !== state.typeId) || null;
  }

  // 画像のパス（PNG があればそれ、無ければ SVG プレースホルダー）
  const pad = (n) => String(n).padStart(2, "0");
  const image = (typeId) => `types/${pad(byId[typeId]?.no || 1)}.png`;
  const placeholder = (typeId) => `types/${pad(byId[typeId]?.no || 1)}.svg`;

  const text = (obj, lang) => (obj && (obj[lang] || obj.ja)) || "";

  root.YumetanTypes = { GROUPS, TYPES, QUIZ, QUIZ_OPTIONS, byId, groupById, diagnose, scoreDream, evolve, runnerUp, groupScores, image, placeholder, text, QUIZ_WEIGHT };
})(typeof window !== "undefined" ? window : globalThis);
