import { createCloudClient } from "./core/cloud-client.js";
import { loadFirebase } from "./core/firebase-sdk.js";
const cloud = (window.YumetanCloud = {
  state: { enabled: false, user: null, error: null },
});
cloud.ready = (async () => {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg?.apiKey || !cfg.projectId) return cloud.state;
  try {
    const [{ initializeApp }, A, fs] = await loadFirebase();
    const app = initializeApp(cfg),
      auth = A.getAuth(app);
    await A.setPersistence(auth, A.indexedDBLocalPersistence);
    await auth.authStateReady();
    if (!auth.currentUser) {
      try {
        await A.signInAnonymously(auth);
      } catch {}
    }
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
  return cloud.state;
})();
