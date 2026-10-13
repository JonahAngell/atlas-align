import express from "express";
import {
  cachedProfilesForIdentities,
  searchUserProfiles,
  upsertUserProfiles,
} from "./user-profile-repository.js";
import { isLocalAppEnv, localSignedInUser } from "./local-development.js";
import { studioShareJson } from "./studioshare-client.js";
export function createUserProfileRouter({ pool }) {
  const router = express.Router();
  router.get("/", async (req, res, next) => {
    try {
      res.json({
        items: await searchUserProfiles(pool, req.query.q, req.query.size),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post("/me", async (req, res, next) => {
    try {
      const user =
        req.studioshareUser ||
        localSignedInUser() ||
        (await studioShareJson(req, "/me"));
      const [profile] = await upsertUserProfiles(pool, [user], {
        hasLoggedIn: true,
      });
      res.json(profile || {});
    } catch (error) {
      next(error);
    }
  });
  router.get("/directory", async (req, res, next) => {
    try {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) return res.json({ items: [] });
      if (isLocalAppEnv()) {
        const items = await searchUserProfiles(
          pool,
          q,
          Math.min(25, Number(req.query.size) || 10),
        );
        return res.json({ items, totalItems: items.length });
      }
      const params = new URLSearchParams({
        q,
        page: String(req.query.page || 1),
        size: String(Math.min(25, Number(req.query.size) || 10)),
      });
      const payload = await studioShareJson(req, `/core/users?${params}`);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      res.json({ ...payload, items });
    } catch (error) {
      next(error);
    }
  });
  router.post("/resolve", async (req, res, next) => {
    try {
      const requested = Array.isArray(req.body?.users)
        ? req.body.users.slice(0, 50)
        : [];
      const cached = await cachedProfilesForIdentities(pool, requested);
      const byId = new Map(cached.map((user) => [String(user.id), user]));
      const unresolved = requested.filter(
        (user) => user.id && !byId.has(String(user.id)),
      );
      if (!isLocalAppEnv()) {
        for (const identity of unresolved) {
          try {
            const user = await studioShareJson(
              req,
              `/core/users/${encodeURIComponent(identity.id)}`,
            );
            const [profile] = await upsertUserProfiles(pool, [user]);
            if (profile) byId.set(String(profile.id), profile);
          } catch (error) {
            if (![403, 404].includes(error.status)) throw error;
          }
        }
      }
      res.json({ items: [...byId.values()] });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
