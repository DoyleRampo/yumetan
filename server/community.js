import { createHash } from "node:crypto";
import { z } from "zod/v4";
import { TYPES } from "../public/core/types.js";
import { STAMPS, PLANS, activePlan } from "../public/core/plans.js";
import { fault, memberPath, dayKey } from "./access.js";
const ident = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const postInput = z.object({
  recordId: ident,
  title: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(4000),
  alias: z.string().trim().min(1).max(30),
  typeId: z.enum(TYPES.map((t) => t.id)),
  characterSet: z.enum(["human", "animal"]),
  consent: z.literal(true),
});
const parse = (schema, body) => {
  const r = schema.safeParse(body);
  if (!r.success) throw fault(400, "invalidInput");
  return r.data;
};
const postId = (uid, recordId) =>
  createHash("sha256").update(`${uid}:${recordId}`).digest("hex");
const publicPost = (p) => ({
  id: p.id,
  title: p.title,
  text: p.text,
  alias: p.alias,
  typeId: p.typeId,
  characterSet: p.characterSet,
  publishedAt: p.publishedAt,
  reactions: p.reactions || {},
  commentCount: p.commentCount || 0,
});
export function registerCommunity(
  app,
  { access, asyncRoute, moderate = async () => {} },
) {
  const { store, now } = access;
  const route = (method, path, fn) =>
    app[method](
      path,
      asyncRoute(async (req, res) => {
        const user = await access.user(req);
        res.json(await fn(req, user));
      }),
    );
  const pathId = (req) => parse(ident, req.params.id);
  async function visible(uid, id, ownerOK = false) {
    const p = await store.get(`communityPosts/${id}`);
    if (!p) throw fault(404, "postUnavailable");
    if (ownerOK && p.owner === uid) return p;
    if (
      !p.public ||
      p.hidden ||
      activePlan(await access.member(p.owner), now()) === "free"
    )
      throw fault(404, "postUnavailable");
    if (
      (await access.member(p.owner)).suspended ||
      (await blocked(uid, p.owner))
    )
      throw fault(404, "postUnavailable");
    return p;
  }
  async function blocked(a, b) {
    return Boolean(
      (await store.get(`communityBlocks/${a}/targets/${b}`)) ||
      (await store.get(`communityBlocks/${b}/targets/${a}`)),
    );
  }
  route("get", "/api/community/mine", async (req, user) => {
    const posts = await store.list("communityPosts", {
      where: [
        ["owner", "==", user.uid],
        ["public", "==", true],
      ],
      limit: 100,
    });
    return {
      posts: posts.map((p) => ({
        ...publicPost(p),
        recordId: p.recordId,
        public: p.public,
        hidden: Boolean(p.hidden),
      })),
    };
  });
  route("get", "/api/community/record/:id", async (req, user) => {
    const p = await store.get(
      `communityPosts/${postId(user.uid, pathId(req))}`,
    );
    return {
      post: p
        ? { ...publicPost(p), public: p.public, hidden: Boolean(p.hidden) }
        : null,
    };
  });
  route("get", "/api/community/feed", async (req, user) => {
    await access.paid(user.uid);
    const after = req.query.after
      ? parse(z.string().regex(/^[0-9TZ:._a-f-]{1,100}$/), req.query.after)
      : undefined;
    const batch = await store.list("communityPosts", {
      where: [["public", "==", true]],
      orderBy: "sortKey",
      direction: "desc",
      after,
      limit: 20,
    });
    const posts = [];
    for (const p of batch) {
      if (p.owner === user.uid) continue;
      try {
        await visible(user.uid, p.id);
        posts.push(publicPost(p));
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    const { limits } = await access.paid(user.uid);
    const usage =
      (await store.get(`usage/${user.uid}_d_${dayKey(now())}`)) || {};
    const remaining = limits.reads - (usage.reads || 0);
    if (remaining <= 0) throw fault(429, "quotaReached");
    // A page never silently drops items because of quota; its final page is the remaining allowance.
    const shown = posts.slice(0, remaining);
    if (shown.length) await access.consume(user.uid, "reads", shown.length);
    return {
      posts: shown,
      next:
        batch.length === 20 && shown.length === posts.length
          ? batch.at(-1).sortKey
          : null,
    };
  });
  route("post", "/api/community/publish", async (req, user) => {
    const data = parse(postInput, req.body);
    await access.paid(user.uid);
    await moderate(`${data.alias}\n${data.title}\n${data.text}`);
    const id = postId(user.uid, data.recordId),
      path = `communityPosts/${id}`;
    await store.transaction(async (tx) => {
      const member = await tx.get(memberPath(user.uid));
      const plan = activePlan(member, now());
      if (plan === "free") throw fault(403, "paidRequired");
      if (member.suspended) throw fault(403, "accountSuspended");
      const old = await tx.get(path);
      if (old?.hidden) throw fault(403, "postUnavailable");
      const statsPath = `communityStats/${user.uid}`,
        stats = (await tx.get(statsPath)) || { active: 0 };
      const usagePath = `usage/${user.uid}_d_${dayKey(now())}`,
        usage = (await tx.get(usagePath)) || {};
      if (
        !old?.public &&
        ((usage.publishes || 0) >= PLANS[plan].publishes ||
          stats.active >= PLANS[plan].activePosts)
      )
        throw fault(429, "quotaReached");
      const date = new Date(now()).toISOString();
      tx.set(path, {
        ...old,
        ...data,
        id,
        owner: user.uid,
        public: true,
        hidden: false,
        publishedAt: old?.publishedAt || date,
        sortKey: old?.sortKey || `${date}_${id}`,
        updatedAt: date,
      });
      if (!old?.public) {
        tx.set(statsPath, { active: stats.active + 1 });
        tx.set(usagePath, { ...usage, publishes: (usage.publishes || 0) + 1 });
      }
    });
    return { id };
  });
  // Owners retain privacy controls even after their subscription expires.
  route("post", "/api/community/posts/:id/private", async (req, user) => {
    const id = pathId(req);
    await store.transaction(async (tx) => {
      const path = `communityPosts/${id}`,
        p = await tx.get(path);
      if (!p || p.owner !== user.uid) throw fault(404, "postUnavailable");
      const statsPath = `communityStats/${user.uid}`,
        stats = (await tx.get(statsPath)) || { active: 0 };
      tx.set(path, { ...p, public: false, text: "", title: "", alias: "" });
      if (p.public)
        tx.set(statsPath, { active: Math.max(0, stats.active - 1) });
    });
    return { ok: true };
  });
  route("get", "/api/community/posts/:id", async (req, user) => {
    await access.paid(user.uid);
    const p = await visible(user.uid, pathId(req), true);
    if (p.owner !== user.uid) await access.consume(user.uid, "reads");
    const after = req.query.after ? parse(ident, req.query.after) : undefined;
    const rows = await store.list(`communityPosts/${p.id}/comments`, {
      after,
      limit: 30,
    });
    const comments = [];
    for (const c of rows)
      if (!c.hidden && !(await blocked(user.uid, c.owner)))
        comments.push({
          id: c.id,
          text: c.text,
          alias: c.alias,
          createdAt: c.createdAt,
          mine: c.owner === user.uid,
        });
    const reaction = await store.get(
      `communityPosts/${p.id}/reactions/${user.uid}`,
    );
    return {
      post: { ...publicPost(p), mine: p.owner === user.uid },
      comments,
      next: rows.length === 30 ? rows.at(-1).id : null,
      reaction: reaction?.stamp || null,
    };
  });
  route("post", "/api/community/posts/:id/reaction", async (req, user) => {
    await access.paid(user.uid);
    const { stamp } = parse(
      z.object({ stamp: z.enum(STAMPS).nullable() }),
      req.body,
    );
    const p = await visible(user.uid, pathId(req));
    if (p.owner === user.uid) throw fault(400, "invalidInput");
    await access.consume(user.uid, "reactions");
    await store.transaction(async (tx) => {
      const path = `communityPosts/${p.id}`,
        fresh = await tx.get(path),
        reactionPath = `${path}/reactions/${user.uid}`,
        old = await tx.get(reactionPath);
      if (!fresh?.public || fresh.hidden) throw fault(404, "postUnavailable");
      const reactions = { ...fresh.reactions };
      if (old?.stamp)
        reactions[old.stamp] = Math.max(0, (reactions[old.stamp] || 0) - 1);
      if (stamp) reactions[stamp] = (reactions[stamp] || 0) + 1;
      tx.set(path, { ...fresh, reactions });
      if (stamp) tx.set(reactionPath, { stamp });
      else tx.delete(reactionPath);
    });
    return { ok: true };
  });
  route("post", "/api/community/posts/:id/comments", async (req, user) => {
    await access.paid(user.uid);
    const data = parse(
      z.object({
        text: z.string().trim().min(1).max(500),
        alias: z.string().trim().min(1).max(30),
        requestId: z.string().uuid(),
      }),
      req.body,
    );
    const p = await visible(user.uid, pathId(req));
    await moderate(`${data.alias}\n${data.text}`);
    const commentPath = `communityPosts/${p.id}/comments/${data.requestId}`;
    await store.transaction(async (tx) => {
      const existing = await tx.get(commentPath);
      if (existing) {
        if (existing.owner !== user.uid) throw fault(409, "invalidInput");
        return;
      }
      const fresh = await tx.get(`communityPosts/${p.id}`),
        member = await tx.get(memberPath(user.uid));
      const plan = activePlan(member, now());
      if (plan === "free" || member.suspended) throw fault(403, "paidRequired");
      if (!fresh?.public || fresh.hidden) throw fault(404, "postUnavailable");
      const usagePath = `usage/${user.uid}_d_${dayKey(now())}`,
        usage = (await tx.get(usagePath)) || {};
      if (
        (usage.comments || 0) >= PLANS[plan].comments ||
        (fresh.commentCount || 0) >= 300
      )
        throw fault(429, "quotaReached");
      tx.set(usagePath, { ...usage, comments: (usage.comments || 0) + 1 });
      tx.set(commentPath, {
        text: data.text,
        alias: data.alias,
        owner: user.uid,
        createdAt: new Date(now()).toISOString(),
      });
      tx.set(`communityPosts/${p.id}`, {
        ...fresh,
        commentCount: (fresh.commentCount || 0) + 1,
      });
    });
    return { ok: true };
  });
  route(
    "post",
    "/api/community/posts/:id/comments/:commentId/delete",
    async (req, user) => {
      const id = pathId(req),
        commentId = parse(ident, req.params.commentId);
      await store.transaction(async (tx) => {
        const path = `communityPosts/${id}`,
          p = await tx.get(path),
          cp = `${path}/comments/${commentId}`,
          c = await tx.get(cp);
        if (!p || !c || (c.owner !== user.uid && p.owner !== user.uid))
          throw fault(404, "postUnavailable");
        tx.delete(cp);
        tx.set(path, {
          ...p,
          commentCount: Math.max(0, (p.commentCount || 0) - 1),
        });
      });
      return { ok: true };
    },
  );
  route("post", "/api/community/posts/:id/report", async (req, user) => {
    await access.paid(user.uid);
    const p = await visible(user.uid, pathId(req));
    const { reason, commentId } = parse(
      z.object({
        reason: z.enum(["privacy", "abuse", "spam", "other"]),
        commentId: ident.optional(),
      }),
      req.body,
    );
    if (
      commentId &&
      !(await store.get(`communityPosts/${p.id}/comments/${commentId}`))
    )
      throw fault(404, "postUnavailable");
    await store.transaction(async (tx) =>
      tx.set(`communityReports/${postId(user.uid, p.id + (commentId || ""))}`, {
        postId: p.id,
        commentId: commentId || null,
        reporter: user.uid,
        reason,
        status: "open",
        at: new Date(now()).toISOString(),
      }),
    );
    return { ok: true };
  });
  route("post", "/api/community/posts/:id/block", async (req, user) => {
    await access.paid(user.uid);
    const p = await visible(user.uid, pathId(req));
    if (p.owner === user.uid) throw fault(400, "invalidInput");
    await store.transaction(async (tx) =>
      tx.set(`communityBlocks/${user.uid}/targets/${p.owner}`, {
        alias: p.alias,
        at: new Date(now()).toISOString(),
      }),
    );
    return { ok: true };
  });
  route("get", "/api/community/blocks", async (req, user) => ({
    blocks: await store.list(`communityBlocks/${user.uid}/targets`, {
      limit: 100,
    }),
  }));
  route("post", "/api/community/blocks/:id/remove", async (req, user) => {
    await store.transaction(async (tx) =>
      tx.delete(`communityBlocks/${user.uid}/targets/${pathId(req)}`),
    );
    return { ok: true };
  });
  route("get", "/api/moderation/reports", async (req, user) => {
    if (user.moderator !== true) throw fault(403, "forbidden");
    const rows = await store.list("communityReports", {
      where: [["status", "==", "open"]],
      limit: 50,
    });
    return {
      reports: await Promise.all(
        rows.map(async (report) => ({
          ...report,
          content: await store.get(
            `communityPosts/${report.postId}${report.commentId ? `/comments/${report.commentId}` : ""}`,
          ),
        })),
      ),
    };
  });
  route("post", "/api/moderation/reports/:id", async (req, user) => {
    if (user.moderator !== true) throw fault(403, "forbidden");
    const { action } = parse(
      z.object({ action: z.enum(["dismiss", "hide"]) }),
      req.body,
    );
    await store.transaction(async (tx) => {
      const reportPath = `communityReports/${pathId(req)}`,
        report = await tx.get(reportPath);
      if (!report) throw fault(404, "postUnavailable");
      const targetPath = `communityPosts/${report.postId}${report.commentId ? `/comments/${report.commentId}` : ""}`,
        target = await tx.get(targetPath);
      if (action === "hide" && target)
        tx.set(targetPath, { ...target, hidden: true });
      tx.set(reportPath, {
        ...report,
        status: action,
        resolvedBy: user.uid,
        resolvedAt: new Date(now()).toISOString(),
      });
    });
    return { ok: true };
  });
}
