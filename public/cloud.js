import { createCloudClient } from "./core/cloud-client.js";
import { loadFirebase } from "./core/firebase-sdk.js";
const cloud = (window.YumetanCloud = {
  state: { enabled: false, user: null, error: null, stage: null },
});
// Every step is bounded so `ready` always settles; a slow step is skipped and the
// app keeps working (auth state and anonymous sign-in can still arrive later).
const bounded = (promise, ms, fallback) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
cloud.ready = (async () => {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg?.apiKey || !cfg.projectId) return cloud.state;
  const stage = (name) => (cloud.state.stage = name);
  try {
    stage("sdk");
    const [{ initializeApp }, A, fs] = await loadFirebase();
    stage("auth");
    const app = initializeApp(cfg);
    const native = Boolean(window.Capacitor?.isNativePlatform?.());
    // In the Capacitor WebView getAuth() would proactively load Google's popup
    // iframe from the authDomain and block auth initialisation for a long time
    // (the origin is capacitor://localhost). Native sign-in never uses popups here,
    // so initialise without a popup/redirect resolver.
    const auth = native
      ? A.initializeAuth(app, {
          persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence],
        })
      : A.getAuth(app);
    if (!native) await A.setPersistence(auth, A.indexedDBLocalPersistence);
    await bounded(auth.authStateReady(), 10000, null);
    if (!auth.currentUser) {
      stage("anonymous");
      await bounded(
        A.signInAnonymously(auth).catch(() => null),
        10000,
        null,
      );
    }
    stage("firestore");
    const db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({
        tabManager: fs.persistentMultipleTabManager(),
      }),
    });
    Object.assign(cloud, createCloudClient({ A, fs, auth, db }));
  } catch (e) {
    cloud.state.error = String(
      e?.code || e?.message || "auth/unavailable",
    ).slice(0, 120);
  }
  cloud.state.stage = null;
  return cloud.state;
})();
