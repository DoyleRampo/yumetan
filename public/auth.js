import { loadingMarkup } from "./core/loading.js";
import { providerLogin } from "./core/auth-providers.js";
import { authText, authError } from "./core/auth-i18n.js";
import { loadFirebase } from "./core/firebase-sdk.js";
const params = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, "", location.pathname);
const language = params.get("language") || "ja",
  t = (key) => authText(key, language),
  button = document.querySelector("#continue"),
  message = document.querySelector("#message"),
  error = document.querySelector("#error");
document.documentElement.lang = language;
const body = { id: params.get("id"), browserKey: params.get("browserKey") };
async function request(action, extra = {}) {
  const res = await fetch("/api/auth/" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, ...extra }),
  });
  const data = await res.json();
  if (!res.ok) throw { code: data.code };
  return data;
}
message.innerHTML = loadingMarkup(language, "connect");
let A, auth, config;
try {
  config = await request("bootstrap");
  const [{ initializeApp }, sdk] = await loadFirebase(["app", "auth"]);
  A = sdk;
  auth = A.initializeAuth(
    initializeApp(window.FIREBASE_CONFIG, "auth-handoff"),
    {
      persistence: A.inMemoryPersistence,
      popupRedirectResolver: A.browserPopupRedirectResolver,
    },
  );
  if (config.token) await A.signInWithCustomToken(auth, config.token);
  message.textContent = t(config.link ? "linkHint" : "loginHint");
  button.textContent = t(config.provider);
  button.disabled = false;
  button.hidden = false;
} catch (e) {
  error.textContent = authError(e.code, language);
  message.textContent = t("retry");
  button.hidden = true;
}
button.onclick = async () => {
  button.disabled = true;
  error.textContent = "";
  message.innerHTML = loadingMarkup(language, "connect");
  try {
    const result = await providerLogin(A, auth, config.provider, {
      link: config.link,
      upgrade: config.upgrade,
      language,
    });
    await request("complete", { idToken: await result.user.getIdToken(true) });
    await A.signOut(auth);
    button.hidden = true;
    message.textContent = t("returnApp");
  } catch (e) {
    message.textContent = t(config.link ? "linkHint" : "loginHint");
    error.textContent = authError(e.code, language);
    button.disabled = false;
  }
};
