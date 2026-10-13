SELECT
  EXISTS (
    SELECT
      1
    FROM
      atlas_audits a
      JOIN atlas_audit_revisions r ON r.id = a.current_revision_id
      AND r.audit_id = a.id,
      LATERAL jsonb_array_elements(
        COALESCE(
          r.document -> 'assignments' -> 'assigned',
          '[]'::jsonb
        )
      ) entry
    WHERE
      a.id = $1
      AND (
        lower(
          COALESCE(
            entry ->> 'username',
            entry ->> 'email',
            entry ->> 'login',
            ''
          )
        ) = lower($2)
        OR (
          NULLIF($3, '') IS NOT NULL
          AND COALESCE(entry ->> 'id', entry ->> 'userId', '') = $3
        )
      )
  ) AS allowed
