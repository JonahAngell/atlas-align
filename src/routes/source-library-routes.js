import express from "express";
import {
  allocateCustomSourceKey,
  canManageCustomSource,
  customSourceCreator,
  customSourceKeyParam,
  CustomSourceValidationError,
  mergeCustomSources,
  validateCustomSourceInput,
} from "../custom-source.js";
import {
  deleteCustomSource,
  insertCustomSource,
  listCustomSourceKeys,
  listCustomSources,
  updateCustomSource,
} from "../custom-source-repository.js";

export function createSourceLibraryRouter(ctx) {
  const {
    fieldLibraryProvenance,
    loadLiveFieldLibrary,
    pool,
    requireCurrentUser,
    sourceLibraryAccessDecision,
    sourceLibraryFromRows,
  } = ctx;
  const listCustom = ctx.listCustomSources || listCustomSources;
  const listCustomKeys = ctx.listCustomSourceKeys || listCustomSourceKeys;
  const insertCustom = ctx.insertCustomSource || insertCustomSource;
  const updateCustom = ctx.updateCustomSource || updateCustomSource;
  const deleteCustom = ctx.deleteCustomSource || deleteCustomSource;
  const managePolicy = (user) => {
    const isAdmin = sourceLibraryAccessDecision(user).allowed === true;
    return (row) => canManageCustomSource(user, row, isAdmin);
  };
  const outcomeError = (res, status) =>
    status === "not_found"
      ? res.status(404).json({
          error:
            "This custom source no longer exists. Refresh the Source Library and try again.",
        })
      : res.status(403).json({
          error:
            "Only the person who created this custom source or a Source Library administrator can change it.",
        });
  const router = express.Router();

  router.get("/api/source-library/access", requireCurrentUser, (req, res) => {
    const { id, username, fullName } = req.studioshareUser;
    const decision = sourceLibraryAccessDecision(req.studioshareUser);
    res.json({
      canRead: true,
      canReplace: decision.allowed,
      accessStatus: decision.reason,
      user: { id, username, fullName },
    });
  });

  router.get("/api/source-library", requireCurrentUser, async (_req, res) => {
    try {
      const loaded = await loadLiveFieldLibrary(pool);
      const catalog = sourceLibraryFromRows(loaded.rows);
      const custom = await listCustom(pool);
      const sources = mergeCustomSources(catalog, custom);
      const customFieldCount = sources
        .filter((source) => source.origin === "custom")
        .reduce((count, source) => count + (source.fields?.length || 0), 0);
      res.json({
        version: 1,
        generatedAt: new Date().toISOString(),
        sourceCount: sources.length,
        fieldCount: loaded.rows.length + customFieldCount,
        provenance: fieldLibraryProvenance(loaded),
        sources,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "source_library_failed",
          message: error.message,
        }),
      );
      res
        .status(500)
        .json({ error: "Could not read the ATLAS Field Library." });
    }
  });

  router.post(
    "/api/source-library/custom",
    requireCurrentUser,
    async (req, res) => {
      try {
        const input = validateCustomSourceInput(req.body);
        const createdBy = customSourceCreator(req.studioshareUser);
        const loaded = await loadLiveFieldLibrary(pool);
        const catalogKeys = sourceLibraryFromRows(loaded.rows).map(
          (source) => source.sourceKey,
        );
        const existingKeys = await listCustomKeys(pool);
        const sourceKey = allocateCustomSourceKey(input.sourceName, [
          ...catalogKeys,
          ...existingKeys,
        ]);
        const source = await insertCustom(pool, {
          sourceKey,
          input,
          createdBy,
        });
        res.status(201).json(source);
      } catch (error) {
        if (error instanceof CustomSourceValidationError) {
          return res.status(error.status).json({ error: error.message });
        }
        if (error?.code === "23505") {
          return res.status(409).json({
            error:
              "A source with this name already exists. Change the source name and try again.",
          });
        }
        console.error(
          JSON.stringify({
            level: "error",
            event: "custom_source_create_failed",
            message: error.message,
          }),
        );
        return res.status(500).json({
          error: "The custom source could not be saved. Try again.",
        });
      }
    },
  );

  router.put(
    "/api/source-library/custom/:sourceKey",
    requireCurrentUser,
    async (req, res) => {
      const sourceKey = customSourceKeyParam(req.params.sourceKey);
      if (!sourceKey) return outcomeError(res, "not_found");
      try {
        const input = validateCustomSourceInput(req.body);
        const result = await updateCustom(pool, {
          sourceKey,
          input,
          canManage: managePolicy(req.studioshareUser),
        });
        if (result.status !== "ok") {
          if (result.status === "forbidden")
            console.warn(
              JSON.stringify({
                level: "warning",
                event: "custom_source_update_denied",
                sourceKey,
                userId: String(req.studioshareUser?.id || ""),
              }),
            );
          return outcomeError(res, result.status);
        }
        console.info(
          JSON.stringify({
            level: "info",
            event: "custom_source_updated",
            sourceKey,
            userId: String(req.studioshareUser?.id || ""),
            fieldCount: input.fields.length,
          }),
        );
        return res.json(result.source);
      } catch (error) {
        if (error instanceof CustomSourceValidationError) {
          return res.status(error.status).json({ error: error.message });
        }
        console.error(
          JSON.stringify({
            level: "error",
            event: "custom_source_update_failed",
            sourceKey,
            message: error.message,
          }),
        );
        return res.status(500).json({
          error: "The custom source could not be updated. Try again.",
        });
      }
    },
  );

  router.delete(
    "/api/source-library/custom/:sourceKey",
    requireCurrentUser,
    async (req, res) => {
      const sourceKey = customSourceKeyParam(req.params.sourceKey);
      if (!sourceKey) return outcomeError(res, "not_found");
      try {
        const result = await deleteCustom(pool, {
          sourceKey,
          canManage: managePolicy(req.studioshareUser),
        });
        if (result.status !== "ok") {
          if (result.status === "forbidden")
            console.warn(
              JSON.stringify({
                level: "warning",
                event: "custom_source_delete_denied",
                sourceKey,
                userId: String(req.studioshareUser?.id || ""),
              }),
            );
          return outcomeError(res, result.status);
        }
        console.info(
          JSON.stringify({
            level: "info",
            event: "custom_source_deleted",
            sourceKey,
            userId: String(req.studioshareUser?.id || ""),
          }),
        );
        return res.status(204).end();
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            event: "custom_source_delete_failed",
            sourceKey,
            message: error.message,
          }),
        );
        return res.status(500).json({
          error: "The custom source could not be deleted. Try again.",
        });
      }
    },
  );

  return router;
}
