// Shared, dependency-free waiting UI. The static launch screen uses the same markup.
const labels = {
  ja: {
    welcome: "ユメタンへようこそ",
    welcomeHint: "夢の世界へ、ようこそ",
    prepare: "夢の世界を準備しています",
    connect: "夢の世界につないでいます",
    sync: "夢の記録を届けています",
    load: "夢のページをひらいています",
    store: "ストアにつないでいます",
    plan: "プランを反映しています",
    planHint: "反映まで少し時間がかかることがあります",
    account: "アカウントを整理しています",
    hint: "少しだけ、お待ちください",
  },
  en: {
    welcome: "Welcome to Yumetan",
    welcomeHint: "Welcome to your dream world",
    prepare: "Preparing your dream world",
    connect: "Connecting your dream world",
    sync: "Saving your dreams",
    load: "Opening your dream page",
    store: "Connecting to the store",
    plan: "Activating your plan",
    planHint: "This can take a little while",
    account: "Updating your account",
    hint: "Just a moment",
  },
  ko: {
    welcome: "유메탄에 오신 것을 환영해요",
    welcomeHint: "꿈의 세계에 오신 것을 환영해요",
    prepare: "꿈의 세계를 준비하고 있어요",
    connect: "꿈의 세계에 연결하고 있어요",
    sync: "꿈의 기록을 저장하고 있어요",
    load: "꿈의 페이지를 열고 있어요",
    store: "스토어에 연결하고 있어요",
    plan: "요금제를 반영하고 있어요",
    planHint: "반영까지 조금 시간이 걸릴 수 있어요",
    account: "계정을 정리하고 있어요",
    hint: "잠시만 기다려 주세요",
  },
  zh: {
    welcome: "欢迎来到 Yumetan",
    welcomeHint: "欢迎来到梦的世界",
    prepare: "正在准备梦的世界",
    connect: "正在连接梦的世界",
    sync: "正在保存梦的记录",
    load: "正在打开梦的页面",
    store: "正在连接商店",
    plan: "正在开通套餐",
    planHint: "可能需要稍等片刻",
    account: "正在整理账号",
    hint: "请稍等片刻",
  },
};
export const loadingText = (language, key) =>
  (labels[language] || labels.ja)[key] || labels.ja[key] || "";
const hintFor = (copy, kind) =>
  kind === "welcome"
    ? copy.welcomeHint
    : kind === "plan"
      ? copy.planHint
      : copy.hint;
export function loadingMarkup(language = "ja", kind = "load", compact = false) {
  const copy = labels[language] || labels.ja;
  return `<span class="dream-loading${compact ? " dream-loading--compact" : ""}" role="status"><span class="dream-loading__scene" aria-hidden="true"><span class="dream-loading__orbit"></span><span class="dream-loading__moon"></span><span class="dream-loading__star dream-loading__star--one">✦</span><span class="dream-loading__star dream-loading__star--two">✧</span><span class="dream-loading__star dream-loading__star--three">✦</span></span><span class="dream-loading__copy">${copy[kind] || copy.load}</span>${compact ? "" : `<span class="dream-loading__hint">${hintFor(copy, kind)}</span>`}</span>`;
}
// Delay avoids flashing for fast operations. Each caller owns its own cleanup.
// `overlay: true` covers the whole screen at once (used while a purchase is
// being made and activated, when the user must not wonder what is happening);
// the returned stop function also carries `update(kind)` to change the copy.
export function beginLoading(
  language = "ja",
  kind = "connect",
  target = null,
  { overlay = false } = {},
) {
  const panel = document.createElement("div");
  panel.className = overlay
    ? "dream-loading-operation dream-loading-overlay"
    : target
      ? "dream-loading-operation"
      : "dream-loading-operation dream-loading-toast";
  let previous;
  const paint = (k) => {
    panel.innerHTML = loadingMarkup(language, k, !overlay);
  };
  paint(kind);
  const show = () => {
    if (target) {
      if (!target.isConnected) return;
      previous = target.innerHTML;
      target.replaceChildren(panel);
    } else document.body.append(panel);
  };
  const timer = overlay ? null : setTimeout(show, 250);
  if (overlay) show();
  const stop = () => {
    clearTimeout(timer);
    if (target?.contains(panel)) target.innerHTML = previous;
    panel.remove();
  };
  stop.update = (k) => {
    kind = k;
    paint(k);
  };
  return stop;
}
