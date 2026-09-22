// Loads the Firebase Web SDK. The bundles are shipped with the app
// (public/vendor/firebase, see scripts/vendor-firebase.mjs) so a phone does not
// have to download them from the CDN at every launch; the CDN is only a fallback.
export const FIREBASE_SDK_VERSION = "10.14.1";
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/`;
const LOCAL = new URL("../vendor/firebase/", import.meta.url).href;
export async function loadFirebase(modules = ["app", "auth", "firestore"]) {
  const load = (base) =>
    Promise.all(modules.map((m) => import(`${base}firebase-${m}.js`)));
  try {
    return await load(LOCAL);
  } catch (error) {
    console.warn("Bundled Firebase SDK unavailable, using CDN", error);
    return load(CDN);
  }
}
