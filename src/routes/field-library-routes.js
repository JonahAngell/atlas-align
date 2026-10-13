import express from "express";

export function createFieldLibraryRouter(ctx) {
  const {
    CsvValidationError,
    FIELD_LIBRARY_COLUMNS,
    FIELD_LIBRARY_TABLE,
    pool,
    quoteIdentifier,
    replaceFieldLibrary,
    requireCurrentUser,
    requireSourceLibraryAdmin,
    upload,
  } = ctx;
  const router = express.Router();
  router.get("/api/field-library/summary", requireCurrentUser, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT count(*)::integer AS "rowCount",
              count(DISTINCT ${quoteIdentifier("Current Source")})::integer AS "sourceCount"
       FROM ${quoteIdentifier(FIELD_LIBRARY_TABLE)}`,
    );
    res.json({ ...result.rows[0], columnCount: FIELD_LIBRARY_COLUMNS.length });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "summary_failed",
        message: error.message,
      }),
    );
    res
      .status(500)
      .json({ error: "Could not read the field library summary." });
  }
});

  router.get(
  "/api/admin/field-library/imports",
  requireCurrentUser,
  requireSourceLibraryAdmin,
  async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, original_file_name AS "originalFileName", row_count AS "rowCount",
              file_sha256 AS sha256, imported_by AS "importedBy",
              imported_by_user_id AS "importedByUserId",
              imported_by_username AS "importedByUsername",
              imported_by_full_name AS "importedByFullName",
              imported_by_email AS "importedByEmail",
              imported_at AS "importedAt", completed_at AS "completedAt",
              status, error_message AS "errorMessage"
       FROM atlas_field_library_imports ORDER BY imported_at DESC LIMIT 50`,
      );
      res.json(result.rows);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "imports_failed",
          message: error.message,
        }),
      );
      res.status(500).json({ error: "Could not read import history." });
    }
  },
);

  router.post(
  "/api/admin/field-library/replace",
  requireCurrentUser,
  requireSourceLibraryAdmin,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ status: "rejected", error: "A CSV file is required." });
    }
    if (!req.file.originalname.toLowerCase().endsWith(".csv")) {
      return res.status(400).json({
        status: "rejected",
        error: "The uploaded file must use the .csv extension.",
      });
    }

    try {
      const user = req.studioshareUser;
      const result = await replaceFieldLibrary(pool, {
        buffer: req.file.buffer,
        originalFileName: req.file.originalname,
        importedBy: user.username,
        importedByUser: {
          id: user.id,
          username: user.username,
          fullName: user.fullName || null,
          email: user.email || null,
        },
      });
      res.json({ ...result, uploadedAt: new Date().toISOString() });
    } catch (error) {
      if (error instanceof CsvValidationError) {
        return res.status(400).json({
          status: "rejected",
          error: error.message,
          details: error.details,
        });
      }
      console.error(
        JSON.stringify({
          level: "error",
          event: "replace_failed",
          message: error.message,
        }),
      );
      return res.status(500).json({
        status: "rejected",
        error: "The field library was not replaced.",
      });
    }
  },
);
  return router;
}
