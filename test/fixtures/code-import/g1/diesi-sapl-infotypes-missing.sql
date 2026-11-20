-- DIESI SAPL - Infotypes Missing - SQL Server audit query
-- Exported from ATLAS Align on 2026-01-01. 40 enabled steps; disabled steps are left out.
-- Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
--
-- TODO: 9 steps could not be converted and are skipped below:
--   - Step 1.2: Missing value: [delimiter].
--   - Step 1.3: Missing value: [delimiter].
--   - Step 2.2: Missing value: [delimiter].
--   - Step 2.3: Missing value: [delimiter].
--   - Step 14: THEN action is free text and is not in the formulas: IF file Cast List column "Data_Pull" is equal to "Previous":
--   - Step 14.2: THEN action is free text and is not in the formulas: IF file sap.diesi395 column "S" is blank/null AND file sap.diesi395 column "End Date" is equal to "12/31/9999" or "blank/null":
--   - Step 14.3: THEN action is free text and is not in the formulas: IF file sap.diesi396 column "S" is blank/null AND file sap.diesi395 column "End Date" is equal to "12/31/9999" or "blank/null":
--   - Step 15: The step only marks matching rows, so there is no change to make.
--   - Step 15.3: The step only marks matching rows, so there is no change to make.
--
-- Review:
--   - Steps 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 7.1, 7.2, 13.1, 14.1, 14.2, 14.2.1, 14.2.2, 14.3, 14.3.1, 14.3.2, 14.4, 15.1, 15.2, 15.3, 15.3.1, 15.4, 15.5, 15.6, 15.7 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
--   - The audit does not list the columns of sap.diesicst 2, so those steps use SELECT *. Check for columns selected twice.
--
-- Source tables (replace these names if your tables are named differently):
--   - [DIESI-SAPL Cast List]
--   - [DIESI-SAPL IT0395]
--   - [DIESI-SAPL IT0396]
--   - [DIESI SAPL IT209 - ATLAS]
--   - [DIESI-SAPL IT0027]
--   - [DIESI-SAPL IT0209]
--   - [sap.diesi395]: DIESI-SAPL IT0395
--   - [sap.diesi396]: DIESI-SAPL IT0396
--   - [sap.diesi27]: DIESI-SAPL IT0027
--   - [sap.diesi209]: DIESI-SAPL IT0209
--   - [sap.diesicst]: DIESI-SAPL Cast List

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

-- TODO (skipped) Step 1.2 (THEN branch): Split Field
-- Reason: Missing value: [delimiter].
-- Developer Logic:
-- LEFT([sap.diesicst].[LAST NAME FIRST NAME], CHARINDEX('[delimiter]', [sap.diesicst].[LAST NAME FIRST NAME] + '[delimiter]') - 1) AS [Last Name]

-- TODO (skipped) Step 1.3 (THEN branch): Split Field
-- Reason: Missing value: [delimiter].
-- Developer Logic:
-- RIGHT([sap.diesicst].[LAST NAME FIRST NAME], CHARINDEX(REVERSE('[delimiter]'), REVERSE('[delimiter]' + [sap.diesicst].[LAST NAME FIRST NAME])) - 1) AS [First Name]

-- Step 2: Reference DIESI-SAPL Cast List
step_2 AS (
  SELECT * FROM [DIESI-SAPL Cast List] AS [sap.diesicst 2]
),

-- Step 2.1 (THEN branch): Create Column
step_2_1 AS (
  SELECT *, 'Previous' AS [Data_Pull]
  FROM step_2
),

-- TODO (skipped) Step 2.2 (THEN branch): Split Field
-- Reason: Missing value: [delimiter].
-- Developer Logic:
-- RIGHT([sap.diesicst 2].[LAST NAME FIRST NAME], CHARINDEX(REVERSE('[delimiter]'), REVERSE('[delimiter]' + [sap.diesicst 2].[LAST NAME FIRST NAME])) - 1) AS [First Name]

-- TODO (skipped) Step 2.3 (THEN branch): Split Field
-- Reason: Missing value: [delimiter].
-- Developer Logic:
-- LEFT([sap.diesicst 2].[LAST NAME FIRST NAME], CHARINDEX('[delimiter]', [sap.diesicst 2].[LAST NAME FIRST NAME] + '[delimiter]') - 1) AS [Last Name]

-- Step 3: Reference DIESI-SAPL IT0395
step_3 AS (
  SELECT * FROM [DIESI-SAPL IT0395] AS [sap.diesi395]
),

-- Step 4: Reference DIESI-SAPL IT0396
step_4 AS (
  SELECT * FROM [DIESI-SAPL IT0396] AS [sap.diesi396]
),

-- Step 5: Reference DIESI SAPL IT209 - ATLAS
step_5 AS (
  SELECT * FROM [DIESI SAPL IT209 - ATLAS] AS [sap.diesi209]
),

-- Step 6: Reference DIESI-SAPL IT0027
step_6 AS (
  SELECT * FROM [DIESI-SAPL IT0027] AS [sap.diesi27]
),

-- Step 7: Reference DIESI-SAPL IT0209
step_7 AS (
  SELECT * FROM [DIESI-SAPL IT0209] AS [sap.diesi209]
),

-- Step 7.1 (THEN branch): Sort Records
-- The sort order is applied in the final SELECT (and to later Remove Duplicates steps).

-- Step 7.2 (THEN branch): Remove Duplicates
step_7_2_ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY [Pers.No.] ORDER BY [Chngd On] DESC) AS [Duplicate Rank]
  FROM step_7
),

step_7_2 AS (
  SELECT [Pers.No.],
         [S],
         [Auth]
  FROM step_7_2_ranked
  WHERE [Duplicate Rank] = 1
),

-- Step 8: Join
step_8 AS (
  SELECT [Cast List].*,
         [sap.diesi395].[S] AS [S_sap.diesi395],
         [sap.diesi395].[End Date]
  FROM step_7_2 AS [Cast List]
  LEFT JOIN [sap.diesi395] AS [sap.diesi395]
    ON [Cast List].[Pers.No.] = [sap.diesi395].[Pers.No.]
),

-- Step 9: Join
step_9 AS (
  SELECT [Cast List].*,
         [sap.diesi396].[S] AS [S_sap.diesi396],
         [sap.diesi396].[End Date] AS [End Date_sap.diesi396]
  FROM step_8 AS [Cast List]
  LEFT JOIN [sap.diesi396] AS [sap.diesi396]
    ON [Cast List].[Pers.No.] = [sap.diesi396].[Pers.No.]
),

-- Step 10: Join
step_10 AS (
  SELECT [Cast List].*,
         [sap.diesi27].[S] AS [S_sap.diesi27]
  FROM step_9 AS [Cast List]
  LEFT JOIN [sap.diesi27] AS [sap.diesi27]
    ON [Cast List].[Pers.No.] = [sap.diesi27].[Pers.No.]
),

-- Step 11: Join
step_11 AS (
  SELECT [Cast List].*,
         [sap.diesi209].[S] AS [S_sap.diesi209],
         [sap.diesi209].[Auth] AS [Auth_sap.diesi209]
  FROM step_10 AS [Cast List]
  LEFT JOIN [sap.diesi209] AS [sap.diesi209]
    ON [Cast List].[Pers.No.] = [sap.diesi209].[Pers.No.]
),

-- Step 12: Create Column
step_12 AS (
  SELECT *, NULL AS [Error Message]
  FROM step_11
),

-- Step 13: Union Sources
step_13 AS (
  SELECT * FROM step_12
  UNION ALL
  SELECT * FROM [sap.diesicst]
),

-- Step 13.1 (THEN branch): Remove Duplicates
step_13_1_ranked AS (
  SELECT *, COUNT(*) OVER (PARTITION BY [Pers.No.]) AS [Duplicate Count]
  FROM step_13
),

step_13_1 AS (
  SELECT [Pers.No.],
         [S],
         [Auth],
         [S_sap.diesi395],
         [End Date],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth_sap.diesi209],
         [Error Message]
  FROM step_13_1_ranked
  WHERE [Duplicate Count] = 1
),

-- TODO (skipped) Step 14: IF / THEN
-- Reason: THEN action is free text and is not in the formulas: IF file Cast List column "Data_Pull" is equal to "Previous":
-- Developer Logic:
-- CASE WHEN [Data_Pull] = 'Previous' THEN 1 ELSE 0 END

-- Step 14.1 (THEN branch): IF / THEN
step_14_1 AS (
  SELECT [Pers.No.],
         [S],
         [Auth],
         [S_sap.diesi395],
         [End Date],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth_sap.diesi209],
         CASE WHEN NULLIF(LTRIM(RTRIM([S_sap.diesi27])), '') IS NOT NULL AND [PA] NOT IN ('2540', '3110', '4014') AND [CoCd] <> '1058' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Research IT0027') ELSE [Error Message] END AS [Error Message]
  FROM step_13_1
),

-- TODO (skipped) Step 14.2 (THEN branch): IF / THEN
-- Reason: THEN action is free text and is not in the formulas: IF file sap.diesi395 column "S" is blank/null AND file sap.diesi395 column "End Date" is equal to "12/31/9999" or "blank/null":
-- Developer Logic:
-- CASE WHEN NULLIF(LTRIM(RTRIM([sap.diesi395].[S])), '') IS NULL AND [sap.diesi395].[End Date] IN ('12/31/9999', 'blank/null') THEN 1 ELSE 0 END

-- Step 14.2.1 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_14_2_1 AS (
  SELECT *
  FROM step_14_1
  WHERE NOT ([PA] IN ('2540', '3110'))
),

-- Step 14.2.2 (ELSE branch): ELSE
step_14_2_2 AS (
  SELECT [Pers.No.],
         [S],
         [Auth],
         [S_sap.diesi395],
         [End Date],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth_sap.diesi209],
         CASE WHEN NOT ([PA] IN ('2540', '3110')) THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Research IT0395') ELSE [Error Message] END AS [Error Message]
  FROM step_14_2_1
),

-- TODO (skipped) Step 14.3 (THEN branch): IF / THEN
-- Reason: THEN action is free text and is not in the formulas: IF file sap.diesi396 column "S" is blank/null AND file sap.diesi395 column "End Date" is equal to "12/31/9999" or "blank/null":
-- Developer Logic:
-- CASE WHEN NULLIF(LTRIM(RTRIM([sap.diesi396].[S])), '') IS NULL AND [sap.diesi395].[End Date] IN ('12/31/9999', 'blank/null') THEN 1 ELSE 0 END

-- Step 14.3.1 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_14_3_1 AS (
  SELECT *
  FROM step_14_2_2
  WHERE NOT ([PA] IN ('2540', '3110'))
),

-- Step 14.3.2 (ELSE branch): ELSE
step_14_3_2 AS (
  SELECT [Pers.No.],
         [S],
         [Auth],
         [S_sap.diesi395],
         [End Date],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth_sap.diesi209],
         CASE WHEN NOT ([PA] IN ('2540', '3110')) THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Research IT0396') ELSE [Error Message] END AS [Error Message]
  FROM step_14_3_1
),

-- Step 14.4 (THEN branch): IF / THEN
step_14_4 AS (
  SELECT [Pers.No.],
         [S],
         [Auth],
         [S_sap.diesi395],
         [End Date],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth_sap.diesi209],
         CASE WHEN [Changed By] = 'SHRBATCH' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Research IT0209') ELSE [Error Message] END AS [Error Message]
  FROM step_14_3_2
),

-- TODO (skipped) Step 15: ELSE
-- Reason: The step only marks matching rows, so there is no change to make.
-- Developer Logic:
-- CASE WHEN NOT ([Data_Pull] = 'Previous') THEN 1 ELSE 0 END

-- Step 15.1 (THEN branch): IF / THEN
step_15_1 AS (
  SELECT [Pers.No.],
         [S],
         [Auth],
         [S_sap.diesi395],
         [End Date],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth_sap.diesi209],
         CASE WHEN NULLIF(LTRIM(RTRIM([S_sap.diesi209])), '') IS NULL THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Missing IT0209') ELSE [Error Message] END AS [Error Message]
  FROM step_14_4
),

-- Step 15.2 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_15_2 AS (
  SELECT *
  FROM step_15_1
  WHERE NOT (NULLIF(LTRIM(RTRIM([S_sap.diesi27])), '') IS NULL AND [PA] IN ('2540', '3110', '4014'))
),

-- TODO (skipped) Step 15.3 (ELSE branch): ELSE
-- Reason: The step only marks matching rows, so there is no change to make.
-- Developer Logic:
-- CASE WHEN NOT (NULLIF(LTRIM(RTRIM([sap.diesi27].[S])), '') IS NULL AND [Cast List].[PA] IN ('2540', '3110', '4014')) THEN 1 ELSE 0 END

-- Step 15.3.1 (THEN branch): IF / THEN
step_15_3_1 AS (
  SELECT [Pers.No.],
         [S],
         [Auth],
         [S_sap.diesi395],
         [End Date],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth_sap.diesi209],
         CASE WHEN [CoCd] = '1058' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Missing IT0027') ELSE [Error Message] END AS [Error Message]
  FROM step_15_2
),

-- Step 15.4 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_15_4 AS (
  SELECT *
  FROM step_15_3_1
  WHERE NOT (NULLIF(LTRIM(RTRIM([S_sap.diesi395])), '') IS NULL AND [PA] IN ('2540', '3110', '4014'))
),

-- Step 15.5 (ELSE branch): ELSE
step_15_5 AS (
  SELECT [Pers.No.],
         [S],
         [Auth],
         [S_sap.diesi395],
         [End Date],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth_sap.diesi209],
         CASE WHEN NOT (NULLIF(LTRIM(RTRIM([S_sap.diesi395])), '') IS NULL AND [PA] IN ('2540', '3110', '4014')) THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Missing IT0395') ELSE [Error Message] END AS [Error Message]
  FROM step_15_4
),

-- Step 15.6 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_15_6 AS (
  SELECT *
  FROM step_15_5
  WHERE NOT (NULLIF(LTRIM(RTRIM([S_sap.diesi396])), '') IS NULL AND [PA] IN ('2540', '3110', '4014'))
),

-- Step 15.7 (ELSE branch): ELSE
step_15_7 AS (
  SELECT [Pers.No.],
         [S],
         [Auth],
         [S_sap.diesi395],
         [End Date],
         [S_sap.diesi396],
         [End Date_sap.diesi396],
         [S_sap.diesi27],
         [S_sap.diesi209],
         [Auth_sap.diesi209],
         CASE WHEN NOT (NULLIF(LTRIM(RTRIM([S_sap.diesi396])), '') IS NULL AND [PA] IN ('2540', '3110', '4014')) THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Missing IT0396') ELSE [Error Message] END AS [Error Message]
  FROM step_15_6
)

SELECT *
FROM step_15_7
ORDER BY [Chngd On] DESC;
