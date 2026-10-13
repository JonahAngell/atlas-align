import express from "express";

export function createIdentityRouter(ctx) {
  const {
    IMPERSONATION_COOKIE,
    auditAccessForUser,
    canReplaceSourceLibrary,
    clearImpersonationCookie,
    cookieValue,
    impersonationCookieOptions,
    inAppValidationEnabled,
    invalidateImpersonationToken,
    isLocalAppEnv,
    logImpersonation,
    normalizedRoleSlugs,
    path,
    pool,
    publicWorkflowFeatureFlags,
    refreshImpersonationCandidates,
    refreshImpersonationProfile,
    renewImpersonation,
    requireCurrentUser,
    rootDir,
    sanitizedUserMetadata,
    searchUserProfiles,
    startImpersonation,
    studioshareApiUrl,
    userImpersonationEnabled,
    userMetadataDebugEnabled,
    workflowFlags,
  } = ctx;
  const router = express.Router();
  router.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "health_failed",
        message: error.message,
      }),
    );
    res.status(503).json({ status: "unavailable" });
  }
});

  router.get("/api/me", requireCurrentUser, (req, res) => {
  const { id, username, fullName, email, avatar } = req.studioshareUser;
  const roles = normalizedRoleSlugs(req.studioshareUser);
  const capabilities = {
    canReplaceSourceLibrary: canReplaceSourceLibrary(req.studioshareUser),
  };
  const access = auditAccessForUser(req.studioshareUser);
  const payload = {
    id,
    username,
    fullName,
    email,
    avatar: avatar || null,
    roles,
    capabilities,
    access,
    impersonation: req.impersonation || {
      enabled: userImpersonationEnabled(),
      active: false,
    },
    validation: inAppValidationEnabled()
      ? {
          enabled: true,
          authenticatedUserId: req.authenticatedStudioshareUser.id,
          effectiveProfileId: req.studioshareUser.id,
        }
      : { enabled: false },
  };
  if (userMetadataDebugEnabled()) {
    payload.debugMetadata = {
      upstreamUser: sanitizedUserMetadata(req.studioshareUser),
      atlas: { roles, capabilities, access },
    };
  }
  res.json(payload);
});

  router.get(
  "/api/validation/read-only-isolation.js",
  requireCurrentUser,
  (_req, res) => {
    if (!inAppValidationEnabled())
      return res.status(404).json({ error: "Not found." });
    res
      .set("Cache-Control", "no-store")
      .type("application/javascript")
      .sendFile(
        path.join(rootDir, "validation", "validation-read-only-isolation.js"),
      );
  },
);

  router.get(
  "/api/impersonation/profiles",
  requireCurrentUser,
  async (req, res, next) => {
    if (!userImpersonationEnabled())
      return res.status(404).json({ error: "Not found." });
    try {
      const items = await refreshImpersonationCandidates(pool, req);
      res
        .set("Cache-Control", "no-store")
        .json({ items, currentProfileId: req.studioshareUser.id });
    } catch (error) {
      next(error);
    }
  },
);
  router.post("/api/impersonation", requireCurrentUser, async (req, res, next) => {
  if (!userImpersonationEnabled())
    return res.status(404).json({ error: "Not found." });
  try {
    const authenticated = req.authenticatedStudioshareUser;
    const profileId = String(req.body?.profileId || "").trim();
    if (!profileId)
      return res.status(400).json({ error: "A profile is required." });
    const previous = cookieValue(req, IMPERSONATION_COOKIE);
    if (profileId === String(authenticated.id)) {
      if (previous)
        await invalidateImpersonationToken(
          pool,
          previous,
          "returned_to_profile",
        );
      clearImpersonationCookie(res, req);
      logImpersonation("impersonation_returned", {
        authenticatedUserId: authenticated.id,
      });
      return res.set("Cache-Control", "no-store").json({ active: false });
    }
    const validation = await refreshImpersonationProfile(pool, req, profileId);
    if (!validation.ok)
      return res
        .status(409)
        .json({ error: "The selected profile's roles could not be verified." });
    const session = await startImpersonation(pool, authenticated.id, profileId);
    if (!session)
      return res
        .status(404)
        .json({ error: "The selected profile is unavailable." });
    if (previous)
      await invalidateImpersonationToken(pool, previous, "profile_switched");
    res.cookie(
      IMPERSONATION_COOKIE,
      session.token,
      impersonationCookieOptions(req),
    );
    logImpersonation("impersonation_started", {
      authenticatedUserId: authenticated.id,
      effectiveProfileId: profileId,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
    });
    res.set("Cache-Control", "no-store").json({
      active: true,
      effectiveProfileId: profileId,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    next(error);
  }
});
  router.post(
  "/api/impersonation/renew",
  requireCurrentUser,
  async (req, res, next) => {
    if (!userImpersonationEnabled())
      return res.status(404).json({ error: "Not found." });
    const token = cookieValue(req, IMPERSONATION_COOKIE);
    try {
      const validation = token
        ? await refreshImpersonationProfile(pool, req, req.studioshareUser.id)
        : { ok: false };
      const renewed =
        token &&
        validation.ok &&
        (await renewImpersonation(
          pool,
          token,
          req.authenticatedStudioshareUser.id,
        ));
      if (!renewed) {
        if (token)
          await invalidateImpersonationToken(pool, token, "renewal_failed");
        clearImpersonationCookie(res, req);
        logImpersonation("impersonation_renewal_failed", {
          authenticatedUserId: req.authenticatedStudioshareUser.id,
        });
        return res
          .status(409)
          .json({ error: "The impersonation session could not be renewed." });
      }
      res.cookie(IMPERSONATION_COOKIE, token, impersonationCookieOptions(req));
      logImpersonation("impersonation_renewed", {
        authenticatedUserId: req.authenticatedStudioshareUser.id,
        effectiveProfileId: renewed.effectiveProfileId,
        sessionId: renewed.id,
        expiresAt: renewed.expiresAt,
      });
      res
        .set("Cache-Control", "no-store")
        .json({ active: true, expiresAt: renewed.expiresAt });
    } catch (error) {
      next(error);
    }
  },
);
  router.delete("/api/impersonation", requireCurrentUser, async (req, res, next) => {
  if (!userImpersonationEnabled())
    return res.status(404).json({ error: "Not found." });
  try {
    const token = cookieValue(req, IMPERSONATION_COOKIE);
    if (token)
      await invalidateImpersonationToken(pool, token, "returned_to_profile");
    clearImpersonationCookie(res, req);
    logImpersonation("impersonation_returned", {
      authenticatedUserId: req.authenticatedStudioshareUser.id,
      effectiveProfileId: req.studioshareUser.id,
    });
    res.set("Cache-Control", "no-store").status(204).end();
  } catch (error) {
    next(error);
  }
});

  router.get("/api/workflow/features", requireCurrentUser, (_req, res) =>
  res.json({ features: publicWorkflowFeatureFlags(workflowFlags) }),
);

  router.get("/api/users", requireCurrentUser, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2)
    return res
      .status(400)
      .json({ error: "Enter at least two characters to search for users." });
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const size = Math.min(
    25,
    Math.max(1, Number.parseInt(req.query.size, 10) || 10),
  );
  if (isLocalAppEnv()) {
    try {
      const matches = await searchUserProfiles(pool, q, 25);
      const start = (page - 1) * size;
      const items = matches.slice(start, start + size).map((user) => ({
        id: String(user.id || "").trim(),
        username: String(user.username || "").trim(),
        fullName: String(user.fullName || "").trim(),
        email: String(user.email || "").trim(),
        avatar: user.avatar || null,
        disabled: user.disabled === true,
      }));
      return res.json({
        items,
        number: page,
        size,
        totalItems: matches.length,
        totalPages: Math.max(1, Math.ceil(matches.length / size)),
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "user_search_failed",
          message: error.message,
        }),
      );
      return res.status(502).json({ error: "User search is unavailable." });
    }
  }
  const accessToken = cookieValue(req, "access_token");
  const url = new URL(`${studioshareApiUrl.replace(/\/$/, "")}/core/users`);
  url.searchParams.set("q", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_error) {}
    if (!response.ok) {
      const status = [400, 401, 403, 404, 429].includes(response.status)
        ? response.status
        : 502;
      const messages = {
        400: "The user search request was invalid.",
        401: "Authentication is required.",
        403: "User search is not permitted.",
        404: "The user directory is unavailable.",
        429: "User search is temporarily rate limited.",
      };
      return res.status(status).json({
        error:
          messages[response.status] ||
          "StudioShare user search is unavailable.",
      });
    }
    const items = (Array.isArray(payload?.items) ? payload.items : [])
      .map(({ id, username, fullName, email, avatar, disabled }) => ({
        id: String(id || "").trim(),
        username: String(username || "").trim(),
        fullName: String(fullName || "").trim(),
        email: String(email || "").trim(),
        avatar: avatar || null,
        disabled: disabled === true,
      }))
      .filter((user) => (user.id || user.username) && !user.disabled);
    res.json({
      items,
      number: payload?.number || page,
      size: payload?.size || size,
      totalItems: payload?.totalItems || items.length,
      totalPages: payload?.totalPages || 1,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "user_search_failed",
        message: error.message,
      }),
    );
    res.status(502).json({ error: "StudioShare user search is unavailable." });
  }
});
  return router;
}
