\set ON_ERROR_STOP on

INSERT INTO atlas_user_profiles
  (user_id, username, full_name, disabled, has_logged_in,
   role_slugs, role_resolution_status, last_role_resolved_at)
VALUES
  ('local-user-1', 'local.user', 'Local Test User', false, true,
   ARRAY['atlas-admin-team', 'atlas-align-admin']::text[], 'resolved', current_timestamp),
  ('local-user-2', 'local.reviewer', 'Local Test Reviewer', false, false,
   ARRAY['atlas-admin-team']::text[], 'resolved', current_timestamp)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO atlas_audits
  (id, name, purpose, description, schema_version, source_kind,
   owner_user_id, owner_username, created_by_user_id, created_by_username,
   updated_by_user_id, updated_by_username)
VALUES
  ('local-audit-001', 'Local Audit Example',
   'Synthetic audit for local development.',
   'This record is created only in the local Docker PostgreSQL database.',
   1, 'database', 'local-user-1', 'local.user',
   'local-user-1', 'local.user', 'local-user-1', 'local.user')
ON CONFLICT (id) DO NOTHING;

WITH inserted_revision AS (
  INSERT INTO atlas_audit_revisions
    (audit_id, revision_number, parent_revision_id, document,
     document_sha256, change_type, change_summary,
     created_by_user_id, created_by_username, created_by_full_name)
  SELECT
    'local-audit-001',
    1,
    NULL,
    '{
      "id": "local-audit-001",
      "name": "Local Audit Example",
      "purpose": "Synthetic audit for local development.",
      "description": "This record is created only in the local Docker PostgreSQL database.",
      "schemaVersion": 1,
      "sourceKind": "database",
      "sources": [],
      "fields": [],
      "steps": [],
      "assignments": {
        "assigned": [{"id":"local-user-1","username":"local.user","fullName":"Local Test User","email":"","avatar":null}],
        "backup": [{"id":"local-user-2","username":"local.reviewer","fullName":"Local Test Reviewer","email":"","avatar":null}],
        "developer": []
      }
    }'::jsonb,
    md5('local-audit-001-revision-1'),
    'create',
    'Local seed data',
    'local-user-1',
    'local.user',
    'Local Test User'
  WHERE NOT EXISTS (
    SELECT 1
    FROM atlas_audit_revisions
    WHERE audit_id = 'local-audit-001' AND revision_number = 1
  )
  RETURNING id
), selected_revision AS (
  SELECT id FROM inserted_revision
  UNION ALL
  SELECT id
  FROM atlas_audit_revisions
  WHERE audit_id = 'local-audit-001' AND revision_number = 1
  LIMIT 1
)
UPDATE atlas_audits
SET current_revision_id = selected_revision.id,
    current_revision_number = 1
FROM selected_revision
WHERE atlas_audits.id = 'local-audit-001';
