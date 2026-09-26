import { createHash } from "node:crypto";
import { z } from "zod/v4";
import { TYPES } from "../public/core/types.js";
import {
  STAMP_IDS,
  PLANS,
  TEASER_CHARS,
  activePlan,
} from "../public/core/plans.js";
import { fault, memberPath, dayKey } from "./access.js";
const ident = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
// How many posts one timeline or teaser request reads at most while skipping
// private ones, and in what batches.
const SCAN_BATCH = 50;
const SCAN_LIMIT = 400;
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
// A post's stamp counts, keeping only stamps still offered.
const stampsOf = (p) =>
  Object.fromEntries(
    STAMP_IDS.filter((id) => Number(p.reactions?.[id]) > 0).map((id) => [
      id,
      Number(p.reactions[id]),
    ]),
  );
const publicPost = (p) => ({
  id: p.id,
  title: p.title,
  text: p.text,
  alias: p.alias,
  typeId: p.typeId,
  characterSet: p.characterSet,
  publishedAt: p.publishedAt,
  reactions: stampsOf(p),
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
    // Sharing is part of the free plan, so a post stays visible whatever its
    // author pays; only privacy, moderation and suspension hide one.
    if (!p.public || p.hidden) throw fault(404, "postUnavailable");
    if ((await access.member(p.owner)).suspended)
      throw fault(404, "postUnavailable");
    return p;
  }
  // The stamp `uid` gave post `id`, if any.
  async function stampOf(uid, id) {
    return (
      (await store.get(`communityPosts/${id}/reactions/${uid}`))?.stamp || null
    );
  }
  // Public posts, newest first, found without a composite index. Filtering on
  // `public` while ordering by `sortKey` needs one, and on a project where it
  // was never deployed every timeline request failed (FAILED_PRECONDITION, an
  // internal error to the app). Walking the automatic single-field `sortKey`
  // order and keeping the public posts needs none. `stop` ends the walk at the
  // first post it accepts (the teaser stops before yesterday).
  async function publicPosts({ after, want, stop = () => false }) {
    const found = [];
    let cursor = after,
      more = true,
      scanned = 0;
    while (found.length < want && more && scanned < SCAN_LIMIT) {
      const batch = await store.list("communityPosts", {
        orderBy: "sortKey",
        direction: "desc",
        after: cursor,
        limit: SCAN_BATCH,
      });
      scanned += batch.length;
      more = batch.length === SCAN_BATCH;
      for (const p of batch) {
        if (stop(p)) {
          more = false;
          break;
        }
        cursor = p.sortKey;
        if (!p.public) continue;
        found.push(p);
        if (found.length === want) break;
      }
    }
    return {
      posts: found,
      // Where the next page starts, if there may be one.
      next: more || found.length === want ? cursor || null : null,
    };
  }
  // A member's own public posts: one equality filter, so no composite index.
  async function ownPublic(uid, limit) {
    const rows = await store.list("communityPosts", {
      where: [["owner", "==", uid]],
      limit: 500,
    });
    return rows.filter((p) => p.public).slice(0, limit);
  }
  route("get", "/api/community/mine", async (req, user) => {
    const posts = await ownPublic(user.uid, 100);
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
  // Free members: their own posts in full, plus a daily teaser of a few of
  // today's other posts — name and title whole, TEASER_CHARS of the dream —
  // chosen per user and day so reloading never reveals more of the feed.
  route("get", "/api/community/teaser", async (req, user) => {
    const day = req.query.day
      ? parse(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), req.query.day)
      : dayKey(now());
    // Minutes to add to local midnight to reach UTC, as Date#getTimezoneOffset.
    const tz = req.query.tz
      ? parse(z.coerce.number().int().min(-840).max(840), req.query.tz)
      : 0;
    const start = Date.parse(`${day}T00:00:00Z`) + tz * 60000,
      end = start + 86400000;
    if (!Number.isFinite(start)) throw fault(400, "invalidInput");
    // Newest first, so the walk ends at the first post from before this day.
    const { posts: batch } = await publicPosts({
      want: 60,
      stop: (p) => Date.parse(p.publishedAt) < start,
    });
    const today = [];
    for (const p of batch) {
      const at = Date.parse(p.publishedAt);
      if (!(at >= start && at < end) || p.owner === user.uid) continue;
      try {
        await visible(user.uid, p.id);
        today.push(p);
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    const seed = createHash("sha256")
      .update(`${user.uid}:${day}`)
      .digest("hex");
    const rank = (p) =>
      createHash("sha256")
        .update(seed + p.id)
        .digest("hex");
    const picked = today
      .sort((a, b) => rank(a).localeCompare(rank(b)))
      .slice(0, PLANS.free.teaserPosts);
    const teasers = picked.map((p) => {
      const chars = Array.from(p.text);
      return {
        id: p.id,
        alias: p.alias,
        title: p.title,
        typeId: p.typeId,
        characterSet: p.characterSet,
        publishedAt: p.publishedAt,
        mine: false,
        // Free members see how others reacted, but cannot react themselves.
        reactions: stampsOf(p),
        excerpt: chars.slice(0, TEASER_CHARS).join(""),
        truncated: chars.length > TEASER_CHARS,
      };
    });
    // Own posts are the member's own writing, so they are never shortened and
    // never take one of the teaser slots.
    const own = await ownPublic(user.uid, 50);
    const mine = own
      .filter((p) => !p.hidden)
      .map((p) => ({ ...publicPost(p), mine: true }))
      .sort((a, b) => String(b.publishedAt).localeCompare(a.publishedAt))
      .slice(0, 20);
    return {
      day,
      total: today.length,
      posts: [...mine, ...teasers].sort((a, b) =>
        String(b.publishedAt).localeCompare(a.publishedAt),
      ),
    };
  });
  route("get", "/api/community/feed", async (req, user) => {
    await access.paid(user.uid);
    const after = req.query.after
      ? parse(z.string().regex(/^[0-9TZ:._a-f-]{1,100}$/), req.query.after)
      : undefined;
    const page = await publicPosts({ after, want: 20 });
    const batch = page.posts;
    // The member's own public posts appear in the timeline too, marked `mine`;
    // they never cost a read and are shown even while hidden or expired.
    const posts = [];
    for (const p of batch) {
      if (p.owner === user.uid) {
        posts.push({ ...publicPost(p), mine: true });
        continue;
      }
      try {
        await visible(user.uid, p.id);
        posts.push({
          ...publicPost(p),
          mine: false,
          stamp: await stampOf(user.uid, p.id),
        });
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    const { limits } = await access.paid(user.uid);
    const usage =
      (await store.get(`usage/${user.uid}_d_${dayKey(now())}`)) || {};
    const remaining = limits.reads - (usage.reads || 0);
    if (remaining <= 0 && posts.some((p) => !p.mine))
      throw fault(429, "quotaReached");
    // A page never silently drops items because of quota; its final page is the
    // remaining allowance of other members' posts, plus any of the member's own.
    const shown = [];
    let reads = 0;
    for (const p of posts) {
      if (p.mine) shown.push(p);
      else if (reads < remaining) {
        shown.push(p);
        reads += 1;
      }
    }
    if (reads) await access.consume(user.uid, "reads", reads);
    return {
      posts: shown,
      next: shown.length === posts.length ? page.next : null,
    };
  });
  // Sharing a dream is part of the free plan; the daily and active allowances
  // still apply, and reading other members' dreams stays paid.
  route("post", "/api/community/publish", async (req, user) => {
    const data = parse(postInput, req.body);
    await moderate(`${data.alias}\n${data.title}\n${data.text}`);
    const id = postId(user.uid, data.recordId),
      path = `communityPosts/${id}`;
    await store.transaction(async (tx) => {
      const member = await tx.get(memberPath(user.uid));
      const plan = activePlan(member, now());
      if (member?.suspended) throw fault(403, "accountSuspended");
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
    // A member can always open their own post; reading another member's is paid.
    const p = await visible(user.uid, pathId(req), true);
    if (p.owner !== user.uid) {
      await access.paid(user.uid);
      await access.consume(user.uid, "reads");
    }
    const mine = p.owner === user.uid;
    return {
      post: { ...publicPost(p), mine },
      reaction: mine ? null : await stampOf(user.uid, p.id),
    };
  });
  // A paid member's stamp on another member's post: one per post, a new one
  // replaces it, and `null` takes it back. Answers the post's counts after it.
  route("post", "/api/community/posts/:id/reaction", async (req, user) => {
    await access.paid(user.uid);
    const { stamp } = parse(
      z.object({ stamp: z.enum(STAMP_IDS).nullable() }),
      req.body,
    );
    const p = await visible(user.uid, pathId(req));
    if (p.owner === user.uid) throw fault(400, "invalidInput");
    // Taking a stamp back is free; giving one counts against the day.
    if (stamp) await access.consume(user.uid, "reactions");
    const reactions = await store.transaction(async (tx) => {
      const path = `communityPosts/${p.id}`,
        fresh = await tx.get(path),
        reactionPath = `${path}/reactions/${user.uid}`,
        old = await tx.get(reactionPath);
      if (!fresh?.public || fresh.hidden) throw fault(404, "postUnavailable");
      const counts = { ...fresh.reactions };
      if (old?.stamp)
        counts[old.stamp] = Math.max(0, (counts[old.stamp] || 0) - 1);
      if (stamp) counts[stamp] = (counts[stamp] || 0) + 1;
      tx.set(path, { ...fresh, reactions: counts });
      if (stamp) tx.set(reactionPath, { stamp, owner: user.uid });
      else tx.delete(reactionPath);
      return counts;
    });
    return { reactions: stampsOf({ reactions }), stamp };
  });
}
