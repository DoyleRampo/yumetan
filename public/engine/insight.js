// ユメタン ルールエンジン: 複数の夢から「最近の心の状態」を出す（API不要）
(function (root) {
  const L = root.YumetanLexicon;
  const byId = Object.fromEntries(L.THEMES.map((t) => [t.id, t]));
  const byLabel = Object.fromEntries(L.THEMES.map((t) => [t.label, t]));
  const NEG_EMO = new Set(L.EMOTIONS.filter((e) => e.neg).map((e) => e.label));
  const RISK_WORDS = ["死にたい", "消えたい", "いなくなりたい", "生きてる意味", "生きる意味がな", "自殺"];
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const q = (s) => `「${s}」`;

  function compute(dreamsInput) {
    const dreams = dreamsInput.filter((d) => d && d.analysis).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const n = dreams.length;
    if (n < 2) return null;
    const A = dreams.map((d) => d.analysis);

    const nightmares = A.filter((a) => a.dream_type === "nightmare").length;
    const moods = A.map((a) => Number(a.mood) || 0);
    const avgMood = avg(moods);
    const avgInt = avg(A.map((a) => Number(a.intensity) || 2));

    // 感情の集計
    const emoCount = {};
    for (const a of A) for (const e of a.emotions || []) emoCount[e] = (emoCount[e] || 0) + 1;
    const emoSorted = Object.entries(emoCount).sort((x, y) => y[1] - x[1]);
    const totalEmo = emoSorted.reduce((s, [, c]) => s + c, 0) || 1;
    const negShare = emoSorted.filter(([e]) => NEG_EMO.has(e)).reduce((s, [, c]) => s + c, 0) / totalEmo;

    // テーマ・系統の集計
    const themeCount = {}, catCount = {};
    for (const a of A) {
      const ids = a.theme_ids?.length ? a.theme_ids : (a.themes || []).map((l) => byLabel[l]?.id).filter(Boolean);
      for (const id of new Set(ids)) {
        const th = byId[id]; if (!th) continue;
        themeCount[th.label] = (themeCount[th.label] || 0) + 1;
        catCount[th.cat] = (catCount[th.cat] || 0) + 1;
      }
    }
    const recurring = Object.entries(themeCount).filter(([, c]) => c >= 2).sort((x, y) => y[1] - x[1]).map(([l]) => l);
    const catSorted = Object.entries(catCount).sort((x, y) => y[1] - x[1]);
    const totalCat = catSorted.reduce((s, [, c]) => s + c, 0) || 1;
    const threatShare = ((catCount.threat || 0) + (catCount.control || 0) * 0.5) / totalCat;

    // 推移（前半 vs 後半）
    let trend = "unknown";
    if (n >= 4) {
      const half = Math.floor(n / 2);
      const diff = avg(moods.slice(n - half)) - avg(moods.slice(0, half));
      trend = diff >= 0.5 ? "improving" : diff <= -0.5 ? "worsening" : "stable";
    } else if (n === 3) {
      const diff = moods[2] - moods[0];
      trend = diff >= 1 ? "improving" : diff <= -1 ? "worsening" : "stable";
    }

    // ストレス度
    let score = (nightmares / n) * 3 + -avgMood + (avgInt - 3) * 0.5 + threatShare * 1.5 + negShare * 0.5;
    if (recurring.some((l) => (byLabel[l]?.mood ?? 0) < 0)) score += 0.5;
    const stress_level = score >= 2.5 ? "high" : score >= 1 ? "medium" : "low";

    // 文章
    const T = L.INSIGHT_TEXT;
    const sortedByMood = [...dreams].sort((a, b) => a.analysis.mood - b.analysis.mood);
    const exDreams = stress_level === "low" ? sortedByMood.slice(-2).reverse() : sortedByMood.slice(0, 2);
    const ex = exDreams.map((d) => q(d.analysis.title)).join("");
    const parts = [T.stress[stress_level].replace("{ex}", ex)];
    if (recurring.length) parts.push(T.recurNote.replace("{themes}", recurring.slice(0, 2).join("』『")));
    else if (nightmares >= 2) parts.push(T.nightmareNote.replace("{n}", nightmares));
    parts.push(T.trend[trend]);

    // 良い面
    const coped = dreams.find((d) => d.analysis.outcome === "good");
    const pleasant = [...dreams].reverse().find((d) => d.analysis.mood >= 1);
    let positive_note;
    if (coped) positive_note = T.positive.coped.replace("{ex}", q(coped.analysis.title));
    else if (pleasant) positive_note = T.positive.pleasant.replace("{ex}", q(pleasant.analysis.title));
    else if (trend === "improving") positive_note = T.positive.improving;
    else if (n >= 5) positive_note = T.positive.recallOk;
    else positive_note = T.positive.default;

    // 提案
    let cat = catSorted[0]?.[0] || "mundane";
    if (stress_level === "low" && !["positive", "freedom"].includes(cat)) cat = avgMood >= 1 ? "positive" : cat;
    const suggestion = (L.CATEGORY_INFO[cat] || L.CATEGORY_INFO.mundane).suggestion;

    // 注意
    const riskText = dreams.some((d) => (d.messages || []).some((m) => m.role === "user" && RISK_WORDS.some((w) => String(m.text).includes(w))));
    const heavyNightmares = (nightmares >= 3 || (n >= 4 && nightmares / n >= 0.5)) && avgInt >= 3.5;
    const caution = riskText || heavyNightmares ? T.caution : null;

    return {
      headline: T.headline[`${stress_level}-${trend}`] || T.headline["medium-unknown"],
      state: parts.join(""),
      stress_level,
      dominant_emotions: emoSorted.slice(0, 3).map(([e]) => e),
      recurring_themes: recurring.slice(0, 3),
      trend, positive_note, suggestion, caution,
      stats: { n, nightmares, avgMood: Math.round(avgMood * 10) / 10, avgIntensity: Math.round(avgInt * 10) / 10, dominantCategory: L.CATEGORY_INFO[cat]?.label || "" },
      generatedAt: new Date().toISOString(), basedOn: n, engine: "local",
    };
  }

  root.YumetanInsight = { compute };
})(typeof window !== "undefined" ? window : globalThis);
