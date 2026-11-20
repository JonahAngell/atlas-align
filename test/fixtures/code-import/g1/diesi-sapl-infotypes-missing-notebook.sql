-- DIESI SAPL - Infotypes Missing (Notebook) - SQL Server audit query
-- Exported from ATLAS Align on 2026-01-01. 36 enabled steps; disabled steps are left out.
-- Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
--
-- TODO: 8 steps could not be converted and are skipped below:
--   - Step 13: The formulas mark rows that match this condition.
--   - Step 13.2: The formulas mark rows that match this condition.
--   - Step 13.3: The formulas mark rows that match this condition.
--   - Step 14: The formulas mark rows that match this condition.
--   - Step 14.2: The formulas mark rows that match this condition.
--   - Step 14.2.2: The formulas mark rows that match this condition.
--   - Step 14.3: The formulas mark rows that match this condition.
--   - Step 14.4: The formulas mark rows that match this condition.
--
-- Review:
--   - Steps 1.1, 2.1, 12.1, 13.1, 13.2, 13.2.1, 13.2.2, 13.3, 13.3.1, 13.3.2, 14.1, 14.2, 14.2.1, 14.2.2, 14.2.2.1, 14.3, 14.3.1, 14.3.2, 14.4, 14.4.1, 14.4.2 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
--
-- Source tables (replace these names if your tables are named differently):
--   - [DIESI-SAPL Cast List]: sap.diesicst
--   - [sap.diesicst__v2]
--   - [DIESI-SAPL IT0027]: sap.diesi27
--   - [DIESI-SAPL IT0209]: sap.diesi209
--   - [DIESI-SAPL IT0395]: sap.diesi395
--   - [DIESI-SAPL IT0396]: sap.diesi396
--   - [sap.diesi27]
--   - [sap.diesi209]
--   - [sap.diesi395]
--   - [sap.diesi396]
--   - [sap.diesicst_2]: sap.diesicst__v2

WITH
-- Step 1: Reference DIESI-SAPL Cast List
step_1 AS (
  SELECT * FROM [DIESI-SAPL Cast List] AS [sap.diesicst]
),

-- Step 1.1 (THEN branch): Create Column
step_1_1 AS (
  SELECT *, 'Current' AS [Data_Pull]
  FROM step_1
),

-- Step 2: Reference sap.diesicst__v2
step_2 AS (
  SELECT * FROM [sap.diesicst__v2] AS [sap.diesicst_2]
),

-- Step 2.1 (THEN branch): Create Column
step_2_1 AS (
  SELECT *, 'Previous' AS [Data_Pull]
  FROM step_2
),

-- Step 3: Reference DIESI-SAPL IT0027
step_3 AS (
  SELECT * FROM [DIESI-SAPL IT0027] AS [sap.diesi27]
),

-- Step 4: Reference DIESI-SAPL IT0209
step_4 AS (
  SELECT * FROM [DIESI-SAPL IT0209] AS [sap.diesi209]
),

-- Step 5: Reference DIESI-SAPL IT0395
step_5 AS (
  SELECT * FROM [DIESI-SAPL IT0395] AS [sap.diesi395]
),

-- Step 6: Reference DIESI-SAPL IT0396
step_6 AS (
  SELECT * FROM [DIESI-SAPL IT0396] AS [sap.diesi396]
),

-- Step 7: Join
step_7 AS (
  SELECT [Cast List].*,
         [sap.diesi27].[S] AS [S_sap.diesi27]
  FROM step_6 AS [Cast List]
  FULL OUTER JOIN [sap.diesi27] AS [sap.diesi27]
    ON [Cast List].[Pers.No.] = [sap.diesi27].[Pers.No.]
),

-- Step 8: Join
step_8 AS (
  SELECT [Cast List].*,
         [sap.diesi209].[S] AS [S_sap.diesi209],
         [sap.diesi209].[Auth]
  FROM step_7 AS [Cast List]
  FULL OUTER JOIN [sap.diesi209] AS [sap.diesi209]
    ON [Cast List].[Pers.No.] = [sap.diesi209].[Pers.No.]
),

-- Step 9: Join
step_9 AS (
  SELECT [Cast List].*,
         [sap.diesi395].[S] AS [S_sap.diesi395],
         [sap.diesi395].[End Date] AS [End Date_sap.diesi395]
  FROM step_8 AS [Cast List]
  FULL OUTER JOIN [sap.diesi395] AS [sap.diesi395]
    ON [Cast List].[Pers.No.] = [sap.diesi395].[Pers.No.]
),

-- Step 10: Join
step_10 AS (
  SELECT [Cast List].*,
         [sap.diesi396].[S] AS [S_sap.diesi396],
         [sap.diesi396].[End Date] AS [End Date_sap.diesi396]
  FROM step_9 AS [Cast List]
  FULL OUTER JOIN [sap.diesi396] AS [sap.diesi396]
    ON [Cast List].[Pers.No.] = [sap.diesi396].[Pers.No.]
),

-- Step 11: Create Column
step_11 AS (
  SELECT *, NULL AS [Error Message]
  FROM step_10
),

-- Step 12: Union Sources
step_12 AS (
  SELECT * FROM step_11
  UNION ALL
  SELECT * FROM [sap.diesicst_2]
),

-- Step 12.1 (THEN branch): Remove Duplicates
step_12_1_ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY [Pers.No.] ORDER BY (SELECT NULL)) AS [Duplicate Rank]
  FROM step_12
),

step_12_1 AS (
  SELECT [Pers.No.],
         [S],
         [End Date],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth],
         [S_sap.diesi395],
         [End Date_sap.diesi395],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         [Error Message]
  FROM step_12_1_ranked
  WHERE [Duplicate Rank] = 1
),

-- TODO (skipped) Step 13: IF / THEN
-- Reason: The formulas mark rows that match this condition.
-- Developer Logic:
-- CASE WHEN [Data_Pull] = 'Previous' THEN 1 ELSE 0 END

-- Step 13.1 (THEN branch): IF / THEN
step_13_1 AS (
  SELECT [Pers.No.],
         [S],
         [End Date],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth],
         [S_sap.diesi395],
         [End Date_sap.diesi395],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         CASE WHEN NULLIF(LTRIM(RTRIM([S_sap.diesi27])), '') IS NOT NULL AND [PA] NOT IN ('2540', '3110', '4014') AND [CoCd] <> '1058' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Research IT0027') ELSE [Error Message] END AS [Error Message]
  FROM step_12_1
),

-- TODO (skipped) Step 13.2 (THEN branch): IF / THEN
-- Reason: The formulas mark rows that match this condition.
-- Developer Logic:
-- CASE WHEN NULLIF(LTRIM(RTRIM([sap.diesi395].[S])), '') IS NOT NULL AND ([sap.diesi395].[End Date] = '12/31/9999' OR NULLIF(LTRIM(RTRIM([sap.diesi395].[End Date])), '') IS NULL) THEN 1 ELSE 0 END

-- Step 13.2.1 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_13_2_1 AS (
  SELECT *
  FROM step_13_1
  WHERE NOT ([PA] IN ('2540', '3110'))
),

-- Step 13.2.2 (THEN branch): Linked Inverse
step_13_2_2 AS (
  SELECT [Pers.No.],
         [S],
         [End Date],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth],
         [S_sap.diesi395],
         [End Date_sap.diesi395],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         CASE WHEN [PA] NOT IN ('2540', '3110') THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Research IT0395') ELSE [Error Message] END AS [Error Message]
  FROM step_13_2_1
),

-- TODO (skipped) Step 13.3 (THEN branch): IF / THEN
-- Reason: The formulas mark rows that match this condition.
-- Developer Logic:
-- CASE WHEN NULLIF(LTRIM(RTRIM([sap.diesi396].[S])), '') IS NOT NULL AND ([sap.diesi396].[End Date] = '12/31/9999' OR NULLIF(LTRIM(RTRIM([sap.diesi396].[End Date])), '') IS NULL) THEN 1 ELSE 0 END

-- Step 13.3.1 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_13_3_1 AS (
  SELECT *
  FROM step_13_2_2
  WHERE NOT ([PA] IN ('2540', '3110'))
),

-- Step 13.3.2 (THEN branch): Linked Inverse
step_13_3_2 AS (
  SELECT [Pers.No.],
         [S],
         [End Date],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth],
         [S_sap.diesi395],
         [End Date_sap.diesi395],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         CASE WHEN [PA] NOT IN ('2540', '3110') THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Research IT0396') ELSE [Error Message] END AS [Error Message]
  FROM step_13_3_1
),

-- TODO (skipped) Step 14: Linked Inverse
-- Reason: The formulas mark rows that match this condition.
-- Developer Logic:
-- CASE WHEN [Data_Pull] <> 'Previous' THEN 1 ELSE 0 END

-- Step 14.1 (THEN branch): IF / THEN
step_14_1 AS (
  SELECT [Pers.No.],
         [S],
         [End Date],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth],
         [S_sap.diesi395],
         [End Date_sap.diesi395],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         CASE WHEN NULLIF(LTRIM(RTRIM([S_sap.diesi209])), '') IS NULL THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Missing IT0209') ELSE [Error Message] END AS [Error Message]
  FROM step_13_3_2
),

-- TODO (skipped) Step 14.2 (THEN branch): IF / THEN
-- Reason: The formulas mark rows that match this condition.
-- Developer Logic:
-- CASE WHEN NULLIF(LTRIM(RTRIM([sap.diesi27].[S])), '') IS NULL THEN 1 ELSE 0 END

-- Step 14.2.1 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_14_2_1 AS (
  SELECT *
  FROM step_14_1
  WHERE NOT ([PA] IN ('2540', '3110', '4014'))
),

-- TODO (skipped) Step 14.2.2 (THEN branch): Linked Inverse
-- Reason: The formulas mark rows that match this condition.
-- Developer Logic:
-- CASE WHEN [Cast List].[PA] NOT IN ('2540', '3110', '4014') THEN 1 ELSE 0 END

-- Step 14.2.2.1 (THEN branch): IF / THEN
step_14_2_2_1 AS (
  SELECT [Pers.No.],
         [S],
         [End Date],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth],
         [S_sap.diesi395],
         [End Date_sap.diesi395],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         CASE WHEN [CoCd] <> '1058' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Missing IT0027') ELSE [Error Message] END AS [Error Message]
  FROM step_14_2_1
),

-- TODO (skipped) Step 14.3 (THEN branch): IF / THEN
-- Reason: The formulas mark rows that match this condition.
-- Developer Logic:
-- CASE WHEN NULLIF(LTRIM(RTRIM([sap.diesi395].[S])), '') IS NULL THEN 1 ELSE 0 END

-- Step 14.3.1 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_14_3_1 AS (
  SELECT *
  FROM step_14_2_2_1
  WHERE NOT ([PA] IN ('2540', '3110', '4014'))
),

-- Step 14.3.2 (THEN branch): Linked Inverse
step_14_3_2 AS (
  SELECT [Pers.No.],
         [S],
         [End Date],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth],
         [S_sap.diesi395],
         [End Date_sap.diesi395],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         CASE WHEN [PA] NOT IN ('2540', '3110', '4014') THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Missing IT0395') ELSE [Error Message] END AS [Error Message]
  FROM step_14_3_1
),

-- TODO (skipped) Step 14.4 (THEN branch): IF / THEN
-- Reason: The formulas mark rows that match this condition.
-- Developer Logic:
-- CASE WHEN NULLIF(LTRIM(RTRIM([sap.diesi396].[S])), '') IS NULL THEN 1 ELSE 0 END

-- Step 14.4.1 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_14_4_1 AS (
  SELECT *
  FROM step_14_3_2
  WHERE NOT ([PA] IN ('2540', '3110', '4014'))
),

-- Step 14.4.2 (THEN branch): Linked Inverse
step_14_4_2 AS (
  SELECT [Pers.No.],
         [S],
         [End Date],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth],
         [S_sap.diesi395],
         [End Date_sap.diesi395],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         CASE WHEN [PA] NOT IN ('2540', '3110', '4014') THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Missing IT0396') ELSE [Error Message] END AS [Error Message]
  FROM step_14_4_1
),

-- Step 15: IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_15 AS (
  SELECT *
  FROM step_14_4_2
  WHERE NOT (NULLIF(LTRIM(RTRIM([Error Message])), '') IS NULL)
)

SELECT *
FROM step_15;
