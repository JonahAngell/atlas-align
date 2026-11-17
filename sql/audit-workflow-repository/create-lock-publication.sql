INSERT INTO
  atlas_audit_publications (
    audit_id,
    version_number,
    version_title,
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
    lock_source,
    step_type_versions
  )
VALUES
  (
    $1,
    $2,
    $3,
    $4,
    $5,
    $4,
    $6::jsonb,
    $7,
    $8::jsonb,
    $9,
    $10,
    $11,
    $12,
    'Manual',
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
