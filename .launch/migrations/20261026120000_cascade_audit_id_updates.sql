-- migrate:up
-- Renaming a saved audit updates atlas_audits.id in place. Every immediate foreign key that
-- carries the audit id (directly to atlas_audits, or as part of a composite (x_id, audit_id)
-- key) now cascades updates so child rows follow the rename in the same statement.
-- Deferred keys (atlas_audits' own pointers, the step parent self-reference) are left as-is:
-- they are checked at commit, after the cascades have run.
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conname, c.conrelid::regclass AS table_name, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND NOT c.condeferrable
      AND c.conrelid <> 'atlas_audits'::regclass
      AND (
        c.confrelid = 'atlas_audits'::regclass
        OR EXISTS (
          SELECT 1
          FROM unnest(c.conkey) AS k(attnum)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
          WHERE a.attname = 'audit_id'
        )
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      fk.table_name,
      fk.conname,
      regexp_replace(
        regexp_replace(fk.definition, ' ON UPDATE (RESTRICT|CASCADE|SET NULL|SET DEFAULT|NO ACTION)', ''),
        '(REFERENCES [^)]+\))',
        '\1 ON UPDATE CASCADE'
      )
    );
  END LOOP;
END
$$;

-- migrate:down
-- Restores the pre-rename guarantee that audit ids never change. The original keys mixed
-- NO ACTION and RESTRICT; both forbid the update, so RESTRICT is used throughout.
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conname, c.conrelid::regclass AS table_name, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confupdtype = 'c'
      AND NOT c.condeferrable
      AND c.conrelid <> 'atlas_audits'::regclass
      AND (
        c.confrelid = 'atlas_audits'::regclass
        OR EXISTS (
          SELECT 1
          FROM unnest(c.conkey) AS k(attnum)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
          WHERE a.attname = 'audit_id'
        )
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      fk.table_name,
      fk.conname,
      replace(fk.definition, ' ON UPDATE CASCADE', ' ON UPDATE RESTRICT')
    );
  END LOOP;
END
$$;
