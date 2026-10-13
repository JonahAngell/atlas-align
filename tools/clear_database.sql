/*
ATLAS Align Preview database cleanup
====================================

PURPOSE
-------
Delete Preview application data while preserving:

  public.atlas_field_library
  public.atlas_field_library_imports
  public.atlas_user_profiles

TARGETED FOR DELETION
---------------------
  User Impersonation History
  Inbox Items
  Audit Activity Events
  Audit Deletion Events
  Discussion Transitions
  Discussion Messages
  Discussion Threads
  Review Item/Object Links
  Review Items
  Review Sessions
  Review Objects
  Publications
  Approvals
  Approval Requests
  Step Revisions
  Audit Steps
  Audit Revisions
  Audits

IMPORTANT
---------
1. Run only against the StudioShare Preview database environment.
2. Do not run while Preview users or automated tests are writing data.
3. The script takes an advisory transaction lock and table locks.
4. Any error aborts the transaction and prevents partial cleanup.
5. The three protected tables are never truncated, deleted, or reseeded.
6. This script does not reset sequences.
*/

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';
SET LOCAL idle_in_transaction_session_timeout = '5min';

/*
Correct PostgreSQL syntax. SET CONSTRAINTS is already transaction-scoped.
*/
SET CONSTRAINTS ALL DEFERRED;

/*
Prevent two copies of this cleanup from running concurrently in the same
database.
*/
SELECT pg_advisory_xact_lock(
  hashtextextended('atlas-align-preview-cleanup-v1', 0)
);

/*
Fail closed if the expected schema is incomplete.
*/
DO $cleanup_schema_guard$
DECLARE
  missing_tables text;
BEGIN
  SELECT string_agg(required_table, ', ' ORDER BY required_table)
  INTO missing_tables
  FROM (
    VALUES
      ('atlas_field_library'),
      ('atlas_field_library_imports'),
      ('atlas_user_profiles'),
      ('atlas_user_impersonation_sessions'),
      ('atlas_audits'),
      ('atlas_audit_revisions'),
      ('atlas_audit_steps'),
      ('atlas_audit_step_revisions'),
      ('atlas_audit_deletion_events'),
      ('atlas_audit_approval_requests'),
      ('atlas_inbox_items'),
      ('atlas_audit_approvals'),
      ('atlas_audit_publications'),
      ('atlas_audit_activity_events'),
      ('atlas_audit_review_sessions'),
      ('atlas_audit_review_items'),
      ('atlas_audit_review_objects'),
      ('atlas_audit_review_item_objects'),
      ('atlas_audit_discussion_threads'),
      ('atlas_audit_discussion_messages'),
      ('atlas_audit_discussion_transitions')
  ) AS required(required_table)
  WHERE to_regclass('public.' || required_table) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION
      'ATLAS Preview cleanup stopped. Expected table(s) are missing: %',
      missing_tables;
  END IF;
END
$cleanup_schema_guard$;

/*
Capture before-cleanup counts.

The protected-table counts will be compared again before commit.
*/
CREATE TEMP TABLE atlas_cleanup_counts_before
ON COMMIT DROP
AS
SELECT *
FROM (
  VALUES
    (
      'atlas_field_library',
      (SELECT count(*)::bigint
       FROM public.atlas_field_library),
      true
    ),
    (
      'atlas_field_library_imports',
      (SELECT count(*)::bigint
       FROM public.atlas_field_library_imports),
      true
    ),
    (
      'atlas_user_profiles',
      (SELECT count(*)::bigint
       FROM public.atlas_user_profiles),
      true
    ),
    (
      'atlas_user_impersonation_sessions',
      (SELECT count(*)::bigint
       FROM public.atlas_user_impersonation_sessions),
      false
    ),
    (
      'atlas_audit_deletion_events',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_deletion_events),
      false
    ),
    (
      'atlas_audit_discussion_transitions',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_discussion_transitions),
      false
    ),
    (
      'atlas_audit_discussion_messages',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_discussion_messages),
      false
    ),
    (
      'atlas_audit_discussion_threads',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_discussion_threads),
      false
    ),
    (
      'atlas_audit_review_item_objects',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_review_item_objects),
      false
    ),
    (
      'atlas_audit_review_items',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_review_items),
      false
    ),
    (
      'atlas_audit_review_sessions',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_review_sessions),
      false
    ),
    (
      'atlas_audit_review_objects',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_review_objects),
      false
    ),
    (
      'atlas_inbox_items',
      (SELECT count(*)::bigint
       FROM public.atlas_inbox_items),
      false
    ),
    (
      'atlas_audit_activity_events',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_activity_events),
      false
    ),
    (
      'atlas_audit_publications',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_publications),
      false
    ),
    (
      'atlas_audit_approvals',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_approvals),
      false
    ),
    (
      'atlas_audit_approval_requests',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_approval_requests),
      false
    ),
    (
      'atlas_audit_step_revisions',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_step_revisions),
      false
    ),
    (
      'atlas_audit_steps',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_steps),
      false
    ),
    (
      'atlas_audit_revisions',
      (SELECT count(*)::bigint
       FROM public.atlas_audit_revisions),
      false
    ),
    (
      'atlas_audits',
      (SELECT count(*)::bigint
       FROM public.atlas_audits),
      false
    )
) AS counts(table_name, rows_before, protected);

/*
Prevent application writes from changing the cleanup graph while this
transaction is running.

NOWAIT causes the script to fail safely instead of waiting indefinitely if
another session is using one of these tables.
*/
LOCK TABLE
  public.atlas_user_impersonation_sessions,
  public.atlas_audit_deletion_events,
  public.atlas_audit_discussion_transitions,
  public.atlas_audit_discussion_messages,
  public.atlas_audit_discussion_threads,
  public.atlas_audit_review_item_objects,
  public.atlas_audit_review_items,
  public.atlas_audit_review_sessions,
  public.atlas_audit_review_objects,
  public.atlas_inbox_items,
  public.atlas_audit_activity_events,
  public.atlas_audit_publications,
  public.atlas_audit_approvals,
  public.atlas_audit_approval_requests,
  public.atlas_audit_step_revisions,
  public.atlas_audit_steps,
  public.atlas_audit_revisions,
  public.atlas_audits
IN ACCESS EXCLUSIVE MODE NOWAIT;

/*
1. Clear impersonation-session history.

User profiles are not modified.
*/
DELETE FROM public.atlas_user_impersonation_sessions;

/*
2. Clear persistent discussion history.

Messages and transitions depend on threads. Threads depend on canonical
review objects.
*/
DELETE FROM public.atlas_audit_discussion_transitions;

DELETE FROM public.atlas_audit_discussion_messages;

DELETE FROM public.atlas_audit_discussion_threads;

/*
3. Clear review links and structured review data.

The item/object link table must be cleared before deleting either linked side.
Inbox rows will be cleared before review-session deletion because Inbox can
reference review sessions.
*/
DELETE FROM public.atlas_audit_review_item_objects;

/*
4. Clear workflow projections and activity history.

Activity events reference audits, revisions, requests, approvals, and
publications. Inbox items reference approval requests and may reference
review sessions.
*/
DELETE FROM public.atlas_inbox_items;

DELETE FROM public.atlas_audit_activity_events;

/*
5. Clear review items, sessions, and canonical objects.
*/
DELETE FROM public.atlas_audit_review_items;

DELETE FROM public.atlas_audit_review_sessions;

DELETE FROM public.atlas_audit_review_objects;

/*
6. Clear workflow pointers held by atlas_audits before deleting workflow
authority records.

The resulting audit rows are temporary because all audits are deleted later
in the same transaction.
*/
UPDATE public.atlas_audits
SET
  current_approval_request_id = NULL,
  current_approval_id = NULL,
  current_publication_id = NULL,
  working_from_publication_id = NULL,
  workflow_status = 'Draft',
  published_locked = false,
  revision_cycle_number = 0;

/*
7. Delete publications, approvals, and approval requests.

Publications must be removed before approvals. Approvals must be removed
before approval requests.
*/
DELETE FROM public.atlas_audit_publications;

DELETE FROM public.atlas_audit_approvals;

DELETE FROM public.atlas_audit_approval_requests;

/*
8. Clear current revision pointers.

atlas_audit_steps.current_step_revision_id points to step revisions.
atlas_audits.current_revision_id points to audit revisions.
*/
UPDATE public.atlas_audit_steps
SET current_step_revision_id = NULL;

UPDATE public.atlas_audits
SET
  current_revision_id = NULL,
  current_revision_number = 0;

/*
9. Delete step-revision history and the current step index.
*/
DELETE FROM public.atlas_audit_step_revisions;

DELETE FROM public.atlas_audit_steps;

/*
10. Delete audit-revision history and audits.
*/
DELETE FROM public.atlas_audit_revisions;

DELETE FROM public.atlas_audits;

/*
11. Delete permanent-deletion history.

This table is not removed automatically with atlas_audits.
*/
DELETE FROM public.atlas_audit_deletion_events;

/*
Validate that all cleanup targets are empty and that protected-table row
counts have not changed.

Any validation failure raises an exception and prevents COMMIT.
*/
DO $cleanup_validation$
DECLARE
  remaining_rows bigint;
  changed_protected_tables text;
BEGIN
  SELECT
      (SELECT count(*)
       FROM public.atlas_user_impersonation_sessions)
    + (SELECT count(*)
       FROM public.atlas_audit_deletion_events)
    + (SELECT count(*)
       FROM public.atlas_audit_discussion_transitions)
    + (SELECT count(*)
       FROM public.atlas_audit_discussion_messages)
    + (SELECT count(*)
       FROM public.atlas_audit_discussion_threads)
    + (SELECT count(*)
       FROM public.atlas_audit_review_item_objects)
    + (SELECT count(*)
       FROM public.atlas_audit_review_items)
    + (SELECT count(*)
       FROM public.atlas_audit_review_sessions)
    + (SELECT count(*)
       FROM public.atlas_audit_review_objects)
    + (SELECT count(*)
       FROM public.atlas_inbox_items)
    + (SELECT count(*)
       FROM public.atlas_audit_activity_events)
    + (SELECT count(*)
       FROM public.atlas_audit_publications)
    + (SELECT count(*)
       FROM public.atlas_audit_approvals)
    + (SELECT count(*)
       FROM public.atlas_audit_approval_requests)
    + (SELECT count(*)
       FROM public.atlas_audit_step_revisions)
    + (SELECT count(*)
       FROM public.atlas_audit_steps)
    + (SELECT count(*)
       FROM public.atlas_audit_revisions)
    + (SELECT count(*)
       FROM public.atlas_audits)
  INTO remaining_rows;

  IF remaining_rows <> 0 THEN
    RAISE EXCEPTION
      'ATLAS Preview cleanup validation failed: % targeted row(s) remain.',
      remaining_rows;
  END IF;

  SELECT string_agg(
    before.table_name,
    ', ' ORDER BY before.table_name
  )
  INTO changed_protected_tables
  FROM atlas_cleanup_counts_before AS before
  JOIN (
    VALUES
      (
        'atlas_field_library',
        (SELECT count(*)::bigint
         FROM public.atlas_field_library)
      ),
      (
        'atlas_field_library_imports',
        (SELECT count(*)::bigint
         FROM public.atlas_field_library_imports)
      ),
      (
        'atlas_user_profiles',
        (SELECT count(*)::bigint
         FROM public.atlas_user_profiles)
      )
  ) AS after(table_name, rows_after)
    ON after.table_name = before.table_name
  WHERE before.protected
    AND before.rows_before <> after.rows_after;

  IF changed_protected_tables IS NOT NULL THEN
    RAISE EXCEPTION
      'Protected-table validation failed. Row counts changed for: %',
      changed_protected_tables;
  END IF;
END
$cleanup_validation$;

/*
Return before/after counts.

The expected result is:
  - Three protected tables retain their original row counts.
  - Every cleanup target has rows_after = 0.
*/
SELECT
  before.table_name,
  before.protected,
  before.rows_before,
  CASE before.table_name
    WHEN 'atlas_field_library'
      THEN (
        SELECT count(*)
        FROM public.atlas_field_library
      )
    WHEN 'atlas_field_library_imports'
      THEN (
        SELECT count(*)
        FROM public.atlas_field_library_imports
      )
    WHEN 'atlas_user_profiles'
      THEN (
        SELECT count(*)
        FROM public.atlas_user_profiles
      )
    WHEN 'atlas_user_impersonation_sessions'
      THEN (
        SELECT count(*)
        FROM public.atlas_user_impersonation_sessions
      )
    WHEN 'atlas_audit_deletion_events'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_deletion_events
      )
    WHEN 'atlas_audit_discussion_transitions'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_discussion_transitions
      )
    WHEN 'atlas_audit_discussion_messages'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_discussion_messages
      )
    WHEN 'atlas_audit_discussion_threads'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_discussion_threads
      )
    WHEN 'atlas_audit_review_item_objects'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_review_item_objects
      )
    WHEN 'atlas_audit_review_items'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_review_items
      )
    WHEN 'atlas_audit_review_sessions'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_review_sessions
      )
    WHEN 'atlas_audit_review_objects'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_review_objects
      )
    WHEN 'atlas_inbox_items'
      THEN (
        SELECT count(*)
        FROM public.atlas_inbox_items
      )
    WHEN 'atlas_audit_activity_events'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_activity_events
      )
    WHEN 'atlas_audit_publications'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_publications
      )
    WHEN 'atlas_audit_approvals'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_approvals
      )
    WHEN 'atlas_audit_approval_requests'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_approval_requests
      )
    WHEN 'atlas_audit_step_revisions'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_step_revisions
      )
    WHEN 'atlas_audit_steps'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_steps
      )
    WHEN 'atlas_audit_revisions'
      THEN (
        SELECT count(*)
        FROM public.atlas_audit_revisions
      )
    WHEN 'atlas_audits'
      THEN (
        SELECT count(*)
        FROM public.atlas_audits
      )
  END::bigint AS rows_after
FROM atlas_cleanup_counts_before AS before
ORDER BY
  before.protected DESC,
  before.table_name;

/*
For a dry run, replace COMMIT with ROLLBACK before submitting the script.
*/
COMMIT;