-- Active Employees in SAP, Not WD - SQL Server audit query
-- Exported from ATLAS Align on 2026-01-01. 43 enabled steps; disabled steps are left out.
-- Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
--
-- TODO: 3 steps could not be converted and are skipped below:
--   - Step 3.3.1: THEN action is free text and is not in the formulas: Split Data into individual rows by PERNR
--   - Step 4.2.1: THEN action is free text and is not in the formulas: Split Data into individual rows by PERNR
--   - Step 12: THEN action is free text and is not in the formulas: IF file sap.hi0256 column "persno" is blank/null:
--
-- Review:
--   - Steps 1.1, 1.2, 3.1, 3.2, 3.3, 3.3.1, 3.4, 3.5, 4.1, 4.2, 4.2.1, 4.3, 4.4, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
--
-- Source tables (replace these names if your tables are named differently):
--   - [HI0256_Maseke]
--   - [SAP Currency]
--   - [Headcount Data Position]
--   - [Enterprise Separations]
--   - [sap.currency]: SAP Currency
--   - [wd.int2128s]: Headcount Data Position
--   - [wd.int2128o]: Enterprise Separations

WITH
-- Step 1: Reference HI0256_Maseke
step_1 AS (
  SELECT * FROM [HI0256_Maseke] AS [sap.hi0256]
),

-- Step 1.1 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_1_1 AS (
  SELECT *
  FROM step_1
  WHERE NOT ([company_code_number] = '1080,3350,3336,3362,2421,3088,3332')
),

-- Step 1.2 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_1_2 AS (
  SELECT *
  FROM step_1_1
  WHERE NOT ([job_key_number] = '90000001,90000002,90000003,90000004')
),

-- Step 2: Reference SAP Currency
step_2 AS (
  SELECT * FROM [SAP Currency] AS [sap.currency]
),

-- Step 3: Reference Headcount Data Position
step_3 AS (
  SELECT * FROM [Headcount Data Position] AS [wd.int2128s]
),

-- Step 3.1 (THEN branch): Create Column
-- Note: The expression is free text and is copied as written. Review it before running.
step_3_1 AS (
  SELECT [employee_id],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         LEFT(position_id, 8) AS [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR]
  FROM step_3
),

-- Step 3.2 (THEN branch): Create Column
-- Note: The expression is free text and is copied as written. Review it before running.
step_3_2 AS (
  SELECT [employee_id],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         LEN(sap_pernr) AS [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR]
  FROM step_3_1
),

-- Step 3.3 (THEN branch): Create Column
-- Note: The expression is free text and is copied as written. Review it before running.
step_3_3 AS (
  SELECT [employee_id],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         Split sap_pernr into one 8-character cleaned PERNR per record AS [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR]
  FROM step_3_2
),

-- TODO (skipped) Step 3.3.1 (THEN branch): IF / THEN
-- Reason: THEN action is free text and is not in the formulas: Split Data into individual rows by PERNR
-- Developer Logic:
-- CASE WHEN [WD PERNR Character Count] > 8 THEN 1 ELSE 0 END

-- Step 3.4 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_3_4 AS (
  SELECT *
  FROM step_3_3
  WHERE NOT ([job_profile] = 'Contingent Worker')
),

-- Step 3.5 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_3_5 AS (
  SELECT *
  FROM step_3_4
  WHERE NOT ([company_code_ref_id] = '1080,3350,3336,3362,2421,3088,3332')
),

-- Step 4: Reference Enterprise Separations
step_4 AS (
  SELECT * FROM [Enterprise Separations] AS [wd.int2128o]
),

-- Step 4.1 (THEN branch): Create Column
-- Note: The expression is free text and is copied as written. Review it before running.
step_4_1 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         LEN(perner) AS [Separations PERNR Character Count]
  FROM step_4
),

-- Step 4.2 (THEN branch): Create Column
step_4_2 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         NULL AS [Separations PERNR],
         [Separations PERNR Character Count]
  FROM step_4_1
),

-- TODO (skipped) Step 4.2.1 (THEN branch): IF / THEN
-- Reason: THEN action is free text and is not in the formulas: Split Data into individual rows by PERNR
-- Developer Logic:
-- CASE WHEN [Separations PERNR Character Count] > 8 THEN 1 ELSE 0 END

-- Step 4.3 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_4_3 AS (
  SELECT *
  FROM step_4_2
  WHERE NOT ([worker_type] = 'Daily,Recurring')
),

-- Step 4.4 (THEN branch): IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_4_4 AS (
  SELECT *
  FROM step_4_3
  WHERE NOT ([effective_date] >= 'Today')
),

-- Step 5: Join
step_5 AS (
  SELECT [sap.hi0256].*,
         [sap.currency].[residual_indicator],
         [sap.currency].[pers_no]
  FROM step_4_4 AS [sap.hi0256]
  LEFT JOIN [sap.currency] AS [sap.currency]
    ON [sap.hi0256].[persno] = [sap.currency].[pers_no]
),

-- Step 6: Join
step_6 AS (
  SELECT [sap.hi0256].*,
         [wd.int2128s].[employee_id] AS [employee_id_wd.int2128s],
         [wd.int2128s].[company_code_ref_id],
         [wd.int2128s].[job_profile],
         [wd.int2128s].[position_id],
         [wd.int2128s].[position_worker_type],
         [wd.int2128s].[sap_pernr],
         [wd.int2128s].[Cleaned PERNR],
         [wd.int2128s].[Position Truncated],
         [wd.int2128s].[WD PERNR Character Count],
         [wd.int2128s].[Workday Employee ID by IT9184],
         [wd.int2128s].[Workday Employee ID by SAP PERNR],
         [wd.int2128s].[Workday Employee ID by SAP Position],
         [wd.int2128s].[Workday PERNR by SAP PERNR]
  FROM step_5 AS [sap.hi0256]
  FULL OUTER JOIN [wd.int2128s] AS [wd.int2128s]
    ON [sap.hi0256].[workday_employee_id] = [wd.int2128s].[employee_id]
),

-- Step 6.1 (THEN branch): Create Column
step_6_1 AS (
  SELECT *, [Cleaned PERNR] AS [Workday PERNR by IT9184]
  FROM step_6
),

-- Step 6.2 (THEN branch): Create Column
step_6_2 AS (
  SELECT *, [Position Truncated] AS [Workday Position by IT9184]
  FROM step_6_1
),

-- Step 6.3 (THEN branch): Create Column
step_6_3 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [employee_id_wd.int2128s] AS [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184]
  FROM step_6_2
),

-- Step 7: Join
step_7 AS (
  SELECT [sap.hi0256].*,
         [wd.int2128s].[employee_id] AS [employee_id_wd.int2128s],
         [wd.int2128s].[company_code_ref_id] AS [company_code_ref_id_wd.int2128s],
         [wd.int2128s].[job_profile] AS [job_profile_wd.int2128s],
         [wd.int2128s].[position_id] AS [position_id_wd.int2128s],
         [wd.int2128s].[position_worker_type] AS [position_worker_type_wd.int2128s],
         [wd.int2128s].[sap_pernr] AS [sap_pernr_wd.int2128s],
         [wd.int2128s].[Cleaned PERNR] AS [Cleaned PERNR_wd.int2128s],
         [wd.int2128s].[Position Truncated] AS [Position Truncated_wd.int2128s],
         [wd.int2128s].[WD PERNR Character Count] AS [WD PERNR Character Count_wd.int2128s],
         [wd.int2128s].[Workday Employee ID by IT9184] AS [Workday Employee ID by IT9184_wd.int2128s],
         [wd.int2128s].[Workday Employee ID by SAP PERNR] AS [Workday Employee ID by SAP PERNR_wd.int2128s],
         [wd.int2128s].[Workday Employee ID by SAP Position] AS [Workday Employee ID by SAP Position_wd.int2128s],
         [wd.int2128s].[Workday PERNR by SAP PERNR] AS [Workday PERNR by SAP PERNR_wd.int2128s]
  FROM step_6_3 AS [sap.hi0256]
  FULL OUTER JOIN [wd.int2128s] AS [wd.int2128s]
    ON [sap.hi0256].[persno] = [wd.int2128s].[Cleaned PERNR]
),

-- Step 7.1 (THEN branch): Create Column
step_7_1 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Cleaned PERNR] AS [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s]
  FROM step_7
),

-- Step 7.2 (THEN branch): Create Column
step_7_2 AS (
  SELECT *, [position_worker_type] AS [Workday Position Worker Type by SAP PERNR]
  FROM step_7_1
),

-- Step 7.3 (THEN branch): Create Column
step_7_3 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [employee_id_wd.int2128s] AS [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR]
  FROM step_7_2
),

-- Step 7.4 (THEN branch): Create Column
step_7_4 AS (
  SELECT *, [Position Truncated] AS [Workday Position By SAP PERNR]
  FROM step_7_3
),

-- Step 8: Join
step_8 AS (
  SELECT [sap.hi0256].*,
         [wd.int2128s].[employee_id] AS [employee_id_wd.int2128s],
         [wd.int2128s].[company_code_ref_id] AS [company_code_ref_id_wd.int2128s],
         [wd.int2128s].[job_profile] AS [job_profile_wd.int2128s],
         [wd.int2128s].[position_id] AS [position_id_wd.int2128s],
         [wd.int2128s].[position_worker_type] AS [position_worker_type_wd.int2128s],
         [wd.int2128s].[sap_pernr] AS [sap_pernr_wd.int2128s],
         [wd.int2128s].[Cleaned PERNR] AS [Cleaned PERNR_wd.int2128s],
         [wd.int2128s].[Position Truncated] AS [Position Truncated_wd.int2128s],
         [wd.int2128s].[WD PERNR Character Count] AS [WD PERNR Character Count_wd.int2128s],
         [wd.int2128s].[Workday Employee ID by IT9184] AS [Workday Employee ID by IT9184_wd.int2128s],
         [wd.int2128s].[Workday Employee ID by SAP PERNR] AS [Workday Employee ID by SAP PERNR_wd.int2128s],
         [wd.int2128s].[Workday Employee ID by SAP Position] AS [Workday Employee ID by SAP Position_wd.int2128s],
         [wd.int2128s].[Workday PERNR by SAP PERNR] AS [Workday PERNR by SAP PERNR_wd.int2128s]
  FROM step_7_4 AS [sap.hi0256]
  FULL OUTER JOIN [wd.int2128s] AS [wd.int2128s]
    ON [sap.hi0256].[position_number] = [wd.int2128s].[Position Truncated]
),

-- Step 8.1 (THEN branch): Create Column
step_8_1 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [employee_id_wd.int2128s] AS [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR],
         [Workday Position By SAP PERNR]
  FROM step_8
),

-- Step 8.2 (THEN branch): Create Column
step_8_2 AS (
  SELECT *, [position_worker_type] AS [Workday Position Worker Type by SAP Position]
  FROM step_8_1
),

-- Step 9: Join
step_9 AS (
  SELECT [sap.hi0256].*,
         [wd.int2128o].[employee_id] AS [employee_id_wd.int2128o],
         [wd.int2128o].[effective_date] AS [effective_date_wd.int2128o],
         [wd.int2128o].[perner] AS [perner_wd.int2128o],
         [wd.int2128o].[worker_type] AS [worker_type_wd.int2128o],
         [wd.int2128o].[Separations PERNR] AS [Separations PERNR_wd.int2128o],
         [wd.int2128o].[Separations PERNR Character Count] AS [Separations PERNR Character Count_wd.int2128o]
  FROM step_8_2 AS [sap.hi0256]
  FULL OUTER JOIN [wd.int2128o] AS [wd.int2128o]
    ON [sap.hi0256].[persno] = [wd.int2128o].[Separations PERNR]
),

-- Step 10: Create Column
-- Note: The expression is free text and is copied as written. Review it before running.
step_10 AS (
  SELECT *, CONCAT_WS(' | ', [Status Mismatch], [Not Found in SAP], [Blank IT9184], [Blank IT9185], [Residual Mismatch], [SAP Position Error], [Position Mismatch], [IT9184 Mismatch], [PERNR Mismatch], [No Match]) AS [Error Message]
  FROM step_9
),

-- Step 11: IF / THEN
step_11 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR],
         [Workday Position By SAP PERNR],
         [Workday Position Worker Type by SAP Position],
         [employee_id_wd.int2128o],
         [effective_date_wd.int2128o],
         [perner_wd.int2128o],
         [worker_type_wd.int2128o],
         [Separations PERNR_wd.int2128o],
         [Separations PERNR Character Count_wd.int2128o],
         CASE WHEN [effective_date] > [recent_hire_date] AND [effective_date] > [contract_end_date] THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Status Mismatch') ELSE [Error Message] END AS [Error Message]
  FROM step_10
),

-- TODO (skipped) Step 12: IF / THEN
-- Reason: THEN action is free text and is not in the formulas: IF file sap.hi0256 column "persno" is blank/null:
-- Developer Logic:
-- CASE WHEN NULLIF(LTRIM(RTRIM([persno])), '') IS NULL THEN 1 ELSE 0 END

-- Step 13: IF / THEN
step_13 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR],
         [Workday Position By SAP PERNR],
         [Workday Position Worker Type by SAP Position],
         [employee_id_wd.int2128o],
         [effective_date_wd.int2128o],
         [perner_wd.int2128o],
         [worker_type_wd.int2128o],
         [Separations PERNR_wd.int2128o],
         [Separations PERNR Character Count_wd.int2128o],
         CASE WHEN NULLIF(LTRIM(RTRIM([workday_employee_id])), '') IS NULL AND NULLIF(LTRIM(RTRIM([residual_indicator])), '') IS NULL AND NULLIF(LTRIM(RTRIM([persno])), '') IS NOT NULL THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Blank IT9184') ELSE [Error Message] END AS [Error Message]
  FROM step_11
),

-- Step 14: IF / THEN
step_14 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR],
         [Workday Position By SAP PERNR],
         [Workday Position Worker Type by SAP Position],
         [employee_id_wd.int2128o],
         [effective_date_wd.int2128o],
         [perner_wd.int2128o],
         [worker_type_wd.int2128o],
         [Separations PERNR_wd.int2128o],
         [Separations PERNR Character Count_wd.int2128o],
         CASE WHEN NULLIF(LTRIM(RTRIM([workday_position_id])), '') IS NULL AND NULLIF(LTRIM(RTRIM([residual_indicator])), '') IS NULL AND NULLIF(LTRIM(RTRIM([persno])), '') IS NOT NULL THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Blank IT9185') ELSE [Error Message] END AS [Error Message]
  FROM step_13
),

-- Step 15: IF / THEN
step_15 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR],
         [Workday Position By SAP PERNR],
         [Workday Position Worker Type by SAP Position],
         [employee_id_wd.int2128o],
         [effective_date_wd.int2128o],
         [perner_wd.int2128o],
         [worker_type_wd.int2128o],
         [Separations PERNR_wd.int2128o],
         [Separations PERNR Character Count_wd.int2128o],
         CASE WHEN NULLIF(LTRIM(RTRIM([residual_indicator])), '') IS NULL AND [position_text] LIKE '%Residual%' AND [position_text] <> '''Manager, Residuals'', ''Sr Manager, Residuals'', ''VP, Participations & Residuals'', ''Payroll Analyst - Residuals''' AND [position_text] NOT LIKE '%Director, Residuals%' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Residual Mismatch') ELSE [Error Message] END AS [Error Message]
  FROM step_14
),

-- Step 16: IF / THEN
step_16 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR],
         [Workday Position By SAP PERNR],
         [Workday Position Worker Type by SAP Position],
         [employee_id_wd.int2128o],
         [effective_date_wd.int2128o],
         [perner_wd.int2128o],
         [worker_type_wd.int2128o],
         [Separations PERNR_wd.int2128o],
         [Separations PERNR Character Count_wd.int2128o],
         CASE WHEN [position_number] = '90000005' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'SAP Position Error') ELSE [Error Message] END AS [Error Message]
  FROM step_15
),

-- Step 17: IF / THEN
step_17 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR],
         [Workday Position By SAP PERNR],
         [Workday Position Worker Type by SAP Position],
         [employee_id_wd.int2128o],
         [effective_date_wd.int2128o],
         [perner_wd.int2128o],
         [worker_type_wd.int2128o],
         [Separations PERNR_wd.int2128o],
         [Separations PERNR Character Count_wd.int2128o],
         CASE WHEN [workday_position_id] <> [position_number] THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'Position Mismatch') ELSE [Error Message] END AS [Error Message]
  FROM step_16
),

-- Step 18: IF / THEN
step_18 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR],
         [Workday Position By SAP PERNR],
         [Workday Position Worker Type by SAP Position],
         [employee_id_wd.int2128o],
         [effective_date_wd.int2128o],
         [perner_wd.int2128o],
         [worker_type_wd.int2128o],
         [Separations PERNR_wd.int2128o],
         [Separations PERNR Character Count_wd.int2128o],
         CASE WHEN [workday_employee_id] <> [employee_id_wd.int2128s] THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'IT9184 Mismatch') ELSE [Error Message] END AS [Error Message]
  FROM step_17
),

-- Step 19: IF / THEN
step_19 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR],
         [Workday Position By SAP PERNR],
         [Workday Position Worker Type by SAP Position],
         [employee_id_wd.int2128o],
         [effective_date_wd.int2128o],
         [perner_wd.int2128o],
         [worker_type_wd.int2128o],
         [Separations PERNR_wd.int2128o],
         [Separations PERNR Character Count_wd.int2128o],
         CASE WHEN [sap_pernr] <> [persno] THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'PERNR Mismatch') ELSE [Error Message] END AS [Error Message]
  FROM step_18
),

-- Step 20: IF / THEN
step_20 AS (
  SELECT [employee_id],
         [effective_date],
         [perner],
         [worker_type],
         [Separations PERNR],
         [Separations PERNR Character Count],
         [residual_indicator],
         [pers_no],
         [employee_id_wd.int2128s],
         [company_code_ref_id],
         [job_profile],
         [position_id],
         [position_worker_type],
         [sap_pernr],
         [Cleaned PERNR],
         [Position Truncated],
         [WD PERNR Character Count],
         [Workday Employee ID by IT9184],
         [Workday Employee ID by SAP PERNR],
         [Workday Employee ID by SAP Position],
         [Workday PERNR by SAP PERNR],
         [Workday PERNR by IT9184],
         [Workday Position by IT9184],
         [company_code_ref_id_wd.int2128s],
         [job_profile_wd.int2128s],
         [position_id_wd.int2128s],
         [position_worker_type_wd.int2128s],
         [sap_pernr_wd.int2128s],
         [Cleaned PERNR_wd.int2128s],
         [Position Truncated_wd.int2128s],
         [WD PERNR Character Count_wd.int2128s],
         [Workday Employee ID by IT9184_wd.int2128s],
         [Workday Employee ID by SAP PERNR_wd.int2128s],
         [Workday Employee ID by SAP Position_wd.int2128s],
         [Workday PERNR by SAP PERNR_wd.int2128s],
         [Workday Position Worker Type by SAP PERNR],
         [Workday Position By SAP PERNR],
         [Workday Position Worker Type by SAP Position],
         [employee_id_wd.int2128o],
         [effective_date_wd.int2128o],
         [perner_wd.int2128o],
         [worker_type_wd.int2128o],
         [Separations PERNR_wd.int2128o],
         [Separations PERNR Character Count_wd.int2128o],
         CASE WHEN NULLIF(LTRIM(RTRIM([Workday PERNR by SAP PERNR])), '') IS NULL AND NULLIF(LTRIM(RTRIM([Workday Employee ID by SAP PERNR])), '') IS NULL AND NULLIF(LTRIM(RTRIM([Workday Employee ID by SAP Position])), '') IS NULL AND NULLIF(LTRIM(RTRIM([Workday Employee ID by IT9184])), '') IS NULL AND NULLIF(LTRIM(RTRIM([residual_indicator])), '') IS NULL AND [job_key_number] <> '''90000001'', ''90000002'', ''90000003'', ''90000004''' THEN CONCAT_WS('||', NULLIF([Error Message], ''), 'No Match') ELSE [Error Message] END AS [Error Message]
  FROM step_19
),

-- Step 21: IF / THEN
-- Note: Do Not Display - Keep only rows that do not match this condition.
step_21 AS (
  SELECT *
  FROM step_20
  WHERE NOT (NULLIF(LTRIM(RTRIM([Error Message])), '') IS NULL)
)

SELECT *
FROM step_21;
