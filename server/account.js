import { createHash } from "node:crypto";
import { fault, memberPath } from "./access.js";
// In-app account deletion (App Store Review Guideline 5.1.1(v)).
// The whole account goes: journals, profile, membership record, usage counters,
// community posts with their comments and reactions, the user's own comments and
// reactions elsewhere, block lists in both directions, reports the user filed,
// the RevenueCat subscriber and finally the Firebase Auth user. Only a hash of
// the UID and a timestamp remain, so a retry after a partial failure is safe.
// Store subscriptions are NOT cancelled by this: the app tells the user to cancel
// in the App Store / Google Play settings, which is the only place that can.
const API_BASE = "https://api.revenuecat.com/v1";
export function createAccountDeletion({
  access,
  deleteUser,
  env = process.env,
  fetch = globalThis.fetch,
  log = (...args) => console.warn(...args),
}) {
  const { store, now } = access;
  async function forgetSubscriber(uid) {
    if (!env.REVENUECAT_SECRET_API_KEY) return "skipped";
    try {
      const response = await fetch(
        `${API_BASE}/subscribers/${encodeURIComponent(uid)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      // 404: RevenueCat never saw this user (no purchase attempt); nothing to remove.
      if (response.ok || response.status === 404) return "deleted";
      log("RevenueCat subscriber deletion failed", { status: response.status });
    } catch (e) {
      log("RevenueCat subscriber deletion failed", { name: e?.name });
    }
    return "failed";
  }
  async function deleteComments(uid) {
    const rows = await store.listGroup("comments", {
      where: [["owner", "==", uid]],
      limit: 500,
    });
    for (const c of rows) {
      const postPath = c.path.replace(/\/comments\/[^/]+$/, "");
      await store.transaction(async (tx) => {
        const p = await tx.get(postPath),
          existing = await tx.get(c.path);
        if (!existing) return;
        tx.delete(c.path);
        if (p)
          tx.set(postPath, {
            ...p,
            commentCount: Math.max(0, (p.commentCount || 0) - 1),
          });
      });
    }
    return rows.length;
  }
  async function deleteReactions(uid) {
    const rows = await store.listGroup("reactions", {
      where: [["owner", "==", uid]],
      limit: 500,
    });
    for (const r of rows) {
      const postPath = r.path.replace(/\/reactions\/[^/]+$/, "");
      await store.transaction(async (tx) => {
        const p = await tx.get(postPath),
          existing = await tx.get(r.path);
        if (!existing) return;
        tx.delete(r.path);
        if (p && existing.stamp)
          tx.set(postPath, {
            ...p,
            reactions: {
              ...p.reactions,
              [existing.stamp]: Math.max(
                0,
                (p.reactions?.[existing.stamp] || 0) - 1,
              ),
            },
          });
      });
    }
    return rows.length;
  }
  async function deletePosts(uid) {
    const posts = await store.list("communityPosts", {
      where: [["owner", "==", uid]],
      limit: 500,
    });
    for (const p of posts) {
      const reports = await store.list("communityReports", {
        where: [["postId", "==", p.id]],
        limit: 500,
      });
      for (const r of reports)
        await store.deleteTree(`communityReports/${r.id}`);
      await store.deleteTree(`communityPosts/${p.id}`);
    }
    return posts.length;
  }
  async function deleteBlocks(uid) {
    // Lists this user kept, then entries where other users blocked this user.
    await store.deleteTree(`communityBlocks/${uid}`);
    const rows = await store.listGroup("targets", {
      where: [["target", "==", uid]],
      limit: 500,
    });
    for (const r of rows) await store.deleteTree(r.path);
  }
  async function deleteReports(uid) {
    const rows = await store.list("communityReports", {
      where: [["reporter", "==", uid]],
      limit: 500,
    });
    for (const r of rows) await store.deleteTree(`communityReports/${r.id}`);
  }
  async function deleteUsage(uid) {
    for (const id of await store.listIds("usage", `${uid}_`, 500))
      await store.deleteTree(`usage/${id}`);
  }
  return {
    // Deletes everything the server holds for the verified, non-anonymous user.
    async deleteAccount(user, body) {
      if (!store || !deleteUser) throw fault(503, "serviceUnavailable");
      if (body?.confirm !== true) throw fault(400, "invalidInput");
      const uid = user.uid;
      const summary = {
        posts: await deletePosts(uid),
        comments: await deleteComments(uid),
        reactions: await deleteReactions(uid),
      };
      await deleteBlocks(uid);
      await deleteReports(uid);
      await deleteUsage(uid);
      await store.deleteTree(`communityStats/${uid}`);
      await store.deleteTree(memberPath(uid));
      await store.deleteTree(`users/${uid}`);
      summary.billing = await forgetSubscriber(uid);
      await store.transaction(async (tx) =>
        tx.set(
          `accountDeletions/${createHash("sha256").update(uid).digest("hex")}`,
          { at: new Date(now()).toISOString() },
        ),
      );
      try {
        await deleteUser(uid);
      } catch (e) {
        if (e?.code !== "auth/user-not-found") throw fault(502, "deleteFailed");
      }
      return { ok: true, ...summary };
    },
  };
}
export function registerAccount(app, { access, asyncRoute, ...rest }) {
  const deletion = createAccountDeletion({ access, ...rest });
  app.post(
    "/api/account/delete",
    asyncRoute(async (req, res) => {
      const user = await access.user(req);
      res.json(await deletion.deleteAccount(user, req.body));
    }),
  );
  return deletion;
}
