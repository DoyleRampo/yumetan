import { providerLogin, credentialLogin } from "./auth-providers.js";
import { mergeAccount, newerProfile } from "./account-sync.js";
import { normalizeRecord, legacyAnswers } from "./storage.js";
export function createCloudClient({
  A,
  fs,
  auth,
  db,
  initializeApp,
  deleteApp,
}) {
  const state = { enabled: true, user: auth.currentUser, A, auth, db, fns: fs };
  const listeners = new Set();
  A.onAuthStateChanged(auth, (user) => {
    const previous = state.user;
    state.user = user;
    state.claims = null;
    // Custom-token sign-ins (native LINE) carry the provider as a claim.
    user?.getIdTokenResult?.().then((r) => {
      if (state.user === user) state.claims = r?.claims || null;
    });
    if (previous?.uid !== user?.uid) listeners.forEach((cb) => cb(user));
  });
  const uid = () => {
    if (!state.user) throw new Error("auth/no-current-user");
    return state.user.uid;
  };
  const root = (owner = uid()) => fs.doc(db, "users", owner);
  const col = (kind, owner = uid()) => fs.collection(root(owner), kind);
  const client = {
    state,
    uid: () => state.user?.uid || "",
    isAnonymous: () => !state.user || state.user.isAnonymous,
    email: () => state.user?.email || "",
    displayName: () => state.user?.displayName || "",
    providers: () => [
      ...new Set([
        ...(state.user?.providerData || []).map((p) => p.providerId),
        ...(state.claims?.provider ? [state.claims.provider] : []),
      ]),
    ],
    idToken: async () => state.user?.getIdToken() || null,
    onUser(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signInProvider(name, opts) {
      const res = await providerLogin(A, auth, name, opts);
      state.user = res.user;
      return res.user;
    },
    async signInCredential(name, opts) {
      const res = await credentialLogin(A, auth, name, opts);
      state.user = res.user;
      if (opts?.displayName && !res.user.displayName && A.updateProfile)
        await A.updateProfile(res.user, {
          displayName: opts.displayName,
        }).catch(() => {});
      return res.user;
    },
    async signInToken(token) {
      const res = await A.signInWithCustomToken(auth, token);
      state.user = res.user;
      state.claims = (await res.user.getIdTokenResult?.())?.claims || null;
      return res.user;
    },
    async signUp(email, password) {
      // Create the account in a throwaway auth instance so the current (guest)
      // session is untouched. Linking the credential to the anonymous user would
      // hand the new account the guest's local profile and quiz answers, skipping
      // onboarding. The user then signs in explicitly, like every other method.
      const app = initializeApp(
        auth.app.options,
        `yumetan-signup-${Date.now()}`,
      );
      try {
        const temp = A.initializeAuth(app, {
          persistence: A.inMemoryPersistence,
        });
        const res = await A.createUserWithEmailAndPassword(
          temp,
          email,
          password,
        );
        await A.signOut(temp);
        return { uid: res.user.uid, email: res.user.email };
      } finally {
        if (deleteApp) await deleteApp(app).catch(() => {});
      }
    },
    async signIn(email, password) {
      const res = await A.signInWithEmailAndPassword(auth, email, password);
      state.user = res.user;
      return res.user;
    },
    // Used only when the server could not delete the account: Firebase requires
    // a recent sign-in for this, which surfaces as auth/requires-recent-login.
    // The journals go first; once the user is gone the rules deny every write,
    // and a surviving profile would restore the old character on the next login.
    // Confirms an email/password account's password so that a stale sign-in can
    // still delete the account from the device (Firebase then counts it as recent).
    async reauthenticate(password) {
      if (!state.user?.email)
        throw Object.assign(new Error("auth/no-current-user"), {
          code: "auth/no-current-user",
        });
      await A.reauthenticateWithCredential(
        state.user,
        A.EmailAuthProvider.credential(state.user.email, password),
      );
    },
    async deleteAccount({ recent = false } = {}) {
      if (!state.user || state.user.isAnonymous)
        throw Object.assign(new Error("auth/no-current-user"), {
          code: "auth/no-current-user",
        });
      // Refuse before touching anything when Firebase would reject the deletion
      // for a stale sign-in, so a failed attempt never leaves a half-empty account.
      if (
        !recent &&
        !(
          Date.now() - Date.parse(state.user.metadata?.lastSignInTime || 0) <
          300000
        )
      )
        throw Object.assign(new Error("auth/requires-recent-login"), {
          code: "auth/requires-recent-login",
        });
      const owner = uid();
      for (const kind of ["dreams", "diary", "deleted"]) {
        const docs = await fs.getDocsFromServer(col(kind, owner));
        for (const entry of docs.docs)
          await fs.deleteDoc(fs.doc(col(kind, owner), entry.id));
      }
      await fs.deleteDoc(root(owner));
      await A.deleteUser(state.user);
      state.user = null;
      try {
        state.user = (await A.signInAnonymously(auth)).user;
      } catch {}
      return state.user;
    },
    async signOut() {
      await A.signOut(auth);
      state.user = null;
      try {
        state.user = (await A.signInAnonymously(auth)).user;
      } catch {}
      return state.user;
    },
    async loadProfile() {
      return (await fs.getDocFromServer(root())).data()?.profile || null;
    },
    async loadOnce() {
      return (await fs.getDocsFromServer(col("dreams"))).docs.map((d) =>
        d.data(),
      );
    },
    async loadDiaryOnce() {
      return (await fs.getDocsFromServer(col("diary"))).docs.map((d) =>
        d.data(),
      );
    },
    async loadSnapshot(owner = uid()) {
      const [dreams, diary, tombstones, profile] = await Promise.all(
        ["dreams", "diary", "deleted"]
          .map((kind) => fs.getDocsFromServer(col(kind, owner)))
          .concat(fs.getDocFromServer(root(owner))),
      );
      return {
        profile: profile.data()?.profile
          ? {
              ...profile.data().profile,
              typeAnswers:
                profile.data().profile.typeAnswers ||
                legacyAnswers(profile.data().typeState),
            }
          : null,
        records: [
          ...dreams.docs.map((d) => d.data()),
          ...diary.docs.map((d) => ({ ...d.data(), kind: "diary" })),
        ],
        deleted: tombstones.docs.map((d) => d.id),
      };
    },
    async syncSnapshot(local) {
      const owner = uid(),
        ensure = () => {
          if (uid() !== owner) throw new Error("auth/account-changed");
        };
      let remote = await this.loadSnapshot(owner);
      ensure();
      const merged = mergeAccount(local, remote);
      let changed = false;
      for (const id of local.deleted || []) {
        if (remote.deleted.includes(id)) continue;
        ensure();
        changed = true;
        await fs.runTransaction(db, async (tx) => {
          const ref = fs.doc(col("deleted", owner), id),
            old = await tx.get(ref);
          if (!old.exists())
            tx.set(ref, { deletedAt: new Date().toISOString() });
          tx.delete(fs.doc(col("dreams", owner), id));
          tx.delete(fs.doc(col("diary", owner), id));
        });
      }
      for (const record of merged.records) {
        ensure();
        const existing = remote.records.find((r) => r.id === record.id);
        if (
          existing &&
          JSON.stringify(normalizeRecord(existing)) === JSON.stringify(record)
        )
          continue;
        changed = true;
        await fs.runTransaction(db, async (tx) => {
          const ref = fs.doc(
            col(record.kind === "diary" ? "diary" : "dreams", owner),
            record.id,
          );
          const [old, deleted] = await Promise.all([
            tx.get(ref),
            tx.get(fs.doc(col("deleted", owner), record.id)),
          ]);
          if (deleted.exists()) return;
          if (
            !old.exists() ||
            Date.parse(record.updatedAt) >
              Date.parse(old.data().updatedAt || old.data().createdAt) ||
            (!old.data().photo &&
              record.photo &&
              record.updatedAt ===
                (old.data().updatedAt || old.data().createdAt))
          )
            tx.set(ref, record);
        });
      }
      if (
        merged.profile &&
        JSON.stringify(merged.profile) !== JSON.stringify(remote.profile)
      ) {
        ensure();
        changed = true;
        await fs.runTransaction(db, async (tx) => {
          const ref = root(owner),
            old = await tx.get(ref),
            profile = newerProfile(merged.profile, old.data()?.profile);
          if (JSON.stringify(profile) !== JSON.stringify(old.data()?.profile))
            tx.set(ref, { profile }, { merge: true });
        });
      }
      // Re-read only when something was written; a new device signing in to an
      // existing account otherwise needs a single round of server reads.
      if (changed) {
        remote = await this.loadSnapshot(owner);
        ensure();
      }
      return mergeAccount({ ...merged, profile: null }, remote);
    },
    watch(cb, onError = () => {}) {
      const owner = uid();
      let timer;
      const changed = (snap) => {
        if (snap.metadata?.hasPendingWrites) return;
        clearTimeout(timer);
        timer = setTimeout(cb, 350);
      };
      const offs = [
        root(owner),
        col("dreams", owner),
        col("diary", owner),
        col("deleted", owner),
      ].map((ref) => fs.onSnapshot(ref, changed, onError));
      return () => {
        clearTimeout(timer);
        offs.forEach((off) => off());
      };
    },
  };
  return client;
}
