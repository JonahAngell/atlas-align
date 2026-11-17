INSERT INTO
  atlas_audit_publications (
    audit_id,
    version_number,
    version_title,
    description,
    change_summary,
    approved_revision_id,
    source_approval_id,
    source_working_revision_id,
    snapshot,
    snapshot_sha256,
    assignment_snapshot,
    approver_user_id,
    approver_username,
    publisher_user_id,
    publisher_username,
    step_type_versions
  )
VALUES
  (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $6,
    $8::jsonb,
    $9,
    $10::jsonb,
    $11,
    $12,
    $13,
    $14,
    (
      -- Decision B: pin the definition versions this publication renders with.
      SELECT
        COALESCE(jsonb_object_agg(latest.type_id, latest.version), '{}'::jsonb)
      FROM
        (
          SELECT
            type_id,
            max(version) AS version
          FROM
            atlas_step_type_definitions
          WHERE
            status = 'published'
          GROUP BY
            type_id
        ) latest
    )
  )
RETURNING
  *
