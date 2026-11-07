#!/usr/bin/env node
// Google Analytics 4 property set-up for ユメタン through the GA Admin API,
// so the console does not have to be clicked through by hand. Idempotent:
// everything that already exists is kept, only what is missing is created.
//
//   node scripts/ga4-setup.mjs [--property 552897004] [--write] [--dry-run]
//                              [--keep-locale] [--no-audiences] [--token …]
//
// What it does on the property (docs/analytics/GA4_SETUP.md explains each):
//   1. time zone Asia/Tokyo and currency JPY (skip with --keep-locale);
//   2. two web data streams, "ユメタン LP" and "ユメタン アプリ", with
//      enhanced measurement on (page changes off for the app: it reports its
//      own screens);
//   3. the custom dimensions and metrics the app and the site send;
//   4. the key events (conversions);
//   5. event data retention of 14 months;
//   6. a Measurement Protocol secret on the app stream for the server
//      (GA4_API_SECRET), printed once;
//   6b. the link to the Firebase project yumetan-a31f0 (--no-firebase-link skips);
//   7. audiences for paid members, journalers and people who saw the plans
//      without buying (--no-audiences skips them);
//   8. with --write, the two measurement IDs are written into
//      public/config.js and landing/assets/release-config.mjs.
//
// Access token: --token, the GA4_ACCESS_TOKEN variable, or gcloud's
// application-default credentials with the analytics.edit scope:
//   gcloud auth application-default login \
//     --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform
// The signed-in Google account needs the Editor role on the GA4 property.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
export const DEFAULT_PROPERTY = "552897004";
export const ADMIN_API = "https://analyticsadmin.googleapis.com";
export const STREAMS = [
  {
    key: "landing",
    displayName: "ユメタン LP",
    defaultUri: "https://yumetan-a31f0.web.app",
    pageChanges: true,
  },
  {
    key: "app",
    displayName: "ユメタン アプリ",
    // The app's own screens are reported by the app (page_view per screen),
    // and the default URI is only a label for the stream.
    defaultUri: "https://yumetan-a31f0.firebaseapp.com",
    pageChanges: false,
  },
];
// Event-scoped custom dimensions (parameter → display name). GA4 allows 50.
export const EVENT_DIMENSIONS = {
  screen_name: "画面名 (screen_name)",
  app_platform: "プラットフォーム (app_platform)",
  plan: "プラン (plan)",
  cycle: "請求サイクル (cycle)",
  engine: "読み解きエンジン (engine)",
  error_code: "エラーコード (error_code)",
  source: "遷移元 (source)",
  method: "ログイン方法 (method)",
  stamp: "スタンプ (stamp)",
  link_kind: "外部リンク種別 (link_kind)",
  location: "ページ内位置 (location)",
  section: "セクション (section)",
  feature: "機能タブ (feature)",
  question: "FAQ (question)",
  text_length: "文字数区分 (text_length)",
  dream_type: "夢タイプ (dream_type)",
  character: "キャラクター (character)",
  store: "ストア (store)",
  cancel_reason: "解約理由 (cancel_reason)",
  expiration_reason: "失効理由 (expiration_reason)",
  period_type: "期間種別 (period_type)",
  page_name: "ページ名 (page_name)",
  kind: "記録種別 (kind)",
  deleted_by: "削除経路 (deleted_by)",
  link_domain: "リンク先ドメイン (link_domain)",
  mood: "目覚めの気分 (mood)",
  action: "操作 (action)",
  screen: "操作時の画面 (screen)",
  language: "言語 (language)",
  character_set: "キャラクターシリーズ (character_set)",
  plan_after: "確認後のプラン (plan_after)",
  product_id: "商品ID (product_id)",
  environment: "購入環境 (environment)",
  target: "リンク先 (target)",
};
// User-scoped custom dimensions (user properties). GA4 allows 25.
export const USER_DIMENSIONS = {
  plan: "ユーザー: プラン",
  dream_type: "ユーザー: 夢タイプ",
  dream_level: "ユーザー: 夢レベル",
  language: "ユーザー: 言語",
  character_set: "ユーザー: キャラクターシリーズ",
  login_provider: "ユーザー: ログイン方法",
  app_platform: "ユーザー: プラットフォーム",
  app_version: "ユーザー: アプリバージョン",
};
// Event-scoped custom metrics (numeric parameters).
export const METRICS = {
  dreams_total: "夢の累計件数 (dreams_total)",
  level: "到達レベル (level)",
  themes: "テーマ数 (themes)",
};
// Key events (conversions). `purchase` is a key event in every property already.
export const KEY_EVENTS = [
  "sign_up",
  "quiz_complete",
  "dream_save",
  "dream_read",
  "diary_save",
  "dream_share",
  "begin_checkout",
  "purchase_confirmed",
  "app_store_click",
  "support_contact_click",
  "demo_submit",
];
export const AUDIENCES = [
  {
    displayName: "有料会員（プラン: starter / standard）",
    description: "ユーザープロパティ plan が starter または standard",
    membershipDurationDays: 540,
    filterClauses: [
      {
        clauseType: "INCLUDE",
        simpleFilter: {
          scope: "AUDIENCE_FILTER_SCOPE_ACROSS_ALL_SESSIONS",
          filterExpression: {
            orGroup: {
              filterExpressions: ["starter", "standard"].map((value) => ({
                dimensionOrMetricFilter: {
                  fieldName: "plan",
                  stringFilter: { matchType: "EXACT", value },
                  atAnyPointInTime: false,
                },
              })),
            },
          },
        },
      },
    ],
  },
  {
    displayName: "夢を記録した人",
    description: "dream_save を 1 回以上",
    membershipDurationDays: 540,
    filterClauses: [
      {
        clauseType: "INCLUDE",
        simpleFilter: {
          scope: "AUDIENCE_FILTER_SCOPE_ACROSS_ALL_SESSIONS",
          filterExpression: {
            eventFilter: { eventName: "dream_save" },
          },
        },
      },
    ],
  },
  {
    displayName: "プラン画面を見て未購入",
    description: "view_plans はあるが purchase_confirmed がない",
    membershipDurationDays: 90,
    filterClauses: [
      {
        clauseType: "INCLUDE",
        simpleFilter: {
          scope: "AUDIENCE_FILTER_SCOPE_ACROSS_ALL_SESSIONS",
          filterExpression: { eventFilter: { eventName: "view_plans" } },
        },
      },
      {
        clauseType: "EXCLUDE",
        simpleFilter: {
          scope: "AUDIENCE_FILTER_SCOPE_ACROSS_ALL_SESSIONS",
          filterExpression: {
            eventFilter: { eventName: "purchase_confirmed" },
          },
        },
      },
    ],
  },
];
export function parseArgs(argv) {
  const args = {
    property: DEFAULT_PROPERTY,
    write: false,
    dryRun: false,
    keepLocale: false,
    audiences: true,
    token: "",
    firebaseProject: "yumetan-a31f0",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--property") args.property = String(argv[++i] || "");
    else if (a.startsWith("--property=")) args.property = a.slice(11);
    else if (a === "--write") args.write = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--keep-locale") args.keepLocale = true;
    else if (a === "--no-audiences") args.audiences = false;
    else if (a === "--no-firebase-link") args.firebaseProject = "";
    else if (a.startsWith("--firebase-project="))
      args.firebaseProject = a.slice(19);
    else if (a === "--token") args.token = String(argv[++i] || "");
    else if (a.startsWith("--token=")) args.token = a.slice(8);
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  args.property = args.property.replace(/^properties\//, "");
  if (!/^\d+$/.test(args.property))
    throw new Error("--property must be the numeric GA4 property ID");
  return args;
}
export function accessToken(args, env = process.env, exec = execFileSync) {
  if (args.token) return args.token;
  if (env.GA4_ACCESS_TOKEN) return env.GA4_ACCESS_TOKEN;
  for (const argv of [
    ["auth", "application-default", "print-access-token"],
    ["auth", "print-access-token"],
  ]) {
    try {
      const token = exec("gcloud", argv, {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
      if (token) return token;
    } catch {}
  }
  throw new Error(
    "No access token. Run: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform (or pass --token / GA4_ACCESS_TOKEN).",
  );
}
// A small client for the Admin API (v1beta, v1alpha for audiences).
export function createClient({
  token,
  fetch = globalThis.fetch,
  dryRun = false,
  log = console.log,
}) {
  async function call(
    method,
    path,
    body,
    { version = "v1beta", quiet = false } = {},
  ) {
    const url = `${ADMIN_API}/${version}/${path}`;
    if (dryRun && method !== "GET") {
      log(
        `  [dry-run] ${method} ${path}${body ? " " + JSON.stringify(body).slice(0, 160) : ""}`,
      );
      return { dryRun: true };
    }
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!response.ok) {
      const err = new Error(
        `${method} ${path} → ${response.status}: ${data.error?.message || text.slice(0, 300)}`,
      );
      err.status = response.status;
      err.quiet = quiet;
      throw err;
    }
    return data;
  }
  async function listAll(path, key, version) {
    const items = [];
    let pageToken = "";
    do {
      const data = await call(
        "GET",
        `${path}?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
        null,
        { version },
      );
      items.push(...(data[key] || []));
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    return items;
  }
  return { call, listAll };
}
export async function runSetup({
  args,
  client,
  log = console.log,
  warn = console.warn,
  siteUrl = STREAMS[0].defaultUri,
}) {
  const { call, listAll } = client;
  const p = `properties/${args.property}`;
  const result = {
    measurementIds: {},
    created: [],
    kept: [],
    warnings: [],
    apiSecret: null,
  };
  const created = (what) => {
    result.created.push(what);
    log(`  + ${what}`);
  };
  const kept = (what) => {
    result.kept.push(what);
    log(`  = ${what}`);
  };
  const warning = (what) => {
    result.warnings.push(what);
    warn(`  ! ${what}`);
  };
  // 0. The property.
  const property = await call("GET", p);
  log(
    `プロパティ: ${property.displayName || p} (${p}, ${property.timeZone || "?"}, ${property.currencyCode || "?"})`,
  );
  // 1. Locale.
  if (!args.keepLocale) {
    const wanted = { timeZone: "Asia/Tokyo", currencyCode: "JPY" };
    const changes = Object.entries(wanted).filter(
      ([k, v]) => property[k] !== v,
    );
    if (changes.length) {
      await call(
        "PATCH",
        `${p}?updateMask=${changes.map(([k]) => k).join(",")}`,
        Object.fromEntries(changes),
      );
      created(
        `プロパティ設定: ${changes.map(([k, v]) => `${k}=${v}`).join(", ")}`,
      );
    } else kept("プロパティ設定: Asia/Tokyo, JPY");
  }
  // 2. Data streams.
  const streams = await listAll(`${p}/dataStreams`, "dataStreams");
  for (const spec of STREAMS) {
    const uri = spec.key === "landing" ? siteUrl : spec.defaultUri;
    let stream = streams.find(
      (s) => s.displayName === spec.displayName && s.type === "WEB_DATA_STREAM",
    );
    if (!stream) {
      stream = await call("POST", `${p}/dataStreams`, {
        type: "WEB_DATA_STREAM",
        displayName: spec.displayName,
        webStreamData: { defaultUri: uri },
      });
      created(`データストリーム ${spec.displayName} (${uri})`);
    } else kept(`データストリーム ${spec.displayName}`);
    spec.name = stream.name;
    result.measurementIds[spec.key] =
      stream.webStreamData?.measurementId || (stream.dryRun ? "G-DRYRUN" : "");
    if (stream.name) {
      const settings = {
        streamEnabled: true,
        scrollsEnabled: true,
        outboundClicksEnabled: true,
        siteSearchEnabled: false,
        videoEngagementEnabled: false,
        fileDownloadsEnabled: false,
        pageChangesEnabled: spec.pageChanges,
        formInteractionsEnabled: false,
      };
      try {
        await call(
          "PATCH",
          `${stream.name}/enhancedMeasurementSettings?updateMask=${Object.keys(settings).join(",")}`,
          settings,
        );
        kept(
          `拡張計測 ${spec.displayName}: スクロール・外部リンク on、ページ変更 ${spec.pageChanges ? "on" : "off"}`,
        );
      } catch (e) {
        warning(`拡張計測 ${spec.displayName}: ${e.message}`);
      }
    }
  }
  // 3. Custom dimensions and metrics.
  const dims = await listAll(`${p}/customDimensions`, "customDimensions");
  const has = (scope, param) =>
    dims.some((d) => d.scope === scope && d.parameterName === param);
  for (const [scope, table] of [
    ["EVENT", EVENT_DIMENSIONS],
    ["USER", USER_DIMENSIONS],
  ])
    for (const [parameterName, displayName] of Object.entries(table)) {
      if (has(scope, parameterName)) {
        kept(`カスタムディメンション ${scope} ${parameterName}`);
        continue;
      }
      try {
        await call("POST", `${p}/customDimensions`, {
          parameterName,
          displayName,
          scope,
        });
        created(`カスタムディメンション ${scope} ${parameterName}`);
      } catch (e) {
        warning(
          `カスタムディメンション ${scope} ${parameterName}: ${e.message}`,
        );
      }
    }
  const metrics = await listAll(`${p}/customMetrics`, "customMetrics");
  for (const [parameterName, displayName] of Object.entries(METRICS)) {
    if (metrics.some((m) => m.parameterName === parameterName)) {
      kept(`カスタム指標 ${parameterName}`);
      continue;
    }
    try {
      await call("POST", `${p}/customMetrics`, {
        parameterName,
        displayName,
        scope: "EVENT",
        measurementUnit: "STANDARD",
      });
      created(`カスタム指標 ${parameterName}`);
    } catch (e) {
      warning(`カスタム指標 ${parameterName}: ${e.message}`);
    }
  }
  // 4. Key events.
  const keyEvents = await listAll(`${p}/keyEvents`, "keyEvents");
  for (const eventName of KEY_EVENTS) {
    if (keyEvents.some((k) => k.eventName === eventName)) {
      kept(`キーイベント ${eventName}`);
      continue;
    }
    try {
      await call("POST", `${p}/keyEvents`, {
        eventName,
        countingMethod: "ONCE_PER_EVENT",
      });
      created(`キーイベント ${eventName}`);
    } catch (e) {
      warning(`キーイベント ${eventName}: ${e.message}`);
    }
  }
  // 5. Retention.
  try {
    const retention = await call("GET", `${p}/dataRetentionSettings`);
    if (
      retention.eventDataRetention !== "FOURTEEN_MONTHS" ||
      retention.resetUserDataOnNewActivity !== true
    ) {
      await call(
        "PATCH",
        `${p}/dataRetentionSettings?updateMask=eventDataRetention,resetUserDataOnNewActivity`,
        {
          eventDataRetention: "FOURTEEN_MONTHS",
          resetUserDataOnNewActivity: true,
        },
      );
      created("データ保持 14 か月（新しいアクティビティでリセット）");
    } else kept("データ保持 14 か月");
  } catch (e) {
    warning(`データ保持: ${e.message}`);
  }
  // 6. Measurement Protocol secret for the server, on the app stream.
  const app = STREAMS.find((s) => s.key === "app");
  if (app.name) {
    try {
      const secrets = await listAll(
        `${app.name}/measurementProtocolSecrets`,
        "measurementProtocolSecrets",
      );
      const existing = secrets.find((s) => s.displayName === "yumetan-server");
      if (existing) {
        result.apiSecret = existing.secretValue || null;
        kept("Measurement Protocol シークレット yumetan-server");
      } else {
        const secret = await call(
          "POST",
          `${app.name}/measurementProtocolSecrets`,
          {
            displayName: "yumetan-server",
          },
        );
        result.apiSecret = secret.secretValue || null;
        created("Measurement Protocol シークレット yumetan-server");
      }
    } catch (e) {
      warning(`Measurement Protocol シークレット: ${e.message}`);
    }
  }
  // 6b. The Firebase project link (the console's "Firebase のリンク").
  if (args.firebaseProject) {
    try {
      const links = await listAll(`${p}/firebaseLinks`, "firebaseLinks");
      const wanted = `projects/${args.firebaseProject}`;
      if (
        links.some(
          (l) =>
            l.project === wanted ||
            l.project?.endsWith(`/${args.firebaseProject}`),
        )
      )
        kept(`Firebase 連携 ${args.firebaseProject}`);
      else if (links.length)
        warning(
          `Firebase 連携: 既に ${links.map((l) => l.project).join(", ")} と連携済み（1 プロパティ 1 プロジェクト）`,
        );
      else {
        await call("POST", `${p}/firebaseLinks`, { project: wanted });
        created(`Firebase 連携 ${args.firebaseProject}`);
      }
    } catch (e) {
      warning(`Firebase 連携: ${e.message}`);
    }
  }
  // 7. Audiences (v1alpha).
  if (args.audiences) {
    try {
      const audiences = await listAll(`${p}/audiences`, "audiences", "v1alpha");
      for (const spec of AUDIENCES) {
        if (audiences.some((a) => a.displayName === spec.displayName)) {
          kept(`オーディエンス ${spec.displayName}`);
          continue;
        }
        try {
          await call("POST", `${p}/audiences`, spec, { version: "v1alpha" });
          created(`オーディエンス ${spec.displayName}`);
        } catch (e) {
          warning(`オーディエンス ${spec.displayName}: ${e.message}`);
        }
      }
    } catch (e) {
      warning(`オーディエンス一覧: ${e.message}`);
    }
  }
  return result;
}
// Writes the measurement IDs into the two config files.
export function writeMeasurementIds(
  { landing, app },
  files = {},
  fsModule = fs,
) {
  const written = [];
  const update = (file, pattern, replacement) => {
    const before = fsModule.readFileSync(file, "utf8");
    if (!pattern.test(before))
      throw new Error(`${file}: expected pattern not found`);
    const after = before.replace(pattern, replacement);
    if (after !== before) {
      fsModule.writeFileSync(file, after);
      written.push(file);
    }
  };
  if (/^G-[A-Z0-9]+$/.test(app || ""))
    update(
      files.config || "public/config.js",
      /ga4MeasurementId:\s*"[^"]*"/,
      `ga4MeasurementId: "${app}"`,
    );
  if (/^G-[A-Z0-9]+$/.test(landing || ""))
    update(
      files.release || "landing/assets/release-config.mjs",
      /GA4_MEASUREMENT_ID = "[^"]*"/,
      `GA4_MEASUREMENT_ID = "${landing}"`,
    );
  return written;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      fs
        .readFileSync(new URL(import.meta.url), "utf8")
        .split("\n")
        .filter((l) => l.startsWith("//"))
        .join("\n"),
    );
    return;
  }
  const token = args.dryRun ? "dry-run" : accessToken(args);
  let siteUrl = STREAMS[0].defaultUri;
  try {
    siteUrl =
      (await import("../landing/assets/release-config.mjs")).SITE_URL ||
      siteUrl;
  } catch {}
  const client = createClient({ token, dryRun: args.dryRun });
  console.log(
    `GA4 セットアップ: properties/${args.property}${args.dryRun ? "（dry-run: 変更しません）" : ""}`,
  );
  const result = await runSetup({ args, client, siteUrl });
  console.log("");
  console.log("測定ID:");
  console.log(
    `  LP   (landing/assets/release-config.mjs GA4_MEASUREMENT_ID): ${result.measurementIds.landing || "(取得できず)"}`,
  );
  console.log(
    `  アプリ (public/config.js ga4MeasurementId / GA4_MEASUREMENT_ID): ${result.measurementIds.app || "(取得できず)"}`,
  );
  if (result.apiSecret)
    console.log(
      `  サーバー用 GA4_API_SECRET（.env / Render / Fly の環境変数へ。再表示されません）: ${result.apiSecret}`,
    );
  if (args.write && !args.dryRun) {
    const written = writeMeasurementIds(result.measurementIds);
    for (const file of written) console.log(`  書き込み: ${file}`);
    if (!written.length) console.log("  書き込み: 変更なし");
  }
  console.log("");
  console.log(
    `作成 ${result.created.length} 件、既存 ${result.kept.length} 件、警告 ${result.warnings.length} 件。残りの手順は docs/analytics/GA4_SETUP.md を参照。`,
  );
  if (result.warnings.length) process.exitCode = 2;
}
if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
)
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
