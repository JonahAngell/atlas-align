import express from "express";

export function createReviewRouter(ctx) {
  const {
    addDiscussionMessage,
    bulkApproveAuditReview,
    createReviewDiscussion,
    finalizeApprovedAuditReview,
    getAuditReview,
    getAuditReviewFinalSummary,
    getReturnedReviewFeedback,
    getReviewItemDiscussions,
    openAuditReview,
    pool,
    publicWorkflowFeatureFlags,
    reopenDiscussion,
    requireCurrentUser,
    resolveDiscussion,
    returnAuditReview,
    saveAuditReview,
    workflowError,
    workflowFeature,
    workflowFlags,
  } = ctx;
  const router = express.Router();
  router.post(
  "/api/audits/:auditId/approval-requests/:requestId/review-session",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.status(201).json(
        await openAuditReview(pool, {
          auditId: req.params.auditId,
          requestId: req.params.requestId,
          user: req.studioshareUser,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/review-sessions/:sessionId",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.set("Cache-Control", "no-store").json(
        await getAuditReview(pool, {
          sessionId: req.params.sessionId,
          user: req.studioshareUser,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.put(
  "/api/review-sessions/:sessionId/draft",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.json(
        await saveAuditReview(pool, {
          sessionId: req.params.sessionId,
          user: req.studioshareUser,
          expectedVersion: req.body?.expectedVersion,
          changes: req.body?.changes,
          resumeSection: req.body?.resumeSection,
          resumeItemKey: req.body?.resumeItemKey,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.post(
  "/api/review-sessions/:sessionId/sections/:sectionKey/approve",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.json(
        await bulkApproveAuditReview(pool, {
          sessionId: req.params.sessionId,
          user: req.studioshareUser,
          expectedVersion: req.body?.expectedVersion,
          sectionKey: req.params.sectionKey,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.get(
  "/api/review-sessions/:sessionId/final-summary",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      const summary = await getAuditReviewFinalSummary(pool, {
        sessionId: req.params.sessionId,
        user: req.studioshareUser,
      });
      res.set("Cache-Control", "no-store").json({
        ...summary,
        features: publicWorkflowFeatureFlags(workflowFlags),
      });
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.post(
  "/api/review-sessions/:sessionId/return",
  requireCurrentUser,
  workflowFeature("decisions"),
  async (req, res) => {
    try {
      res.json(
        await returnAuditReview(pool, {
          sessionId: req.params.sessionId,
          expectedVersion: req.body?.expectedVersion,
          early: req.body?.early === true,
          user: req.studioshareUser,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);
  router.post(
  "/api/review-sessions/:sessionId/finalize-approval",
  requireCurrentUser,
  workflowFeature("publication"),
  async (req, res) => {
    try {
      res.json(
        await finalizeApprovedAuditReview(pool, {
          sessionId: req.params.sessionId,
          expectedVersion: req.body?.expectedVersion,
          versionTitle: req.body?.versionTitle,
          user: req.studioshareUser,
        }),
      );
    } catch (error) {
      workflowError(res, error);
    }
  },
);
  router.get(
  "/api/review-sessions/:sessionId/returned-feedback",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.set("Cache-Control", "no-store").json(
        await getReturnedReviewFeedback(pool, {
          sessionId: req.params.sessionId,
          user: req.studioshareUser,
        }),
      );
    } catch (e) {
      workflowError(res, e);
    }
  },
);

  router.get(
  "/api/review-sessions/:sessionId/items/:itemId/discussions",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.set("Cache-Control", "no-store").json(
        await getReviewItemDiscussions(pool, {
          sessionId: req.params.sessionId,
          itemId: req.params.itemId,
          user: req.studioshareUser,
        }),
      );
    } catch (error) {
      workflowError(res, error);
    }
  },
);
  router.post(
  "/api/review-sessions/:sessionId/items/:itemId/discussions",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.status(201).json(
        await createReviewDiscussion(pool, {
          sessionId: req.params.sessionId,
          itemId: req.params.itemId,
          body: req.body?.body,
          user: req.studioshareUser,
          authenticatedUser: req.authenticatedStudioshareUser,
        }),
      );
    } catch (error) {
      workflowError(res, error);
    }
  },
);
  router.post(
  "/api/review-discussions/:threadId/messages",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.status(201).json(
        await addDiscussionMessage(pool, {
          threadId: req.params.threadId,
          body: req.body?.body,
          user: req.studioshareUser,
          authenticatedUser: req.authenticatedStudioshareUser,
        }),
      );
    } catch (error) {
      workflowError(res, error);
    }
  },
);
  router.post(
  "/api/review-discussions/:threadId/resolve",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.json(
        await resolveDiscussion(pool, {
          threadId: req.params.threadId,
          expectedStateVersion: req.body?.expectedStateVersion,
          user: req.studioshareUser,
          authenticatedUser: req.authenticatedStudioshareUser,
        }),
      );
    } catch (error) {
      workflowError(res, error);
    }
  },
);
  router.post(
  "/api/review-discussions/:threadId/reopen",
  requireCurrentUser,
  workflowFeature("reads"),
  async (req, res) => {
    try {
      res.json(
        await reopenDiscussion(pool, {
          threadId: req.params.threadId,
          expectedStateVersion: req.body?.expectedStateVersion,
          user: req.studioshareUser,
          authenticatedUser: req.authenticatedStudioshareUser,
        }),
      );
    } catch (error) {
      workflowError(res, error);
    }
  },
);
  return router;
}
