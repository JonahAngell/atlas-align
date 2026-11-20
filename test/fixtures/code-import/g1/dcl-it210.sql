-- DCL IT210 - SQL Server audit query
-- Exported from ATLAS Align on 2026-01-01. 24 enabled steps; disabled steps are left out.
-- Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
--
-- TODO: 6 steps could not be converted and are skipped below:
--   - Step 7: THEN action is free text and is not in the formulas: IF sap.hi0256 column "nationality" is equal to "US" or "Minor_OUTL._ISL":
--   - Step 7.1: THEN action is free text and is not in the formulas: IF sap.hi0256 column "personnel_area_text" is equal to "CASTAWAY CAY":
--   - Step 7.2: The step only marks matching rows, so there is no change to make.
--   - Step 8: The step only marks matching rows, so there is no change to make.
--   - Step 8.2: THEN action is free text and is not in the formulas: IF sap.dclit210 column "Tax exemption indicator" is blank/null:
--   - Step 8.2.1: THEN action is free text and is not in the formulas: Do Not Display all records for this employee
--
-- Review:
--   - Steps 1.1, 1.2, 1.3, 2.1, 3.1, 3.2, 3.3, 7.1, 7.1.1, 7.2, 7.2.1, 8.1, 8.2, 8.2.1, 8.2.2 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
--
-- Source tables (replace these names if your tables are named differently):
--   - [HI0256_Maseke]
--   - [ZHRPAYR060]
--   - [Data Validation - Worker Visa & Passport Data]
--   - [wd.passport]: Data Validation - Worker Visa & Passport Data
--   - [sap.dclit210]: ZHRPAYR060

WITH
-- Step 1: Reference HI0256_Maseke
step_1 AS (
  SELECT * FROM [HI0256_Maseke] AS [sap.hi0256]
),

-- Step 1.1 (THEN branch): Format Field
step_1_1 AS (
  SELECT [action_type],
         [personnel_area],
         [personnel_area_text],
         CAST([persno] AS NVARCHAR(4000)) AS [persno],
         [first_name],
         [last_name],
         [employment_status_text],
         [position_text],
         [country_key],
         [employee_group_number],
         [nationality],
         [workday_employee_id]
  FROM step_1
),

-- Step 1.2 (THEN branch): Format Field
step_1_2 AS (
  SELECT [action_type],
         [personnel_area],
         [personnel_area_text],
         [persno],
         [first_name],
         [last_name],
         [employment_status_text],
         [position_text],
         [country_key],
         [employee_group_number],
         [nationality],
         CAST([workday_employee_id] AS NVARCHAR(4000)) AS [workday_employee_id]
  FROM step_1_1
),

-- Step 1.3 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_1_3 AS (
  SELECT *
  FROM step_1_2
  WHERE NOT ([personnel_area] <> '2540,3357,3358,3359,3360,3361,3362,3744,3745,3981,3982,3983,3984,4024' AND [employee_group_number] = '4' AND [employment_status_text] <> 'ACTIVE')
),

-- Step 2: Reference ZHRPAYR060
step_2 AS (
  SELECT * FROM [ZHRPAYR060] AS [sap.dclit210]
),

-- Step 2.1 (THEN branch): Format Field
step_2_1 AS (
  SELECT [Tax exemption indicator],
         CAST([PersNo.] AS NVARCHAR(4000)) AS [PersNo.]
  FROM step_2
),

-- Step 3: Reference Data Validation - Worker Visa & Passport Data
step_3 AS (
  SELECT * FROM [Data Validation - Worker Visa & Passport Data] AS [wd.passport]
),

-- Step 3.1 (THEN branch): Format Field
step_3_1 AS (
  SELECT CAST([Worker ID] AS NVARCHAR(4000)) AS [Worker ID],
         [Passport Number],
         [Passport Country ISO Code],
         [Passport Issued Date],
         [Passport Expiration Date],
         [Passport Verification Date],
         [Visa ID],
         [Visa Type],
         [Visa Country ISO Code],
         [Visa Issued Date],
         [Visa Expiration Date],
         [Visa Verification Date],
         [Passport Type]
  FROM step_3
),

-- Step 3.2 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_3_2 AS (
  SELECT *
  FROM step_3_1
  WHERE NOT ([Passport Type] = 'blank/null,Country of Issue')
),

-- Step 3.3 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_3_3 AS (
  SELECT *
  FROM step_3_2
  WHERE NOT (the run date)
),

-- Step 4: Join
step_4 AS (
  SELECT [sap.hi0256].*,
         [wd.passport].[Worker ID] AS [Worker ID_wd.passport],
         [wd.passport].[Passport Number] AS [Passport Number_wd.passport],
         [wd.passport].[Passport Country ISO Code] AS [Passport Country ISO Code_wd.passport],
         [wd.passport].[Passport Issued Date] AS [Passport Issued Date_wd.passport],
         [wd.passport].[Passport Expiration Date] AS [Passport Expiration Date_wd.passport],
         [wd.passport].[Passport Verification Date] AS [Passport Verification Date_wd.passport],
         [wd.passport].[Visa ID] AS [Visa ID_wd.passport],
         [wd.passport].[Visa Type] AS [Visa Type_wd.passport],
         [wd.passport].[Visa Country ISO Code] AS [Visa Country ISO Code_wd.passport],
         [wd.passport].[Visa Issued Date] AS [Visa Issued Date_wd.passport],
         [wd.passport].[Visa Expiration Date] AS [Visa Expiration Date_wd.passport],
         [wd.passport].[Visa Verification Date] AS [Visa Verification Date_wd.passport],
         [wd.passport].[Passport Type] AS [Passport Type_wd.passport]
  FROM step_3_3 AS [sap.hi0256]
  LEFT JOIN [wd.passport] AS [wd.passport]
    ON [sap.hi0256].[workday_employee_id] = [wd.passport].[Worker ID]
),

-- Step 5: Join
step_5 AS (
  SELECT [sap.hi0256].*,
         [sap.dclit210].[Tax exemption indicator],
         [sap.dclit210].[PersNo.]
  FROM step_4 AS [sap.hi0256]
  LEFT JOIN [sap.dclit210] AS [sap.dclit210]
    ON [sap.hi0256].[persno] = [sap.dclit210].[PersNo.]
),

-- Step 6: Create Column
step_6 AS (
  SELECT *, NULL AS [Error Message]
  FROM step_5
),

-- TODO (skipped) Step 7: IF / THEN
-- Reason: THEN action is free text and is not in the formulas: IF sap.hi0256 column "nationality" is equal to "US" or "Minor_OUTL._ISL":
-- Developer Logic:
-- CASE WHEN [nationality] = 'US,Minor_OUTL._ISL' THEN 1 ELSE 0 END

-- TODO (skipped) Step 7.1 (THEN branch): IF / THEN
-- Reason: THEN action is free text and is not in the formulas: IF sap.hi0256 column "personnel_area_text" is equal to "CASTAWAY CAY":
-- Developer Logic:
-- CASE WHEN [personnel_area_text] = 'CASTAWAY CAY' THEN 1 ELSE 0 END

-- Step 7.1.1 (THEN branch): IF / THEN
step_7_1_1 AS (
  SELECT [Worker ID],
         [Passport Number],
         [Passport Country ISO Code],
         [Passport Issued Date],
         [Passport Expiration Date],
         [Passport Verification Date],
         [Visa ID],
         [Visa Type],
         [Visa Country ISO Code],
         [Visa Issued Date],
         [Visa Expiration Date],
         [Visa Verification Date],
         [Passport Type],
         [Worker ID_wd.passport],
         [Passport Number_wd.passport],
         [Passport Country ISO Code_wd.passport],
         [Passport Issued Date_wd.passport],
         [Passport Expiration Date_wd.passport],
         [Passport Verification Date_wd.passport],
         [Visa ID_wd.passport],
         [Visa Type_wd.passport],
         [Visa Country ISO Code_wd.passport],
         [Visa Issued Date_wd.passport],
         [Visa Expiration Date_wd.passport],
         [Visa Verification Date_wd.passport],
         [Passport Type_wd.passport],
         [Tax exemption indicator],
         [PersNo.],
         CASE WHEN [Tax exemption indicator] <> 'Y' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Research Domestic Tax Exemption Indicator') ELSE [Error Message] END AS [Error Message]
  FROM step_6
),

-- TODO (skipped) Step 7.2 (ELSE branch): ELSE
-- Reason: The step only marks matching rows, so there is no change to make.
-- Developer Logic:
-- CASE WHEN NOT ([personnel_area_text] = 'CASTAWAY CAY') THEN 1 ELSE 0 END

-- Step 7.2.1 (THEN branch): IF / THEN
step_7_2_1 AS (
  SELECT [Worker ID],
         [Passport Number],
         [Passport Country ISO Code],
         [Passport Issued Date],
         [Passport Expiration Date],
         [Passport Verification Date],
         [Visa ID],
         [Visa Type],
         [Visa Country ISO Code],
         [Visa Issued Date],
         [Visa Expiration Date],
         [Visa Verification Date],
         [Passport Type],
         [Worker ID_wd.passport],
         [Passport Number_wd.passport],
         [Passport Country ISO Code_wd.passport],
         [Passport Issued Date_wd.passport],
         [Passport Expiration Date_wd.passport],
         [Passport Verification Date_wd.passport],
         [Visa ID_wd.passport],
         [Visa Type_wd.passport],
         [Visa Country ISO Code_wd.passport],
         [Visa Issued Date_wd.passport],
         [Visa Expiration Date_wd.passport],
         [Visa Verification Date_wd.passport],
         [Passport Type_wd.passport],
         [Tax exemption indicator],
         [PersNo.],
         CASE WHEN [Tax exemption indicator] <> 'R,blank/null' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Research Domestic Tax Exemption Indicator') ELSE [Error Message] END AS [Error Message]
  FROM step_7_1_1
),

-- TODO (skipped) Step 8: ELSE
-- Reason: The step only marks matching rows, so there is no change to make.
-- Developer Logic:
-- CASE WHEN NOT ([nationality] = 'US,Minor_OUTL._ISL') THEN 1 ELSE 0 END

-- Step 8.1 (THEN branch): IF / THEN
step_8_1 AS (
  SELECT [Worker ID],
         [Passport Number],
         [Passport Country ISO Code],
         [Passport Issued Date],
         [Passport Expiration Date],
         [Passport Verification Date],
         [Visa ID],
         [Visa Type],
         [Visa Country ISO Code],
         [Visa Issued Date],
         [Visa Expiration Date],
         [Visa Verification Date],
         [Passport Type],
         [Worker ID_wd.passport],
         [Passport Number_wd.passport],
         [Passport Country ISO Code_wd.passport],
         [Passport Issued Date_wd.passport],
         [Passport Expiration Date_wd.passport],
         [Passport Verification Date_wd.passport],
         [Visa ID_wd.passport],
         [Visa Type_wd.passport],
         [Visa Country ISO Code_wd.passport],
         [Visa Issued Date_wd.passport],
         [Visa Expiration Date_wd.passport],
         [Visa Verification Date_wd.passport],
         [Passport Type_wd.passport],
         [Tax exemption indicator],
         [PersNo.],
         CASE WHEN [Tax exemption indicator] <> 'Y,blank/null' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Research International Tax Exemption Indicator') ELSE [Error Message] END AS [Error Message]
  FROM step_7_2_1
),

-- TODO (skipped) Step 8.2 (THEN branch): IF / THEN
-- Reason: THEN action is free text and is not in the formulas: IF sap.dclit210 column "Tax exemption indicator" is blank/null:
-- Developer Logic:
-- CASE WHEN NULLIF(LTRIM(RTRIM([Tax exemption indicator])), '') IS NULL THEN 1 ELSE 0 END

-- TODO (skipped) Step 8.2.1 (THEN branch): IF / THEN
-- Reason: THEN action is free text and is not in the formulas: Do Not Display all records for this employee
-- Developer Logic:
-- CASE WHEN [Passport Type] = 'AR Alien Resident Card' THEN 1 ELSE 0 END

-- Step 8.2.2 (THEN branch): IF / THEN
step_8_2_2 AS (
  SELECT [Worker ID],
         [Passport Number],
         [Passport Country ISO Code],
         [Passport Issued Date],
         [Passport Expiration Date],
         [Passport Verification Date],
         [Visa ID],
         [Visa Type],
         [Visa Country ISO Code],
         [Visa Issued Date],
         [Visa Expiration Date],
         [Visa Verification Date],
         [Passport Type],
         [Worker ID_wd.passport],
         [Passport Number_wd.passport],
         [Passport Country ISO Code_wd.passport],
         [Passport Issued Date_wd.passport],
         [Passport Expiration Date_wd.passport],
         [Passport Verification Date_wd.passport],
         [Visa ID_wd.passport],
         [Visa Type_wd.passport],
         [Visa Country ISO Code_wd.passport],
         [Visa Issued Date_wd.passport],
         [Visa Expiration Date_wd.passport],
         [Visa Verification Date_wd.passport],
         [Passport Type_wd.passport],
         [Tax exemption indicator],
         [PersNo.],
         CASE WHEN NULLIF(LTRIM(RTRIM([Passport Type])), '') IS NULL THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'No Passport Found') ELSE [Error Message] END AS [Error Message]
  FROM step_8_1
),

-- Step 9: IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_9 AS (
  SELECT *
  FROM step_8_2_2
  WHERE NOT (NULLIF(LTRIM(RTRIM([Error Message])), '') IS NULL)
)

SELECT *
FROM step_9;
