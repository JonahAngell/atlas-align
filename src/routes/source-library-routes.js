import express from "express";
import {
  allocateCustomSourceKey,
  customSourceCreator,
  CustomSourceValidationError,
  mergeCustomSources,
  validateCustomSourceInput,
} from "../custom-source.js";
import {
  insertCustomSource,
  listCustomSourceKeys,
  listCustomSources,
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
      res.status(500).json({ error: "Could not read the ATLAS Field Library." });
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
        const source = await insertCustom(pool, { sourceKey, input, createdBy });
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

  return router;
}
