-- DCL LOA 90 Day - SQL Server audit query
-- Exported from ATLAS Align on 2026-01-01. 16 enabled steps; disabled steps are left out.
-- Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
--
-- Review:
--   - Steps 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
--   - Step 6 overwrites [Error Message], but the source columns are not listed in the audit. Replace SELECT * in that step with the column list so [Error Message] is not selected twice.
--   - The audit does not list the columns of sensitive_churnover, so those steps use SELECT *. Check for columns selected twice.
--
-- Source tables (replace these names if your tables are named differently):
--   - [HI0256_Maseke]
--   - [sensitive_churnover]

WITH
-- Step 1: Reference HI0256_Maseke
step_1 AS (
  SELECT * FROM [HI0256_Maseke] AS [sap.hi0256]
),

-- Step 1.1 (THEN branch): Format Field
step_1_1 AS (
  SELECT CAST([persno] AS NVARCHAR(4000)) AS [persno],
         [workday_employee_id],
         [position_number],
         [workday_position_id],
         [start_date_it00],
         [end_date_it00],
         [action_type],
         [action_type_text],
         [action_reason_number],
         [action_reason_text],
         [employment_status_number],
         [employment_status_text]
  FROM step_1
),

-- Step 1.2 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_1_2 AS (
  SELECT *
  FROM step_1_1
  WHERE NOT ([personnel_area] <> '"2450", "3357", "3358", "3359", "3360", "3361", "3362", "3744", "3745", "3981", "3982", "3983", "3984", "4024"')
),

-- Step 1.3 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_1_3 AS (
  SELECT *
  FROM step_1_2
  WHERE NOT ([employment_status_number] <> '1')
),

-- Step 2: Reference sensitive_churnover
step_2 AS (
  SELECT * FROM [sensitive_churnover] AS [sensitive_churnover]
),

-- Step 2.1 (THEN branch): Create Column
-- Note: The expression is free text and is copied as written. Review it before running.
step_2_1 AS (
  SELECT *, REPORT DATE - start_date AS [Days on Leave]
  FROM step_2
),

-- Step 2.2 (THEN branch): Format Field
step_2_2 AS (
  SELECT *, CAST(CAST(NULL AS NVARCHAR(4000)) AS NVARCHAR(4000)) AS [persno]
  FROM step_2_1
),

-- Step 2.3 (THEN branch): Format Field
step_2_3 AS (
  SELECT *, CAST(CAST(NULL AS NVARCHAR(4000)) AS NVARCHAR(4000)) AS [act_type]
  FROM step_2_2
),

-- Step 2.4 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_2_4 AS (
  SELECT *
  FROM step_2_3
  WHERE NOT ([act_type] <> '''Start__LOA_with_Pay'', ''Start__LOA_without_P'', ''Start_LOA''')
),

-- Step 2.5 (THEN branch): Sort Records
-- The sort order is applied in the final SELECT (and to later Remove Duplicates steps).

-- Step 2.6 (THEN branch): Remove Duplicates
step_2_6_ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY [persno] ORDER BY [start_date] DESC) AS [Duplicate Rank]
  FROM step_2_4
),

step_2_6 AS (
  SELECT *
  FROM step_2_6_ranked
  WHERE [Duplicate Rank] = 1
),

-- Step 3: Join
step_3 AS (
  SELECT [sap.hi0256].*,
         [sensitive_churnover].*
  FROM step_2_6 AS [sap.hi0256]
  LEFT JOIN [sensitive_churnover] AS [sensitive_churnover]
    ON [sap.hi0256].[persno] = [sensitive_churnover].[persno]
),

-- Step 4: Create Column
step_4 AS (
  SELECT *, NULL AS [Error Message]
  FROM step_3
),

-- Step 5: IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_5 AS (
  SELECT *
  FROM step_4
  WHERE NOT ([start_date] > 'run_date')
),

-- Step 6: IF / THEN
step_6 AS (
  SELECT *, CASE WHEN [Days on Leave] > 90 THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Over 90 Days on Leave') ELSE [Error Message] END AS [Error Message]
  FROM step_5
),

-- Step 7: IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_7 AS (
  SELECT *
  FROM step_6
  WHERE NOT (NULLIF(LTRIM(RTRIM([Error Message])), '') IS NULL)
)

SELECT *
FROM step_7
ORDER BY [start_date] DESC;
