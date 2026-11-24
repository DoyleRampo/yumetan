// App Store product-page images: each raw screenshot from
// scripts/appstore-screenshots.mjs, set in a device frame on the night sky
// with a headline, a line of copy and one of the characters. The output has
// exactly the raw image's pixel size, so it fits the same App Store slot.
//
//   node scripts/appstore-screenshots.mjs docs/appstore/screenshots/raw
//   node scripts/appstore-marketing.mjs            # raw/<device> → <device>
//
// Options: --raw=<dir> (default docs/appstore/screenshots/raw),
//          --out=<dir> (default docs/appstore/screenshots),
//          --only=<device folder>.
// The subscription review shots stay plain screenshots: Apple reviews them
// as the purchase screen itself.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const arg = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3) || fallback;
const rawDir = path.resolve(arg("raw", path.join(root, "docs/appstore/screenshots/raw")));
const outDir = path.resolve(arg("out", path.join(root, "docs/appstore/screenshots")));
const only = arg("only", "");

const file = (p) => pathToFileURL(p).href;
const fontDir = path.join(root, "node_modules/@fontsource/m-plus-rounded-1c/files");
const character = (id) => path.join(root, `public/assets/characters/moonkeepers-v1/${id}.webp`);
const icon = path.join(root, "public/icons/icon-512.png");

// One slide per screen, in App Store order. <em> marks the words in gold.
const SLIDES = {
  "01-home": {
    kicker: "16タイプの夢キャラクター",
    title: "見た夢が、<br><em>相棒</em>を育てる。",
    copy: "夢を記録するたびに<br>キャラクターがレベルアップ",
    character: "challenge",
    tint: "#b9a5ff",
    tilt: -5,
    side: "left",
    brand: true,
  },
  "02-record": {
    kicker: "夢日記",
    title: "起きたら、<br><em>ひとことメモ</em>。",
    copy: "声でも、手書きノートの写真でも。<br>睡眠やテーマもアイコンひとつで",
    character: "observer",
    tint: "#8fd3ff",
    tilt: 0,
    side: "right",
  },
  "03-reading": {
    kicker: "AIの夢診断",
    title: "<em>AI</em>が夢を<br>やさしく読み解く",
    copy: "いまの心の状態と、今日の占い。<br>前日の日記もヒントにします",
    character: "lucid",
    tint: "#f3c969",
    tilt: 4,
    side: "left",
  },
  "04-community": {
    kicker: "みんなの夢",
    title: "<em>みんなの夢</em>を、<br>のぞいてみよう",
    copy: "今日見た夢をカードでスワイプ。<br>スタンプで「わかる」を伝えよう",
    character: "person",
    tint: "#f39fb6",
    tilt: -4,
    side: "right",
  },
  "05-plans": {
    kicker: "プラン",
    title: "もっと深く、<br><em>夢の世界</em>へ",
    copy: "無料ではじめて、もっと記録したく<br>なったら有料プランも選べます",
    character: "future",
    tint: "#a5e3c9",
    tilt: 0,
    side: "left",
  },
};

// Width and height of a PNG, from its header.
function pngSize(p) {
  const b = fs.readFileSync(p);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// The device scale that divides the image evenly (2x, else 3x), so the shot
// comes out at exactly the image's pixel size (iPhone Duo's 2007 is odd).
const scaleFor = ({ width, height }) =>
  [2, 3, 1].find((s) => width % s === 0 && height % s === 0);
function page(slide, shot, { width, height, tablet }) {
  // Laid out in CSS pixels at 1/scale and shot at that scale: exact output pixels.
  const scale = scaleFor({ width, height });
  const W = width / scale,
    H = height / scale,
    u = W / 100; // one percent of the width
  const deviceW = tablet ? W * 0.74 : W * 0.78;
  const deviceH = deviceW * (height / width);
  const bezel = tablet ? 2.2 * u : 2.4 * u;
  const radius = tablet ? 5 * u : 11 * u;
  const titleSize = tablet ? 7.4 * u : 9.6 * u;
  const copySize = tablet ? 2.9 * u : 4 * u;
  const top = tablet ? 6 * u : 11 * u;
  const deviceTop = tablet ? H * 0.37 : H * 0.355;
  // A wide iPad frame tilted would lift a corner into the copy: keep it straight.
  const tilt = tablet ? 0 : slide.tilt;
  const charSize = tablet ? 26 * u : 40 * u;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
@font-face { font-family: Rounded; font-weight: 500; src: url(${file(path.join(fontDir, "m-plus-rounded-1c-japanese-500-normal.woff2"))}); }
@font-face { font-family: Rounded; font-weight: 800; src: url(${file(path.join(fontDir, "m-plus-rounded-1c-japanese-800-normal.woff2"))}); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
body {
  position: relative;
  font-family: Rounded, "IPAPGothic", sans-serif;
  color: #f7f3ea;
  background:
    radial-gradient(80% 45% at ${slide.side === "left" ? "85%" : "15%"} 8%, ${slide.tint}33, transparent 70%),
    radial-gradient(90% 50% at 50% 105%, ${slide.tint}2a, transparent 70%),
    linear-gradient(180deg, #221b4f 0%, #15123a 45%, #0d0b22 100%);
}
.stars { position: absolute; inset: 0; background-image:
  radial-gradient(1.6px 1.6px at 12% 9%, #fffc 50%, transparent 51%),
  radial-gradient(1.2px 1.2px at 30% 22%, #fff9 50%, transparent 51%),
  radial-gradient(1.8px 1.8px at 88% 14%, #fffd 50%, transparent 51%),
  radial-gradient(1.2px 1.2px at 70% 30%, #fff8 50%, transparent 51%),
  radial-gradient(1.4px 1.4px at 6% 40%, #fff9 50%, transparent 51%),
  radial-gradient(1.2px 1.2px at 94% 46%, #fff8 50%, transparent 51%),
  radial-gradient(1.6px 1.6px at 18% 70%, #fff7 50%, transparent 51%),
  radial-gradient(1.2px 1.2px at 84% 78%, #fff8 50%, transparent 51%),
  radial-gradient(1.4px 1.4px at 46% 4%, #fffa 50%, transparent 51%); }
.moon { position: absolute; top: ${top * 0.7}px; right: ${5 * u}px;
  font-size: ${tablet ? 9 * u : 13 * u}px; color: #f3c969; text-shadow: 0 0 ${4 * u}px #f3c969aa; transform: rotate(-18deg); }
.brand { display: inline-flex; align-items: center; gap: ${1.6 * u}px; margin-bottom: ${3 * u}px;
  padding: ${1 * u}px ${2.6 * u}px ${1 * u}px ${1 * u}px; border-radius: 999px; background: #ffffff14; border: 1px solid #ffffff26; }
.brand img { width: ${tablet ? 5 * u : 7.4 * u}px; height: ${tablet ? 5 * u : 7.4 * u}px; border-radius: 26%; }
.brand span { font-weight: 800; font-size: ${tablet ? 2.6 * u : 3.8 * u}px; letter-spacing: .08em; }
.text { position: absolute; top: ${top}px; left: ${7 * u}px; right: ${7 * u}px; }
.kicker { display: inline-block; margin-bottom: ${2.2 * u}px; padding: ${0.6 * u}px ${2.4 * u}px; border-radius: 999px;
  background: ${slide.tint}2e; color: ${slide.tint}; font-weight: 800; font-size: ${tablet ? 2.3 * u : 3.4 * u}px; letter-spacing: .08em; }
h1 { font-weight: 800; font-size: ${titleSize}px; line-height: 1.28; letter-spacing: .02em;
  text-shadow: 0 ${0.6 * u}px ${3 * u}px #0008; }
h1 em { font-style: normal; color: #f3c969; }
p { margin-top: ${2.6 * u}px; font-weight: 500; font-size: ${copySize}px; line-height: 1.65; color: #ddd5f2; }
.device { position: absolute; left: ${(W - deviceW) / 2}px; top: ${deviceTop}px; width: ${deviceW}px; height: ${deviceH}px;
  border-radius: ${radius}px; padding: ${bezel}px; background: linear-gradient(145deg, #3a3560, #121020 40%, #0b0a14);
  box-shadow: 0 0 0 1.5px #ffffff2e inset, 0 ${4 * u}px ${10 * u}px #000b, 0 0 ${12 * u}px ${slide.tint}33;
  transform: rotate(${tilt}deg); transform-origin: 50% 0; }
.device img.screen { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: ${radius - bezel}px; }
.glow { position: absolute; width: ${charSize * 1.5}px; height: ${charSize * 1.5}px; border-radius: 50%;
  background: radial-gradient(circle, ${slide.tint}55, transparent 65%); }
.character { position: absolute; width: ${charSize}px; height: ${charSize}px; border-radius: 50%; object-fit: cover;
  -webkit-mask-image: radial-gradient(circle, #000 56%, transparent 70%); }
.sparkle { position: absolute; color: #f3c969; text-shadow: 0 0 ${2 * u}px #f3c969; }
</style></head><body>
<div class="stars"></div>
<div class="moon">☾</div>
<div class="text">
  ${slide.brand ? `<div class="brand"><img src="${file(icon)}" alt=""><span>ユメタン</span></div><br>` : ""}
  <span class="kicker">${slide.kicker}</span>
  <h1>${slide.title}</h1>
  <p>${slide.copy}</p>
</div>
<div class="device" data-tilt="${tilt}"><img class="screen" src="${file(shot)}" alt=""></div>
${(() => {
  // The character sits low beside the device, half over its edge.
  const x = slide.side === "left" ? -charSize * 0.18 : W - charSize * 0.82;
  const y = H - charSize * (tablet ? 1.05 : 1.15);
  return `<div class="glow" style="left:${x - charSize * 0.25}px;top:${y - charSize * 0.25}px"></div>
<img class="character" src="${file(character(slide.character))}" style="left:${x}px;top:${y}px" alt="">
<span class="sparkle" style="left:${slide.side === "left" ? x + charSize * 0.9 : x - 2 * u}px;top:${y - 2 * u}px;font-size:${5 * u}px">✦</span>
<span class="sparkle" style="left:${slide.side === "left" ? x + charSize * 0.2 : x + charSize * 0.7}px;top:${y - 6 * u}px;font-size:${3 * u}px">✧</span>`;
})()}
</body></html>`;
}

async function main() {
  if (!fs.existsSync(rawDir)) throw new Error(`No raw screenshots in ${rawDir}`);
  const devices = fs
    .readdirSync(rawDir)
    .filter((d) => fs.statSync(path.join(rawDir, d)).isDirectory() && d !== "subscriptions")
    .filter((d) => !only || d === only);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "yumetan-store-"));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    for (const device of devices) {
      fs.mkdirSync(path.join(outDir, device), { recursive: true });
      for (const [name, slide] of Object.entries(SLIDES)) {
        const shot = path.join(rawDir, device, `${name}.png`);
        if (!fs.existsSync(shot)) continue;
        const size = pngSize(shot);
        const tablet = size.width / size.height > 0.6;
        const context = await browser.newContext({
          viewport: {
            width: size.width / scaleFor(size),
            height: size.height / scaleFor(size),
          },
          deviceScaleFactor: scaleFor(size),
        });
        const tab = await context.newPage();
        const html = path.join(work, `${device}-${name}.html`);
        fs.writeFileSync(html, page(slide, shot, { ...size, tablet }));
        await tab.goto(file(html));
        await tab.evaluate(() => document.fonts.ready);
        // The frame starts below the copy, however many lines it took (plus the
        // corner a tilt lifts).
        await tab.evaluate(() => {
          const text = document.querySelector(".text").getBoundingClientRect(),
            device = document.querySelector(".device"),
            u = innerWidth / 100,
            tilt = Math.abs(parseFloat(device.dataset.tilt) || 0),
            lift = Math.sin((tilt * Math.PI) / 180) * (device.offsetWidth / 2);
          const top = Math.max(device.offsetTop, text.bottom + 4 * u + lift);
          device.style.top = `${top}px`;
        });
        await tab.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
        const out = path.join(outDir, device, `${name}.png`);
        await tab.screenshot({ path: out });
        await context.close();
        const made = pngSize(out);
        if (made.width !== size.width || made.height !== size.height)
          throw new Error(`${out}: ${made.width}x${made.height}, expected ${size.width}x${size.height}`);
        console.log(`  wrote ${path.relative(process.cwd(), out)} (${made.width}x${made.height})`);
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
