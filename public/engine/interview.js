// ユメタン ルールエンジン: 質問形式（はい / いいえ / スキップ / その他）で夢を汲み取る分岐シナリオ（API不要）
(function (root) {
  const MAX = 12;
  // ノード: q=質問, fact=記録する項目, yes/no=次のノード（値を記録する場合は {set:値, next:ノード}）, skip=次のセクション
  const NODES = {
    start:       { q: "夢に、知っている人が出てきましたか？", fact: "people", yes: "known1", no: "unknown1", skip: "place" },
    known1:      { q: "その人は家族でしたか？", fact: "people", yes: { set: "家族", next: "place" }, no: "known2", skip: "place" },
    known2:      { q: "友達や同僚など、身近な人でしたか？", fact: "people", yes: { set: "身近な人", next: "place" }, no: { set: "昔の知り合い", next: "place" }, skip: "place" },
    unknown1:    { q: "知らない人は出てきましたか？", fact: "people", yes: { set: "知らない人", next: "place" }, no: { set: "自分ひとり", next: "place" }, skip: "place" },
    place:       { q: "見覚えのある場所でしたか？", fact: "place", yes: "place_k1", no: "place_u1", skip: "event" },
    place_k1:    { q: "家や実家でしたか？", fact: "place", yes: { set: "家", next: "event" }, no: "place_k2", skip: "event" },
    place_k2:    { q: "学校や職場でしたか？", fact: "place", yes: { set: "学校か職場", next: "event" }, no: { set: "見覚えのある場所", next: "event" }, skip: "event" },
    place_u1:    { q: "外（街や自然の中）でしたか？", fact: "place", yes: { set: "知らない街か外", next: "event" }, no: { set: "不思議な場所", next: "event" }, skip: "event" },
    event:       { q: "何かに追いかけられたり、逃げたりしましたか？", fact: "event", yes: { set: "何かに追いかけられて逃げた", next: "outcome" }, no: "event2", skip: "emotion" },
    event2:      { q: "落ちたり、動けなくなったりしましたか？", fact: "event", yes: { set: "落ちたり動けなくなったりした", next: "outcome" }, no: "event3", skip: "emotion" },
    event3:      { q: "何かを探していたり、間に合わなかったりしましたか？", fact: "event", yes: "event3a", no: "event4", skip: "emotion" },
    event3a:     { q: "探し物でしたか？", fact: "event", yes: { set: "何かを探していた", next: "outcome" }, no: { set: "何かに間に合わなかった", next: "outcome" }, skip: "emotion" },
    event4:      { q: "誰かと話したり、争ったりしましたか？", fact: "event", yes: "event4a", no: "event5", skip: "emotion" },
    event4a:     { q: "楽しい会話でしたか？", fact: "event", yes: { set: "誰かと楽しく話した", next: "emotion" }, no: { set: "誰かと言い争った", next: "outcome" }, skip: "emotion" },
    event5:      { q: "乗り物や移動の場面がありましたか？", fact: "event", yes: { set: "どこかへ移動していた", next: "emotion" }, no: "event6", skip: "emotion" },
    event6:      { q: "楽しい、または気持ちいい場面がありましたか？", fact: "event", yes: { set: "楽しくて気持ちいい場面があった", next: "emotion" }, no: { set: "はっきりした出来事は思い出せない", next: "emotion" }, skip: "emotion" },
    outcome:     { q: "最後は逃げ切れましたか（うまくいきましたか）？", fact: "outcome", yes: { set: "最後はうまくいった", next: "emotion" }, no: { set: "最後はうまくいかなかった", next: "emotion" }, skip: { set: "途中で目が覚めた", next: "emotion" } },
    emotion:     { q: "夢の中で、怖かったですか？", fact: "emotion", yes: { set: "怖かった", next: "after" }, no: "emotion2", skip: "after" },
    emotion2:    { q: "焦りや不安はありましたか？", fact: "emotion", yes: { set: "焦りと不安があった", next: "after" }, no: "emotion3", skip: "after" },
    emotion3:    { q: "悲しい気持ちでしたか？", fact: "emotion", yes: { set: "悲しかった", next: "after" }, no: "emotion4", skip: "after" },
    emotion4:    { q: "楽しい、または気持ちいい感じでしたか？", fact: "emotion", yes: { set: "楽しくて気持ちよかった", next: "after" }, no: { set: "特に強い感情はなかった", next: "after" }, skip: "after" },
    after:       { q: "起きたあとも、その気分が残っていましたか？", fact: "after", yes: { set: "起きたあとも気分が残っていた", next: "end" }, no: { set: "起きたらすっきりしていた", next: "end" }, skip: "end" },
    extra:       { q: "他に印象に残った物や場面はありますか？（あれば「その他」で教えてください）", fact: "extra", yes: "end", no: "end", skip: "end" },
    end:         null,
  };
  const ORDER = ["people", "place", "event", "outcome", "emotion", "after", "extra"];
  const COMMENTS = { "はい": ["なるほど。", "そうでしたか。", "分かりました。"], "いいえ": ["そうでしたか。", "なるほど、違うんですね。", "分かりました。"], "スキップ": ["では別のことを。", "はい、飛ばしますね。"], other: ["それは大事な手がかりですね。", "なるほど、覚えておきます。"] };
  const H = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };

  // 回答履歴を最初から再生して、今のノードと集めた事実を出す
  function replay(answers) {
    let node = "start"; const facts = {}; const extras = [];
    const findNode = (question) => Object.keys(NODES).find((k) => NODES[k] && NODES[k].q === question);
    for (const a of answers) {
      const key = findNode(a.question) || node;
      const cur = NODES[key]; if (!cur) break;
      const ans = String(a.answer || "").trim();
      let next;
      if (ans === "はい") next = cur.yes;
      else if (ans === "いいえ") next = cur.no;
      else if (ans === "スキップ") next = cur.skip;
      else { // その他（自由記述）: その項目の答えとして記録し、次のセクションへ
        if (cur.fact === "extra") extras.push(ans); else facts[cur.fact] = ans;
        next = typeof cur.skip === "object" ? cur.skip.next : cur.skip;
      }
      if (typeof next === "object") { facts[cur.fact] = next.set; next = next.next; }
      node = next || "end";
    }
    return { node, facts, extras };
  }

  function compose(facts, extras) {
    const s = [];
    if (facts.people) s.push(facts.people === "自分ひとり" ? "夢の中では自分ひとりだった" : `${facts.people}が出てきた`);
    if (facts.place) s.push(`場所は${facts.place}だった`);
    if (facts.event) s.push(facts.event);
    if (facts.outcome) s.push(facts.outcome);
    if (facts.emotion) s.push(facts.emotion);
    if (facts.after) s.push(facts.after);
    for (const e of extras) s.push(e);
    return s.length ? s.join("。") + "。" : "（内容をうまく聞き取れませんでした）";
  }

  function next({ answers = [], finish = false, more = false }) {
    const { node, facts, extras } = replay(answers);
    const last = answers[answers.length - 1];
    const lastAns = last ? String(last.answer).trim() : "";
    const commentPool = COMMENTS[lastAns] || (last ? COMMENTS.other : null);
    const comment = commentPool ? commentPool[H(lastAns + answers.length) % commentPool.length] : "";
    const count = answers.length;
    const enough = ["people", "place", "event", "emotion"].filter((k) => facts[k]).length >= 3;
    let done = finish || count >= MAX || node === "end" || (enough && !more && count >= 8 && node !== "outcome");
    if (more && node === "end") { return { comment, question: NODES.extra.q, done: false, dream_text: "" }; }
    if (done) return { comment, question: "", done: true, dream_text: compose(facts, extras) };
    const n = NODES[node];
    if (!n) return { comment, question: "", done: true, dream_text: compose(facts, extras) };
    return { comment, question: n.q, done: false, dream_text: "" };
  }

  root.YumetanInterview = { next, replay, compose, FIRST_QUESTION: NODES.start.q, MAX };
})(typeof window !== "undefined" ? window : globalThis);
