-- Untitled Audit - SQL Server audit query
-- Exported from ATLAS Align on 2026-01-01. 2 enabled steps; disabled steps are left out.
-- Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
--
-- Source tables (replace these names if your tables are named differently):
--   - [wd.INT2128a]

WITH
-- Step 1: Reference wd.INT2128a
step_1 AS (
  SELECT * FROM [wd.INT2128a] AS [wd.INT2128a]
),

-- Step 2: IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_2 AS (
  SELECT *
  FROM step_1
  WHERE NOT ([Primary Compensation Basis - Currency] = '3')
)

SELECT *
FROM step_2;
