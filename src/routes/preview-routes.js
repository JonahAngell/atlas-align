import express from "express";

export function createPreviewRouter(ctx) {
  const {
    getAuditWorkflowSummary,
    pool,
    previewApprovalRequest,
    previewAuditRestoration,
    previewAuditRevision,
    previewPublication,
    previewStepRestoration,
    requireCurrentUser,
    workflowError,
    workflowFeature,
  } = ctx;
  const router = express.Router();
  router.get(
  "/api/audits/:auditId/previews/revisions/:revisionId",
  requireCurrentUser,
  workflowFeature("history"),
  async (req, res) => {
    try {
      const summary = await getAuditWorkflowSummary(pool, {
        auditId: req.params.auditId,
        user: req.studioshareUser,
      });
      if (!summary.capabilities.canViewHistory)
        return res
          .status(403)
          .json({ error: "Audit history access is required." });
      res.json(
        await previewAuditRevision(pool, {
          auditId: req.params.auditId,
          revisionId: req.params.revisionId,
          user: req.studioshareUser,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/audits/:auditId/previews/revisions/:revisionId/restoration",
  requireCurrentUser,
  workflowFeature("restoration"),
  async (req, res) => {
    try {
      const summary = await getAuditWorkflowSummary(pool, {
        auditId: req.params.auditId,
        user: req.studioshareUser,
      });
      if (!summary.capabilities.canRestoreAudit)
        return res
          .status(403)
          .json({ error: "Audit restoration access is required." });
      res.json(
        await previewAuditRestoration(pool, {
          auditId: req.params.auditId,
          revisionId: req.params.revisionId,
          user: req.studioshareUser,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/audits/:auditId/previews/steps/:stepId/revisions/:revisionId/restoration",
  requireCurrentUser,
  workflowFeature("restoration"),
  async (req, res) => {
    try {
      const summary = await getAuditWorkflowSummary(pool, {
        auditId: req.params.auditId,
        user: req.studioshareUser,
      });
      if (!summary.capabilities.canRestoreStep)
        return res
          .status(403)
          .json({ error: "Step restoration access is required." });
      res.json(
        await previewStepRestoration(pool, {
          auditId: req.params.auditId,
          stepId: req.params.stepId,
          stepRevisionId: req.params.revisionId,
          user: req.studioshareUser,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/audits/:auditId/previews/approval-requests/:requestId",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      const summary = await getAuditWorkflowSummary(pool, {
        auditId: req.params.auditId,
        user: req.studioshareUser,
      });
      if (!summary.capabilities.canViewApprovalRequest)
        return res
          .status(403)
          .json({ error: "Approval request access is required." });
      res.json(
        await previewApprovalRequest(pool, {
          auditId: req.params.auditId,
          requestId: req.params.requestId,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/audits/:auditId/previews/publications/:versionNumber",
  requireCurrentUser,
  workflowFeature("history"),
  async (req, res) => {
    try {
      const summary = await getAuditWorkflowSummary(pool, {
        auditId: req.params.auditId,
        user: req.studioshareUser,
      });
      if (!summary.capabilities.canViewHistory)
        return res
          .status(403)
          .json({ error: "Audit history access is required." });
      res.json(
        await previewPublication(pool, {
          auditId: req.params.auditId,
          versionNumber: req.params.versionNumber,
          mode: req.query.mode === "approved" ? "approved" : "working",
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  return router;
}
