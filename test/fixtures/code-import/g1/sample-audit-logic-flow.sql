-- Sample Audit Logic Flow - SQL Server audit query
-- Exported from ATLAS Align on 2026-01-01. 2 enabled steps; disabled steps are left out.
-- Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
--
-- Review:
--   - The audit does not list the columns of primary.source, so those steps use SELECT *. Check for columns selected twice.
--
-- Source tables (replace these names if your tables are named differently):
--   - [Primary Source File]

WITH
-- Step 1: Reference primary source
step_1 AS (
  SELECT * FROM [Primary Source File] AS [primary.source]
),

-- Step 2: Apply IF condition
step_2 AS (
  SELECT *, CASE WHEN [Status] = 'Open' THEN CONCAT_WS('||', NULLIF(CAST(NULL AS NVARCHAR(4000)), ''), 'Review') ELSE CAST(NULL AS NVARCHAR(4000)) END AS [Audit Result]
  FROM step_1
)

SELECT *
FROM step_2;
