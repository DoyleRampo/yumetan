// All service collections live outside /users, so client Firestore rules deny access.
import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
} from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
export function firebaseServices(env = process.env) {
  if (!env.FIREBASE_PROJECT_ID) return null;
  const app =
    getApps()[0] ||
    initializeApp({
      projectId: env.FIREBASE_PROJECT_ID,
      credential: env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON))
        : applicationDefault(),
    });
  return {
    store: new FirestoreStore(
      getFirestore(app, env.FIRESTORE_DATABASE_ID || "(default)"),
    ),
    verify: (token) => getAuth(app).verifyIdToken(token, true),
    mint: (uid) => getAuth(app).createCustomToken(uid),
    getUser: (uid) => getAuth(app).getUser(uid),
    deleteUser: (uid) => getAuth(app).deleteUser(uid),
  };
}
export class FirestoreStore {
  constructor(db) {
    this.db = db;
  }
  async get(path) {
    return (await this.db.doc(path).get()).data() || null;
  }
  query(collection, opts = {}) {
    let q = this.db.collection(collection);
    for (const [key, op, value] of opts.where || [])
      q = q.where(key, op, value);
    q = q.orderBy(opts.orderBy || "__name__", opts.direction || "asc");
    if (opts.after) q = q.startAfter(opts.after);
    return q.limit(opts.limit || 20);
  }
  async list(collection, opts) {
    return (await this.query(collection, opts).get()).docs.map((d) => ({
      ...d.data(),
      id: d.id,
    }));
  }
  // Documents of one collection group (e.g. every post's "comments") matching a field.
  // Rows carry their full document path so callers can delete them.
  async listGroup(collectionId, opts = {}) {
    let q = this.db.collectionGroup(collectionId);
    for (const [key, op, value] of opts.where || [])
      q = q.where(key, op, value);
    return (await q.limit(opts.limit || 100).get()).docs.map((d) => ({
      ...d.data(),
      id: d.id,
      path: d.ref.path,
    }));
  }
  // IDs of top-level documents whose ID starts with a prefix (usage/{uid}_…).
  async listIds(collection, prefix, limit = 100) {
    const snap = await this.db
      .collection(collection)
      .where(FieldPath.documentId(), ">=", prefix)
      .where(FieldPath.documentId(), "<", prefix + "\uf8ff")
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.id);
  }
  // Deletes a document together with every nested subcollection.
  async deleteTree(path) {
    await this.db.recursiveDelete(this.db.doc(path));
  }
  async transaction(fn) {
    return this.db.runTransaction(async (tx) =>
      fn({
        get: async (p) => (await tx.get(this.db.doc(p))).data() || null,
        set: (p, data) => tx.set(this.db.doc(p), data),
        delete: (p) => tx.delete(this.db.doc(p)),
      }),
    );
  }
}
