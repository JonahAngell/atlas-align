import express from "express";

export function createAuditRouter(ctx) {
  const {
    archiveAudit,
    auditAccessForUser,
    getAudit,
    getAuditRevision,
    getStepRevision,
    importAudit,
    listArchivedAudits,
    listAuditRevisions,
    listAudits,
    listStepRevisions,
    permanentlyDeleteArchivedAudit,
    pool,
    requireAuditCapability,
    requireCurrentUser,
    restoreArchivedAudit,
    restoreAuditRevision,
    restoreStepRevision,
    saveAudit,
  } = ctx;
  const router = express.Router();
  router.get(
  "/api/audits",
  requireCurrentUser,
  requireAuditCapability("canRead"),
  async (_req, res) => {
    try {
      res.json({ audits: await listAudits(pool) });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "audit_list_failed",
          message: error.message,
        }),
      );
      res.status(500).json({ error: "Could not list audits." });
    }
  },
);
  router.post(
  "/api/audits",
  requireCurrentUser,
  requireAuditCapability("canCreate"),
  async (req, res) => {
    try {
      const result = await saveAudit(pool, {
        document: req.body.audit,
        expectedRevisionId: null,
        user: req.studioshareUser,
        changeType: "create",
        changeSummary: req.body.changeSummary || "Created audit",
      });
      res.status(201).json({
        ...result,
        access: auditAccessForUser(req.studioshareUser, result.audit),
      });
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.message,
        currentRevisionId: error.currentRevisionId,
      });
    }
  },
);
  router.post(
  "/api/audits/import",
  requireCurrentUser,
  requireAuditCapability("canCreate"),
  async (req, res) => {
    const documents = Array.isArray(req.body.audits)
      ? req.body.audits
      : [req.body.audit];
    const imported = [];
    const skipped = [];
    const failed = [];
    for (let index = 0; index < documents.length; index += 1) {
      try {
        const result = await importAudit(pool, {
          document: documents[index],
          user: req.studioshareUser,
          changeSummary: req.body.changeSummary || "Imported JSON audit",
        });
        if (result.status === "unchanged") skipped.push(result);
        else imported.push(result);
      } catch (error) {
        failed.push({
          index,
          auditId: documents[index]?.id || null,
          error: error.message,
        });
      }
    }
    const statusCode =
      failed.length && !imported.length && !skipped.length ? 400 : 201;
    res.status(statusCode).json({ imported, skipped, failed });
  },
);

  router.get(
  "/api/admin/audits/deleted",
  requireCurrentUser,
  requireAuditCapability("canManageDeletedAudits"),
  async (_req, res) => {
    try {
      res.json({ audits: await listArchivedAudits(pool) });
    } catch (_error) {
      res.status(500).json({ error: "Could not load Deleted Items." });
    }
  },
);
  router.post(
  "/api/admin/audits/:auditId/restore",
  requireCurrentUser,
  requireAuditCapability("canManageDeletedAudits"),
  async (req, res) => {
    try {
      const result = await restoreArchivedAudit(
        pool,
        req.params.auditId,
        req.studioshareUser,
      );
      if (!result)
        return res.status(409).json({ error: "Archived audit was not found." });
      res.json(result);
    } catch (_error) {
      res.status(500).json({ error: "Could not restore the archived audit." });
    }
  },
);
  router.delete(
  "/api/admin/audits/:auditId",
  requireCurrentUser,
  requireAuditCapability("canManageDeletedAudits"),
  async (req, res) => {
    try {
      const result = await permanentlyDeleteArchivedAudit(
        pool,
        req.params.auditId,
        req.studioshareUser,
      );
      if (!result)
        return res.status(409).json({
          error: "Only an archived audit can be permanently deleted.",
        });
      res.json(result);
    } catch (_error) {
      res
        .status(500)
        .json({ error: "Could not permanently delete the archived audit." });
    }
  },
);
  router.get(
  "/api/audits/:auditId",
  requireCurrentUser,
  requireAuditCapability("canRead"),
  async (req, res) => {
    try {
      const result = await getAudit(pool, req.params.auditId);
      if (!result) return res.status(404).json({ error: "Audit not found." });
      res.json({
        ...result,
        access: auditAccessForUser(req.studioshareUser, result.audit),
      });
    } catch (error) {
      res.status(500).json({ error: "Could not load the audit." });
    }
  },
);
  router.put(
  "/api/audits/:auditId",
  requireCurrentUser,
  requireAuditCapability("canEdit"),
  async (req, res) => {
    try {
      const audit = { ...req.body.audit, id: req.params.auditId };
      const result = await saveAudit(pool, {
        document: audit,
        expectedRevisionId: req.body.expectedRevisionId,
        user: req.studioshareUser,
        previewToken: req.body.previewToken,
        changeType: "save",
        changeSummary: req.body.changeSummary || null,
      });
      res.json({
        ...result,
        access: auditAccessForUser(req.studioshareUser, result.audit),
      });
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.message,
        currentRevisionId: error.currentRevisionId,
      });
    }
  },
);
  router.delete(
  "/api/audits/:auditId",
  requireCurrentUser,
  requireAuditCapability("canArchive"),
  async (req, res) => {
    try {
      res.json(
        await archiveAudit(
          pool,
          req.params.auditId,
          req.body.expectedRevisionId,
          req.studioshareUser,
        ),
      );
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  },
);
  router.get(
  "/api/audits/:auditId/revisions",
  requireCurrentUser,
  requireAuditCapability("canRead"),
  async (req, res) => {
    try {
      res.json({
        revisions: await listAuditRevisions(pool, req.params.auditId),
      });
    } catch (error) {
      res.status(500).json({ error: "Could not list audit revisions." });
    }
  },
);
  router.get(
  "/api/audits/:auditId/revisions/:revisionId",
  requireCurrentUser,
  requireAuditCapability("canRead"),
  async (req, res) => {
    try {
      const revision = await getAuditRevision(
        pool,
        req.params.auditId,
        req.params.revisionId,
      );
      if (!revision)
        return res.status(404).json({ error: "Audit revision not found." });
      res.json(revision);
    } catch (error) {
      res.status(500).json({ error: "Could not load audit revision." });
    }
  },
);
  router.post(
  "/api/audits/:auditId/revisions/:revisionId/restore",
  requireCurrentUser,
  requireAuditCapability("canRestore"),
  async (req, res) => {
    try {
      const result = await restoreAuditRevision(pool, {
        auditId: req.params.auditId,
        revisionId: req.params.revisionId,
        expectedRevisionId: req.body.expectedRevisionId,
        user: req.studioshareUser,
        previewToken: req.body.previewToken,
      });
      if (!result)
        return res.status(404).json({ error: "Audit revision not found." });
      res.json({
        ...result,
        access: auditAccessForUser(req.studioshareUser, result.audit),
      });
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.message,
        currentRevisionId: error.currentRevisionId,
      });
    }
  },
);
  router.get(
  "/api/audits/:auditId/steps/:stepId/revisions",
  requireCurrentUser,
  requireAuditCapability("canRead"),
  async (req, res) => {
    try {
      res.json({
        revisions: await listStepRevisions(
          pool,
          req.params.auditId,
          req.params.stepId,
        ),
      });
    } catch (error) {
      res.status(500).json({ error: "Could not list step revisions." });
    }
  },
);
  router.get(
  "/api/audits/:auditId/steps/:stepId/revisions/:revisionId",
  requireCurrentUser,
  requireAuditCapability("canRead"),
  async (req, res) => {
    try {
      const revision = await getStepRevision(
        pool,
        req.params.auditId,
        req.params.stepId,
        req.params.revisionId,
      );
      if (!revision)
        return res.status(404).json({ error: "Step revision not found." });
      res.json(revision);
    } catch (error) {
      res.status(500).json({ error: "Could not load step revision." });
    }
  },
);
  router.post(
  "/api/audits/:auditId/steps/:stepId/revisions/:revisionId/restore",
  requireCurrentUser,
  requireAuditCapability("canRestore"),
  async (req, res) => {
    try {
      const result = await restoreStepRevision(pool, {
        auditId: req.params.auditId,
        stepId: req.params.stepId,
        revisionId: req.params.revisionId,
        expectedRevisionId: req.body.expectedRevisionId,
        user: req.studioshareUser,
        previewToken: req.body.previewToken,
      });
      if (!result)
        return res.status(404).json({ error: "Step revision not found." });
      res.json({
        ...result,
        access: auditAccessForUser(req.studioshareUser, result.audit),
      });
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.message,
        currentRevisionId: error.currentRevisionId,
      });
    }
  },
);
  return router;
}
