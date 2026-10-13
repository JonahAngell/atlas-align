-- migrate:up
CREATE TABLE IF NOT EXISTS atlas_audit_deletion_events (
    id bigserial PRIMARY KEY,
    audit_id text NOT NULL,
    audit_name text NOT NULL,
    deleted_at timestamptz NOT NULL DEFAULT now(),
    deleted_by_user_id text,
    deleted_by_username text NOT NULL,
    deleted_by_full_name text,
    current_revision_id bigint,
    current_revision_number integer,
    event_type text NOT NULL CHECK (event_type = 'permanent_delete')
);

CREATE INDEX IF NOT EXISTS atlas_audits_archived_at_idx 
    ON atlas_audits (archived_at DESC) 
    WHERE archived_at IS NOT NULL;

--migrate:down
DROP TABLE IF EXISTS atlas_audit_deletion_events;
DROP INDEX IF EXISTS atlas_audits_archived_at_idx;