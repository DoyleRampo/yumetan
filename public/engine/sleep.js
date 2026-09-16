// ユメタン 睡眠の質エンジン（API不要）
// 夢の内容 + 朝の3問チェック + 前日の日記 + プロフィール から「睡眠の質スコア（0〜100）」と「レベル（1〜5）」を出し、
// 寝る前のアドバイスを返す。根拠は knowledge/sleep_quality.md（後で AI にも同じ知識を渡す）。
(function (root) {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const BASE = 55;

  // レベルの境界（スコア → 1〜5）
  const LEVELS = [0, 35, 50, 65, 80];
  const levelOf = (score) => { let lv = 1; for (let i = 1; i < LEVELS.length; i++) if (score >= LEVELS[i]) lv = i + 1; return lv; };

  // 朝の3問チェック（任意）
  const CHECK = {
    onset:   { good: 10, normal: 0, bad: -12 },        // 寝つき
    wakeups: { none: 10, once: -3, many: -15 },        // 途中で目が覚めた
    feel:    { refreshed: 12, normal: 0, tired: -12 }, // 目覚めの気分
  };
  // 睡眠時間（プロフィール or 日記）
  const HOURS = { "5時間未満": -12, "5〜6時間": -5, "6〜7時間": 3, "7〜8時間": 8, "8時間以上": 4 };
  const hoursToKey = (h) => (h < 5 ? "5時間未満" : h < 6 ? "5〜6時間" : h < 7 ? "6〜7時間" : h <= 8.5 ? "7〜8時間" : "8時間以上");

  // 前日の日記から拾う生活要因（キーワードは日本語・英語・韓国語・中国語）
  const DIARY_FACTORS = [
    { id: "caffeine", w: -4, kw: ["コーヒー", "カフェイン", "エナジードリンク", "紅茶", "coffee", "caffeine", "energy drink", "커피", "카페인", "咖啡", "奶茶", "能量饮料"] },
    { id: "alcohol", w: -6, kw: ["お酒", "飲み会", "ビール", "ワイン", "酔", "alcohol", "beer", "wine", "drinks", "drunk", "술", "맥주", "와인", "酒", "啤酒", "喝多"] },
    { id: "late_screen", w: -4, kw: ["夜更かし", "深夜", "スマホを見", "動画を見", "ゲーム", "寝る前にスマホ", "stayed up", "late night", "scrolling", "phone in bed", "밤샘", "새벽", "폰을", "게임", "熬夜", "刷手机", "打游戏"] },
    { id: "exercise", w: 3, kw: ["運動", "ジム", "ランニング", "走っ", "散歩", "ヨガ", "筋トレ", "exercise", "gym", "run", "walk", "yoga", "workout", "운동", "헬스", "달리기", "산책", "요가", "运动", "健身", "跑步", "散步", "瑜伽"] },
    { id: "stress", w: -5, kw: ["ストレス", "疲れた", "しんどい", "怒られ", "喧嘩", "不安", "イライラ", "泣い", "stress", "exhausted", "argument", "anxious", "cried", "스트레스", "지쳤", "싸웠", "불안", "울었", "压力", "累死", "吵架", "焦虑", "哭"] },
    { id: "late_meal", w: -3, kw: ["夜食", "遅い夕飯", "食べすぎ", "late dinner", "midnight snack", "overate", "야식", "과식", "宵夜", "吃太多"] },
    { id: "nap", w: -2, kw: ["昼寝", "うたた寝", "nap", "낮잠", "午睡"] },
    { id: "sunlight", w: 2, kw: ["日光", "朝日", "外に出", "日差し", "sunlight", "sunny", "outside", "햇빛", "산책", "阳光", "晒太阳"] },
    { id: "bath", w: 2, kw: ["お風呂", "湯船", "温泉", "bath", "hot spring", "목욕", "반신욕", "泡澡", "泡温泉"] },
  ];

  // 夢の内容から拾う要因（analysis は engine/analyze.js の出力）
  function dreamFactors(a) {
    const f = [];
    if (!a) return f;
    const ids = new Set(a.theme_ids || []);
    const emo = new Set(a.emotions || []);
    if (a.dream_type === "nightmare") f.push({ id: "nightmare", w: -12 });
    else if (Number(a.mood) <= -1 && Number(a.intensity) >= 4) f.push({ id: "intense_negative", w: -8 });
    if (ids.has("paralysis")) f.push({ id: "paralysis", w: -10 });
    if (ids.has("toilet") || ids.has("flood")) f.push({ id: "physio", w: -4 });
    if (ids.has("illness")) f.push({ id: "pain", w: -4 });
    if (emo.has("疲れ")) f.push({ id: "tired_in_dream", w: -6 });
    if (a.dream_type === "recurring" && Number(a.mood) <= -1) f.push({ id: "recurring_bad", w: -6 });
    if (a.dream_type === "pleasant" || Number(a.mood) >= 1) f.push({ id: "pleasant", w: 6 });
    if (a.dream_type === "lucid") f.push({ id: "lucid", w: 2 });
    if (a.dream_type === "fragment" && !ids.size) f.push({ id: "fragment", w: 0 });
    if (a.outcome === "wake") f.push({ id: "abrupt_wake", w: -4 });
    return f;
  }

  // score({ analysis, check, diary, profile, hours })
  function score({ analysis = null, check = null, diary = null, profile = null, hours = null } = {}) {
    let s = BASE;
    const factors = [];
    for (const f of dreamFactors(analysis)) { s += f.w; factors.push(f.id); }
    if (check) for (const k of Object.keys(CHECK)) { const v = check[k]; if (v && CHECK[k][v] != null) { s += CHECK[k][v]; if (CHECK[k][v] < 0) factors.push(`${k}_${v}`); } }
    const hk = hours != null ? hoursToKey(Number(hours)) : profile?.sleepHours;
    if (hk && HOURS[hk] != null) { s += HOURS[hk]; if (HOURS[hk] < 0) factors.push("short_sleep"); if (hk === "8時間以上") factors.push("long_sleep"); }
    if (diary?.text) {
      const t = String(diary.text).toLowerCase();
      for (const f of DIARY_FACTORS) if (f.kw.some((k) => t.includes(k.toLowerCase()))) { s += f.w; factors.push(f.id); }
      if (diary.mood != null) { const m = Number(diary.mood); s += (m - 3) * 2; if (m <= 2) factors.push("low_mood_day"); }
    }
    const sc = Math.round(clamp(s, 0, 100));
    return { score: sc, level: levelOf(sc), factors: [...new Set(factors)], at: new Date().toISOString() };
  }

  // 直近の記録から「今のレベル」を出す（最近ほど重い加重平均）
  function currentLevel(records, fallbackProfile = null) {
    const rs = (records || []).filter((r) => r && Number.isFinite(r.score)).slice(0, 7);
    if (!rs.length) {
      const hk = fallbackProfile?.sleepHours;
      const base = { "5時間未満": 1, "5〜6時間": 2, "6〜7時間": 3, "7〜8時間": 4, "8時間以上": 3 }[hk] || 1;
      return { level: base, score: null, n: 0 };
    }
    let sum = 0, wsum = 0;
    rs.forEach((r, i) => { const w = 1 / (i + 1); sum += r.score * w; wsum += w; });
    const avg = Math.round(sum / wsum);
    return { level: levelOf(avg), score: avg, n: rs.length };
  }

  // ---------- 寝る前のアドバイス（要因ごと。4言語） ----------
  const ADVICE = {
    nightmare: { ja: "悪夢が続くときは、寝る前に「別の結末」を頭の中で3分だけ描き直してみてください（イメージ・リハーサル）。悪夢の頻度を減らす効果が確かめられている方法です。", en: "When nightmares keep coming, spend 3 minutes before bed rewriting the dream with a different ending in your head (imagery rehearsal). It is a proven way to reduce nightmare frequency.", ko: "악몽이 이어질 때는 자기 전에 3분만 '다른 결말'을 머릿속에서 다시 그려 보세요(이미지 리허설). 악몽 빈도를 줄이는 효과가 확인된 방법입니다.", zh: "噩梦持续时，睡前花3分钟在脑中把梦改写成“另一个结局”（意象排练）。这是被证实能减少噩梦频率的方法。" },
    intense_negative: { ja: "強い感情の夢のあとは、日中に5分だけ「気になっていること」を紙に書き出すと、夜に持ち越しにくくなります。", en: "After an intense dream, write down what is on your mind for 5 minutes during the day so it does not carry into the night.", ko: "감정이 강한 꿈 뒤에는 낮에 5분만 '마음에 걸리는 일'을 종이에 적어 두면 밤으로 넘기기 어려워집니다.", zh: "情绪强烈的梦之后，白天花5分钟把“挂心的事”写在纸上，就不容易带到夜里。" },
    paralysis: { ja: "金縛りや動けない夢は、睡眠不足と不規則な就寝時刻で増えます。今週は起きる時刻を固定し、仰向けよりも横向きで寝てみてください。", en: "Sleep paralysis and 'frozen' dreams increase with sleep loss and irregular bedtimes. Keep a fixed wake time this week and try sleeping on your side rather than your back.", ko: "가위눌림이나 움직일 수 없는 꿈은 수면 부족과 불규칙한 취침 시간으로 늘어납니다. 이번 주는 기상 시각을 고정하고, 똑바로 눕기보다 옆으로 누워 자 보세요.", zh: "鬼压床和动不了的梦会因睡眠不足和作息不规律而增多。本周固定起床时间，并试着侧卧而非仰卧。" },
    physio: { ja: "水・トイレの夢は、体の感覚が夢に混ざっているサイン。寝る2時間前からは水分を控えめに、寝る直前にトイレへ。", en: "Water and toilet dreams are body sensations leaking into the dream. Cut back on fluids 2 hours before bed and use the bathroom right before sleeping.", ko: "물·화장실 꿈은 몸의 감각이 꿈에 섞인 신호. 자기 2시간 전부터 수분을 줄이고, 자기 직전에 화장실에 다녀오세요.", zh: "水和厕所的梦是身体感觉混入梦中的信号。睡前2小时少喝水，睡前去一趟洗手间。" },
    pain: { ja: "痛みや不調が夢に出ています。枕の高さと寝室の温度（少し涼しめ）を見直してみてください。", en: "Pain or discomfort is showing up in your dreams. Check your pillow height and keep the bedroom slightly cool.", ko: "통증이나 불편이 꿈에 나타나고 있습니다. 베개 높이와 침실 온도(약간 서늘하게)를 점검해 보세요.", zh: "疼痛或不适正出现在梦里。检查一下枕头高度，并让卧室稍凉一些。" },
    tired_in_dream: { ja: "夢の中でも疲れているときは、体が休みきれていません。今夜は30分早く布団に入ることを最優先に。", en: "Feeling tired even inside the dream means your body has not fully rested. Tonight, make getting to bed 30 minutes earlier the top priority.", ko: "꿈속에서도 피곤할 때는 몸이 충분히 쉬지 못한 것입니다. 오늘 밤은 30분 일찍 잠자리에 드는 것을 최우선으로.", zh: "连梦里都感到疲惫，说明身体没有充分休息。今晚把提前30分钟上床放在第一位。" },
    recurring_bad: { ja: "同じ嫌な夢が続くときは、その夢を「昼間に」一度書き切ってしまうと、夜の繰り返しが減ることがあります。", en: "When the same bad dream keeps returning, writing it out fully during the day can reduce the night-time repeats.", ko: "같은 나쁜 꿈이 이어질 때는 그 꿈을 '낮에' 한 번 끝까지 써 버리면 밤의 반복이 줄어들 수 있습니다.", zh: "同一个噩梦反复出现时，白天把它完整写下来一次，夜里的重复往往会减少。" },
    abrupt_wake: { ja: "途中で飛び起きた夜は、二度寝せずに起きて光を浴びると、翌晩の眠りが深くなります。", en: "After a night you jolted awake, get up and get some light instead of dozing off again — tomorrow night's sleep will be deeper.", ko: "중간에 벌떡 깬 밤에는 다시 자지 말고 일어나 빛을 쬐면 다음 날 밤 잠이 깊어집니다.", zh: "半夜惊醒的夜晚，不要再睡回笼觉，起来晒晒光，第二天晚上会睡得更深。" },
    onset_bad: { ja: "寝つきが悪い夜は、布団の中で20分眠れなかったら一度起きて、暗い部屋で退屈なことをしてから戻るのがコツです。", en: "If you cannot fall asleep within 20 minutes, get up, do something boring in dim light, then go back to bed.", ko: "잠들기 어려운 밤에는 이불 속에서 20분 동안 못 자면 한 번 일어나 어두운 방에서 지루한 일을 한 뒤 돌아오는 것이 요령입니다.", zh: "入睡困难的夜晚，躺下20分钟还没睡着就先起来，在昏暗的房间做点无聊的事再回去。" },
    wakeups_many: { ja: "何度も目が覚める夜が続くなら、寝る前のアルコールとカフェインを今週はゼロにしてみてください。中途覚醒の一番の原因です。", en: "Frequent night wakings? Try zero alcohol and caffeine before bed this week — they are the top cause of mid-sleep awakenings.", ko: "자주 깨는 밤이 이어진다면 이번 주는 자기 전 알코올과 카페인을 0으로 해 보세요. 중도 각성의 가장 큰 원인입니다.", zh: "总是半夜醒来？本周试着睡前完全不碰酒精和咖啡因，它们是夜间醒来的头号原因。" },
    wakeups_once: { ja: "夜中に一度目が覚めるのは自然なことです。時計を見ない・スマホを触らない、だけ守ってください。", en: "Waking once at night is normal. Just do not look at the clock or touch your phone.", ko: "밤중에 한 번 깨는 것은 자연스러운 일입니다. 시계를 보지 않기·폰을 만지지 않기만 지켜 주세요.", zh: "夜里醒一次很正常。只要做到不看时间、不碰手机就好。" },
    feel_tired: { ja: "目覚めがだるい朝は、起きてすぐカーテンを開けて10分、光を浴びてください。体内時計が整い、夜の眠気が来やすくなります。", en: "On a groggy morning, open the curtains and get 10 minutes of light right away. It resets your body clock so sleepiness comes at night.", ko: "일어나기 힘든 아침에는 바로 커튼을 열고 10분 동안 빛을 쬐세요. 생체 시계가 정돈되어 밤에 졸음이 잘 옵니다.", zh: "醒来觉得沉的早晨，立刻拉开窗帘晒10分钟光。生物钟会被校准，晚上更容易犯困。" },
    short_sleep: { ja: "睡眠時間が短めです。まず「起きる時刻」を固定して、寝る時刻を15分ずつ早めてみてください。", en: "Your sleep is on the short side. Fix your wake-up time first, then move bedtime earlier in 15-minute steps.", ko: "수면 시간이 짧은 편입니다. 우선 '기상 시각'을 고정하고, 취침 시각을 15분씩 앞당겨 보세요.", zh: "睡眠时间偏短。先固定起床时间，再把就寝时间每次提前15分钟。" },
    long_sleep: { ja: "睡眠が長めなのに疲れが残るなら、睡眠の「深さ」が課題かもしれません。日中に体を動かす時間を少し増やしてみてください。", en: "Sleeping long but still tired? Depth may be the issue. Add a little more physical activity during the day.", ko: "잠을 길게 자는데도 피로가 남는다면 수면의 '깊이'가 과제일 수 있습니다. 낮에 몸을 움직이는 시간을 조금 늘려 보세요.", zh: "睡得长却仍然累，可能是睡眠“深度”的问题。白天稍微增加一些活动量。" },
    caffeine: { ja: "日記にカフェインがありました。カフェインは体に5〜6時間残ります。午後2時以降はデカフェに。", en: "Your diary mentioned caffeine. It stays in the body for 5–6 hours — switch to decaf after 2 pm.", ko: "일기에 카페인이 있었습니다. 카페인은 몸에 5~6시간 남습니다. 오후 2시 이후에는 디카페인으로.", zh: "日记里提到了咖啡因。它会在体内停留5～6小时，下午2点后改喝无咖啡因饮品。" },
    alcohol: { ja: "お酒は寝つきを良くしても、後半の眠りを浅くして夢を激しくします。飲む日は寝る3時間前までに。", en: "Alcohol helps you fall asleep but fragments the second half of the night and intensifies dreams. Finish drinking 3 hours before bed.", ko: "술은 잠들기는 쉽게 해도 후반 잠을 얕게 하고 꿈을 격렬하게 만듭니다. 마시는 날은 자기 3시간 전까지.", zh: "酒精虽然帮助入睡，却会让后半夜睡眠变浅、梦更激烈。喝酒请在睡前3小时结束。" },
    late_screen: { ja: "寝る前の画面は眠りのスイッチを遅らせます。今夜はスマホを寝室の外に置いてみてください。", en: "Screens before bed delay your sleep switch. Tonight, leave the phone outside the bedroom.", ko: "자기 전 화면은 잠의 스위치를 늦춥니다. 오늘 밤은 폰을 침실 밖에 두어 보세요.", zh: "睡前看屏幕会推迟入睡开关。今晚试着把手机放在卧室外。" },
    stress: { ja: "日記にストレスの日がありました。寝る前に「明日やること」を3つだけ紙に書くと、頭が回り続けるのを止められます。", en: "Your diary showed a stressful day. Before bed, write just 3 things for tomorrow on paper to stop your mind from spinning.", ko: "일기에 스트레스가 있던 날이 있었습니다. 자기 전에 '내일 할 일'을 3가지만 종이에 적으면 머리가 계속 도는 것을 멈출 수 있습니다.", zh: "日记里有压力的一天。睡前只在纸上写下“明天要做的3件事”，就能让大脑停止转个不停。" },
    late_meal: { ja: "遅い食事は眠りを浅くします。夕食は寝る3時間前まで、遅くなる日は軽めに。", en: "Late meals make sleep lighter. Finish dinner 3 hours before bed, and keep it light on late days.", ko: "늦은 식사는 잠을 얕게 합니다. 저녁은 자기 3시간 전까지, 늦어지는 날은 가볍게.", zh: "太晚吃饭会让睡眠变浅。晚餐在睡前3小时结束，晚了就吃得清淡些。" },
    nap: { ja: "昼寝は15〜20分・15時までなら夜の眠りを邪魔しません。", en: "Naps of 15–20 minutes before 3 pm will not disturb night sleep.", ko: "낮잠은 15~20분·오후 3시 전까지라면 밤잠을 방해하지 않습니다.", zh: "午睡控制在15～20分钟、下午3点前，不会影响夜间睡眠。" },
    low_mood_day: { ja: "気分が沈んだ日の夜は、寝る前に今日「できたこと」を一つだけ思い出してから目を閉じてみてください。", en: "After a low day, recall one thing you did manage today before closing your eyes.", ko: "기분이 가라앉은 날 밤에는 자기 전에 오늘 '해낸 것'을 하나만 떠올리고 눈을 감아 보세요.", zh: "情绪低落的一天，睡前想起今天“做到的一件事”再闭眼。" },
    pleasant: { ja: "いい夢のあとは、眠りが整ってきています。同じ時刻に寝起きするリズムを続けてください。", en: "Pleasant dreams mean your sleep is settling. Keep the same bed and wake times.", ko: "좋은 꿈 뒤에는 잠이 정돈되고 있습니다. 같은 시각에 자고 일어나는 리듬을 이어 가세요.", zh: "美梦之后，睡眠正在变好。保持同样的作息节奏。" },
    // レベル別の基本アドバイス（要因が無いとき）
    level1: { ja: "眠りがかなり浅い状態です。今週は「起きる時刻を固定」「寝る1時間前は画面オフ」「寝室は暗く涼しく」の3つだけ守ってみてください。", en: "Your sleep is quite shallow. This week keep just 3 rules: fixed wake time, screens off 1 hour before bed, a dark cool bedroom.", ko: "잠이 꽤 얕은 상태입니다. 이번 주는 '기상 시각 고정', '자기 1시간 전 화면 끄기', '침실은 어둡고 서늘하게' 세 가지만 지켜 보세요.", zh: "睡眠相当浅。本周只做到三件事：固定起床时间、睡前1小时不看屏幕、卧室保持黑暗凉爽。" },
    level2: { ja: "眠りが浅めです。寝る前に4秒吸って7秒止めて8秒吐く呼吸を4回。体が「休むモード」に切り替わります。", en: "Sleep is on the light side. Before bed, breathe in 4 s, hold 7 s, out 8 s, four times. It flips the body into rest mode.", ko: "잠이 얕은 편입니다. 자기 전에 4초 들이쉬고 7초 멈추고 8초 내쉬는 호흡을 4회. 몸이 '휴식 모드'로 전환됩니다.", zh: "睡眠偏浅。睡前做4次“吸4秒、屏7秒、呼8秒”的呼吸，身体会切换到休息模式。" },
    level3: { ja: "眠りはまずまずです。寝る時刻と起きる時刻のブレを30分以内にすると、もう一段よくなります。", en: "Sleep is fair. Keeping bed and wake times within a 30-minute window will lift it another level.", ko: "잠은 그럭저럭입니다. 취침·기상 시각의 편차를 30분 이내로 하면 한 단계 더 좋아집니다.", zh: "睡眠还不错。把就寝和起床时间的波动控制在30分钟内，还能再上一个台阶。" },
    level4: { ja: "よく眠れています。朝の光と日中の軽い運動を続けると、この状態を保てます。", en: "You are sleeping well. Morning light and light daytime exercise will keep it that way.", ko: "잘 자고 있습니다. 아침 햇빛과 낮의 가벼운 운동을 계속하면 이 상태를 유지할 수 있습니다.", zh: "睡得很好。坚持早晨晒光和白天的轻运动就能保持。" },
    level5: { ja: "理想的な眠りです。この生活リズムが、キャラクターの成長の土台になっています。", en: "Ideal sleep. This rhythm is the foundation your character grows on.", ko: "이상적인 잠입니다. 이 생활 리듬이 캐릭터 성장의 토대가 되고 있습니다.", zh: "理想的睡眠。这样的作息正是角色成长的基础。" },
  };
  const FACTOR_LABEL = {
    nightmare: { ja: "悪夢", en: "Nightmare", ko: "악몽", zh: "噩梦" }, intense_negative: { ja: "強い感情の夢", en: "Intense dream", ko: "감정이 강한 꿈", zh: "情绪强烈的梦" },
    paralysis: { ja: "金縛り・動けない", en: "Sleep paralysis", ko: "가위눌림", zh: "鬼压床" }, physio: { ja: "体の感覚", en: "Body sensation", ko: "몸의 감각", zh: "身体感觉" },
    pain: { ja: "痛み・不調", en: "Pain", ko: "통증·불편", zh: "疼痛不适" }, tired_in_dream: { ja: "夢の中の疲れ", en: "Tired in dream", ko: "꿈속 피로", zh: "梦中疲惫" },
    recurring_bad: { ja: "繰り返す嫌な夢", en: "Recurring bad dream", ko: "반복되는 나쁜 꿈", zh: "反复的噩梦" }, abrupt_wake: { ja: "途中で目が覚めた", en: "Jolted awake", ko: "중간에 깸", zh: "半夜惊醒" },
    onset_bad: { ja: "寝つきが悪い", en: "Hard to fall asleep", ko: "잠들기 어려움", zh: "入睡困难" }, wakeups_many: { ja: "何度も目が覚めた", en: "Woke many times", ko: "여러 번 깸", zh: "多次醒来" },
    wakeups_once: { ja: "一度目が覚めた", en: "Woke once", ko: "한 번 깸", zh: "醒了一次" }, feel_tired: { ja: "目覚めがだるい", en: "Groggy waking", ko: "개운하지 않음", zh: "醒来乏力" },
    short_sleep: { ja: "睡眠時間が短い", en: "Short sleep", ko: "짧은 수면", zh: "睡眠不足" }, long_sleep: { ja: "睡眠時間が長い", en: "Long sleep", ko: "긴 수면", zh: "睡眠过长" },
    caffeine: { ja: "カフェイン", en: "Caffeine", ko: "카페인", zh: "咖啡因" }, alcohol: { ja: "お酒", en: "Alcohol", ko: "술", zh: "酒精" },
    late_screen: { ja: "寝る前の画面", en: "Screens at night", ko: "자기 전 화면", zh: "睡前屏幕" }, exercise: { ja: "運動", en: "Exercise", ko: "운동", zh: "运动" },
    stress: { ja: "ストレス", en: "Stress", ko: "스트레스", zh: "压力" }, late_meal: { ja: "遅い食事", en: "Late meal", ko: "늦은 식사", zh: "晚餐太晚" },
    nap: { ja: "昼寝", en: "Nap", ko: "낮잠", zh: "午睡" }, sunlight: { ja: "日光", en: "Sunlight", ko: "햇빛", zh: "阳光" }, bath: { ja: "入浴", en: "Bath", ko: "목욕", zh: "泡澡" },
    low_mood_day: { ja: "沈んだ気分の日", en: "Low-mood day", ko: "기분이 가라앉은 날", zh: "情绪低落的一天" }, pleasant: { ja: "いい夢", en: "Pleasant dream", ko: "좋은 꿈", zh: "美梦" },
    lucid: { ja: "明晰夢", en: "Lucid dream", ko: "자각몽", zh: "清醒梦" }, fragment: { ja: "断片", en: "Fragment", ko: "단편", zh: "片段" },
  };
  const PRIORITY = ["nightmare", "paralysis", "wakeups_many", "onset_bad", "alcohol", "short_sleep", "tired_in_dream", "feel_tired", "late_screen", "caffeine", "stress", "recurring_bad", "intense_negative", "physio", "pain", "abrupt_wake", "late_meal", "long_sleep", "low_mood_day", "wakeups_once", "nap", "pleasant"];

  // advice({ level, factors }, lang, max) → [{ id, text }]
  function advice(result, lang = "ja", max = 3) {
    const factors = result?.factors || [];
    const picked = PRIORITY.filter((id) => factors.includes(id)).slice(0, max).map((id) => ({ id, text: ADVICE[id][lang] || ADVICE[id].ja }));
    if (picked.length < max) { const id = `level${result?.level || 3}`; picked.push({ id, text: ADVICE[id][lang] || ADVICE[id].ja }); }
    return picked;
  }
  const factorLabel = (id, lang = "ja") => (FACTOR_LABEL[id] && (FACTOR_LABEL[id][lang] || FACTOR_LABEL[id].ja)) || id;

  root.YumetanSleep = { score, currentLevel, levelOf, advice, factorLabel, LEVELS, CHECK, ADVICE, FACTOR_LABEL, DIARY_FACTORS };
})(typeof window !== "undefined" ? window : globalThis);
