import { createCloudClient } from "./core/cloud-client.js";
const cloud = (window.YumetanCloud = {
  state: { enabled: false, user: null, error: null },
});
cloud.ready = (async () => {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg?.apiKey || !cfg.projectId) return cloud.state;
  try {
    const V = "10.14.1";
    const [{ initializeApp, deleteApp }, A, fs] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    ]);
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
    Object.assign(
      cloud,
      createCloudClient({ A, fs, auth, db, initializeApp, deleteApp }),
    );
  } catch (e) {
    cloud.state.error = e.code || "auth/unavailable";
  }
  return cloud.state;
})();
