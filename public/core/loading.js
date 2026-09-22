// Shared, dependency-free waiting UI. The static launch screen uses the same markup.
const labels = {
  ja: {
    prepare: "夢の世界を準備しています",
    connect: "夢の世界につないでいます",
    sync: "夢の記録を届けています",
    load: "夢のページをひらいています",
    hint: "少しだけ、お待ちください",
  },
  en: {
    prepare: "Preparing your dream world",
    connect: "Connecting your dream world",
    sync: "Saving your dreams",
    load: "Opening your dream page",
    hint: "Just a moment",
  },
  ko: {
    prepare: "꿈의 세계를 준비하고 있어요",
    connect: "꿈의 세계에 연결하고 있어요",
    sync: "꿈의 기록을 저장하고 있어요",
    load: "꿈의 페이지를 열고 있어요",
    hint: "잠시만 기다려 주세요",
  },
  zh: {
    prepare: "正在准备梦的世界",
    connect: "正在连接梦的世界",
    sync: "正在保存梦的记录",
    load: "正在打开梦的页面",
    hint: "请稍等片刻",
  },
};
export function loadingMarkup(language = "ja", kind = "load", compact = false) {
  const copy = labels[language] || labels.ja;
  return `<span class="dream-loading${compact ? " dream-loading--compact" : ""}" role="status"><span class="dream-loading__scene" aria-hidden="true"><span class="dream-loading__orbit"></span><span class="dream-loading__moon"></span><span class="dream-loading__star dream-loading__star--one">✦</span><span class="dream-loading__star dream-loading__star--two">✧</span><span class="dream-loading__star dream-loading__star--three">✦</span></span><span class="dream-loading__copy">${copy[kind] || copy.load}</span>${compact ? "" : `<span class="dream-loading__hint">${copy.hint}</span>`}</span>`;
}
// Delay avoids flashing for fast operations. Each caller owns its own cleanup.
export function beginLoading(language = "ja", kind = "connect", target = null) {
  const panel = document.createElement("div");
  panel.className = target
    ? "dream-loading-operation"
    : "dream-loading-operation dream-loading-toast";
  let previous;
  panel.innerHTML = loadingMarkup(language, kind, true);
  const timer = setTimeout(() => {
    if (target) {
      if (!target.isConnected) return;
      previous = target.innerHTML;
      target.replaceChildren(panel);
    } else document.body.append(panel);
  }, 250);
  return () => {
    clearTimeout(timer);
    if (target?.contains(panel)) target.innerHTML = previous;
    panel.remove();
  };
}
