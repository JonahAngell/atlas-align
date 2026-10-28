import express from "express";

export function createWorkflowRouter(ctx) {
  const {
    approveAuditRevision,
    denyAuditRevision,
    getAuditPublication,
    getAuditWorkflowSummary,
    getInboxApprovalReviewContext,
    getInboxUnreadCount,
    listAuditActivity,
    listAuditPublications,
    listInboxItems,
    lockAuditRevision,
    markInboxItemRead,
    pool,
    previewApprovalRequest,
    publicWorkflowFeatureFlags,
    publishAuditRevision,
    reduceWorkflowCapabilities,
    requireCurrentUser,
    rescindAuditApprovalRequest,
    softDeleteAuditPublication,
    submitAuditForApproval,
    unlockPublishedAudit,
    workflowApproverCandidates,
    workflowError,
    workflowFeature,
    workflowFlags,
    workflowOptions,
  } = ctx;
  const router = express.Router();
  router.get(
  "/api/audits/:auditId/approver-candidates",
  requireCurrentUser,
  workflowFeature("submission"),
  async (req, res) => {
    try {
      res.json({ items: await workflowApproverCandidates(req) });
    } catch (e) {
      workflowError(res, e);
    }
  },
);

  router.post(
  "/api/audits/:auditId/submit",
  requireCurrentUser,
  workflowFeature("submission"),
  async (req, res) => {
    try {
      res.status(201).json(
        await submitAuditForApproval(pool, {
          auditId: req.params.auditId,
          expectedRevisionId: req.body.expectedRevisionId,
          selectedApprover: req.body.selectedApprover,
          requesterMessage: req.body.requesterMessage,
          ...workflowOptions(req),
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.post(
  "/api/audits/:auditId/approval-requests/:requestId/rescind",
  requireCurrentUser,
  workflowFeature("submission"),
  async (req, res) => {
    try {
      if (req.body.confirmation !== true)
        return res
          .status(400)
          .json({ error: "Rescission confirmation is required." });
      res.json(
        await rescindAuditApprovalRequest(pool, {
          auditId: req.params.auditId,
          requestId: req.params.requestId,
          expectedRevisionId: req.body.expectedRevisionId,
          reason: req.body.reason,
          ...workflowOptions(req),
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.post(
  "/api/audits/:auditId/approval-requests/:requestId/approve",
  requireCurrentUser,
  workflowFeature("decisions"),
  async (req, res) => {
    try {
      res.json(
        await approveAuditRevision(pool, {
          auditId: req.params.auditId,
          requestId: req.params.requestId,
          expectedRevisionId: req.body.expectedRevisionId,
          response: req.body.reviewerResponse,
          ...workflowOptions(req),
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.post(
  "/api/audits/:auditId/approval-requests/:requestId/deny",
  requireCurrentUser,
  workflowFeature("decisions"),
  async (req, res) => {
    try {
      res.json(
        await denyAuditRevision(pool, {
          auditId: req.params.auditId,
          requestId: req.params.requestId,
          expectedRevisionId: req.body.expectedRevisionId,
          response: req.body.reviewerResponse,
          ...workflowOptions(req),
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.post(
  "/api/audits/:auditId/publish",
  requireCurrentUser,
  workflowFeature("publication"),
  async (req, res) => {
    try {
      res.status(201).json(
        await publishAuditRevision(pool, {
          auditId: req.params.auditId,
          expectedRevisionId: req.body.expectedRevisionId,
          expectedApprovalId: req.body.expectedApprovalId,
          versionTitle: req.body.versionTitle,
          description: req.body.description,
          changeSummary: req.body.changeSummary,
          ...workflowOptions(req),
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.post(
  "/api/audits/:auditId/lock",
  requireCurrentUser,
  workflowFeature("publication"),
  async (req, res) => {
    try {
      res.status(201).json(
        await lockAuditRevision(pool, {
          auditId: req.params.auditId,
          expectedRevisionId: req.body.expectedRevisionId,
          ...workflowOptions(req),
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.post(
  "/api/audits/:auditId/unlock",
  requireCurrentUser,
  workflowFeature("unlock"),
  async (req, res) => {
    try {
      res.json(
        await unlockPublishedAudit(pool, {
          auditId: req.params.auditId,
          expectedRevisionId: req.body.expectedRevisionId,
          expectedPublicationId: req.body.expectedPublicationId,
          reason: req.body.reason,
          ...workflowOptions(req),
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/audits/:auditId/workflow",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      const summary = await getAuditWorkflowSummary(pool, {
        auditId: req.params.auditId,
        user: req.studioshareUser,
      });
      res.json({
        ...summary,
        capabilities: reduceWorkflowCapabilities(
          summary.capabilities,
          workflowFlags,
        ),
        features: publicWorkflowFeatureFlags(workflowFlags),
      });
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/audits/:auditId/publications",
  requireCurrentUser,
  workflowFeature("history"),
  async (req, res) => {
    try {
      res.json({
        publications: await listAuditPublications(pool, {
          auditId: req.params.auditId,
          user: req.studioshareUser,
          limit: req.query.limit,
          lifecycle: req.query.lifecycle,
        }),
      });
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/audits/:auditId/publications/:versionNumber",
  requireCurrentUser,
  workflowFeature("history"),
  async (req, res) => {
    try {
      const p = await getAuditPublication(pool, {
        auditId: req.params.auditId,
        versionNumber: req.params.versionNumber,
        user: req.studioshareUser,
      });
      if (!p) return res.status(404).json({ error: "Publication not found." });
      res.json(p);
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.delete(
  "/api/audits/:auditId/publications/:versionNumber",
  requireCurrentUser,
  workflowFeature("publicationDeletion"),
  async (req, res) => {
    try {
      res.json(
        await softDeleteAuditPublication(pool, {
          auditId: req.params.auditId,
          versionNumber: req.params.versionNumber,
          expectedPublicationId: req.body.expectedPublicationId,
          expectedRevisionId: req.body.expectedRevisionId,
          confirmation: req.body.confirmation,
          reason: req.body.reason,
          user: req.studioshareUser,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/audits/:auditId/activity",
  requireCurrentUser,
  workflowFeature("history"),
  async (req, res) => {
    try {
      res.json({
        activity: await listAuditActivity(pool, {
          auditId: req.params.auditId,
          user: req.studioshareUser,
          limit: req.query.limit,
          beforeId: req.query.beforeId,
        }),
      });
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/inbox/unread-count",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.json({
        unreadCount: await getInboxUnreadCount(pool, {
          user: req.studioshareUser,
        }),
      });
    } catch (e) {
      workflowError(res, e);
    }
  },
);

  router.get(
  "/api/inbox",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.json({
        items: await listInboxItems(pool, {
          user: req.studioshareUser,
          limit: req.query.limit,
          beforeId: req.query.beforeId,
        }),
      });
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/inbox/:itemId/approval-review",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      const context = await getInboxApprovalReviewContext(pool, {
        itemId: req.params.itemId,
        user: req.studioshareUser,
      });
      const preview = await previewApprovalRequest(pool, {
        auditId: context.auditId,
        requestId: context.requestId,
        expectedSubmittedRevisionId: context.submittedRevisionId,
      });
      res
        .set("Cache-Control", "no-store")
        .json({ ...preview, inboxItemId: context.inboxItemId });
    } catch (e) {
      workflowError(res, e);
    }
  },
);

  router.post(
  "/api/inbox/:itemId/read",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      const item = await markInboxItemRead(pool, {
        itemId: req.params.itemId,
        user: req.studioshareUser,
      });
      if (!item)
        return res.status(404).json({ error: "Inbox item not found." });
      res.json(item);
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  return router;
}
