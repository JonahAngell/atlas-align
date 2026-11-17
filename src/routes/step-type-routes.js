import express from "express";

/** GET /api/step-types: the definitions ATLAS Align renders steps with. */
export function createStepTypeRouter(ctx) {
  const { listStepTypes, pool, requireCurrentUser } = ctx;
  const router = express.Router();
  router.get("/api/step-types", requireCurrentUser, async (_req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json(await listStepTypes(pool));
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "step_types_failed",
          message: error.message,
        }),
      );
      res.status(503).json({
        error:
          "Step type definitions could not be read from the database, so ATLAS Align is using the definitions it was deployed with.",
      });
    }
  });
  return router;
}
