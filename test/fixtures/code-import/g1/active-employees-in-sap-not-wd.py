# Active Employees in SAP, Not WD - Python (pandas) audit script
# Exported from ATLAS Align on 2026-01-01. 43 enabled steps; disabled steps are left out.
# Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
#
# TODO: 3 steps could not be converted and are skipped below:
#   - Step 3.3.1: THEN action is free text and is not in the formulas: Split Data into individual rows by PERNR
#   - Step 4.2.1: THEN action is free text and is not in the formulas: Split Data into individual rows by PERNR
#   - Step 12: THEN action is free text and is not in the formulas: IF file sap.hi0256 column "persno" is blank/null:
#
# Review:
#   - Steps 1.1, 1.2, 3.1, 3.2, 3.3, 3.3.1, 3.4, 3.5, 4.1, 4.2, 4.2.1, 4.3, 4.4, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
#
# Before running: fill in SOURCE_PATHS and OUTPUT_PATH below.
# Requires pandas and numpy, plus openpyxl to read or write Excel files.

import sys
from pathlib import Path

import numpy as np
import pandas as pd

# -----------------------------------------------------------------------------
# Required variables: set these paths before running
# -----------------------------------------------------------------------------
# Source files to read, one per source the audit uses (.csv, .txt, .xlsx, .xls).
SOURCE_PATHS = {
    "sap.hi0256": "",  # HI0256_Maseke
    "sap.currency": "",  # SAP Currency
    "wd.int2128s": "",  # Headcount Data Position
    "wd.int2128o": "",  # Enterprise Separations
}

# File to write the audit results to (.csv or .xlsx).
OUTPUT_PATH = ""

# -----------------------------------------------------------------------------
# Reading and writing files
# -----------------------------------------------------------------------------
EXCEL_EXTENSIONS = {".xlsx", ".xlsm", ".xls"}
TEXT_EXTENSIONS = {".csv", ".txt"}


def check_paths():
    """Stops with a message when a required path is blank or a file is missing."""
    blank = [f"SOURCE_PATHS[{name!r}]" for name, path in SOURCE_PATHS.items() if not path]
    if not OUTPUT_PATH:
        blank.append("OUTPUT_PATH")
    if blank:
        sys.exit("Set these paths at the top of the script: " + ", ".join(blank))
    missing = [path for path in SOURCE_PATHS.values() if not Path(path).is_file()]
    if missing:
        sys.exit("These source files were not found: " + ", ".join(missing))


def read_source(path):
    """Reads a source file, choosing the reader from its extension."""
    extension = Path(path).suffix.lower()
    if extension in EXCEL_EXTENSIONS:
        return pd.read_excel(path)
    if extension in TEXT_EXTENSIONS:
        return pd.read_csv(path)
    sys.exit(f"{path}: use a .csv, .txt, .xlsx or .xls file.")


def write_output(df, path):
    """Writes the results, choosing the writer from the file extension."""
    extension = Path(path).suffix.lower()
    if extension in EXCEL_EXTENSIONS:
        df.to_excel(path, index=False)
    elif extension in TEXT_EXTENSIONS:
        df.to_csv(path, index=False)
    else:
        sys.exit(f"{path}: OUTPUT_PATH must end in .csv or .xlsx.")


# -----------------------------------------------------------------------------
# Audit logic
# -----------------------------------------------------------------------------
def run_audit(sources):
    """Runs the audit steps in order and returns the results."""
    # Step 1: Reference HI0256_Maseke
    df = sources["sap.hi0256"].copy()

    # Step 1.1 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["company_code_number"] == "1080,3350,3336,3362,2421,3088,3332"
    df = df[~mask]

    # Step 1.2 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["job_key_number"] == "90000001,90000002,90000003,90000004"
    df = df[~mask]

    # Step 2: Reference SAP Currency
    df = sources["sap.currency"].copy()

    # Step 3: Reference Headcount Data Position
    df = sources["wd.int2128s"].copy()

    # Step 3.1 (THEN branch): Create Column
    # Note: The expression is free text and is copied as written. Review it before running.
    df["Position Truncated"] = LEFT(position_id, 8)

    # Step 3.2 (THEN branch): Create Column
    # Note: The expression is free text and is copied as written. Review it before running.
    df["WD PERNR Character Count"] = LEN(sap_pernr)

    # Step 3.3 (THEN branch): Create Column
    # Note: The expression is free text and is copied as written. Review it before running.
    df["Cleaned PERNR"] = Split sap_pernr into one 8-character cleaned PERNR per record

    # TODO (skipped) Step 3.3.1 (THEN branch): IF / THEN
    # Reason: THEN action is free text and is not in the formulas: Split Data into individual rows by PERNR
    # Developer Logic:
    # mask = df["WD PERNR Character Count"] > 8

    # Step 3.4 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["job_profile"] == "Contingent Worker"
    df = df[~mask]

    # Step 3.5 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["company_code_ref_id"] == "1080,3350,3336,3362,2421,3088,3332"
    df = df[~mask]

    # Step 4: Reference Enterprise Separations
    df = sources["wd.int2128o"].copy()

    # Step 4.1 (THEN branch): Create Column
    # Note: The expression is free text and is copied as written. Review it before running.
    df["Separations PERNR Character Count"] = LEN(perner)

    # Step 4.2 (THEN branch): Create Column
    df["Separations PERNR"] = pd.NA

    # TODO (skipped) Step 4.2.1 (THEN branch): IF / THEN
    # Reason: THEN action is free text and is not in the formulas: Split Data into individual rows by PERNR
    # Developer Logic:
    # mask = df["Separations PERNR Character Count"] > 8

    # Step 4.3 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["worker_type"] == "Daily,Recurring"
    df = df[~mask]

    # Step 4.4 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["effective_date"] >= "Today"
    df = df[~mask]

    # Step 5: Join
    df = df.merge(sources["sap.currency"], how="left", left_on="persno", right_on="pers_no", suffixes=("", "_sap.currency"))

    # Step 6: Join
    df = df.merge(sources["wd.int2128s"], how="outer", left_on="workday_employee_id", right_on="employee_id", suffixes=("", "_wd.int2128s"))

    # Step 6.1 (THEN branch): Create Column
    df["Workday PERNR by IT9184"] = df["Cleaned PERNR"]

    # Step 6.2 (THEN branch): Create Column
    df["Workday Position by IT9184"] = df["Position Truncated"]

    # Step 6.3 (THEN branch): Create Column
    df["Workday Employee ID by IT9184"] = df["employee_id_wd.int2128s"]

    # Step 7: Join
    df = df.merge(sources["wd.int2128s"], how="outer", left_on="persno", right_on="Cleaned PERNR", suffixes=("", "_wd.int2128s"))

    # Step 7.1 (THEN branch): Create Column
    df["Workday PERNR by SAP PERNR"] = df["Cleaned PERNR_wd.int2128s"]

    # Step 7.2 (THEN branch): Create Column
    df["Workday Position Worker Type by SAP PERNR"] = df["position_worker_type_wd.int2128s"]

    # Step 7.3 (THEN branch): Create Column
    df["Workday Employee ID by SAP PERNR"] = df["employee_id_wd.int2128s"]

    # Step 7.4 (THEN branch): Create Column
    df["Workday Position By SAP PERNR"] = df["Position Truncated_wd.int2128s"]

    # Step 8: Join
    df = df.merge(sources["wd.int2128s"], how="outer", left_on="position_number", right_on="Position Truncated", suffixes=("", "_wd.int2128s"))

    # Step 8.1 (THEN branch): Create Column
    df["Workday Employee ID by SAP Position"] = df["employee_id_wd.int2128s"]

    # Step 8.2 (THEN branch): Create Column
    df["Workday Position Worker Type by SAP Position"] = df["position_worker_type_wd.int2128s"]

    # Step 9: Join
    df = df.merge(sources["wd.int2128o"], how="outer", left_on="persno", right_on="Separations PERNR", suffixes=("", "_wd.int2128o"))

    # Step 10: Create Column
    # Note: The expression is free text and is copied as written. Review it before running.
    df["Error Message"] = CONCAT_WS(' | ', [Status Mismatch], [Not Found in SAP], [Blank IT9184], [Blank IT9185], [Residual Mismatch], [SAP Position Error], [Position Mismatch], [IT9184 Mismatch], [PERNR Mismatch], [No Match])

    # Step 11: IF / THEN
    mask = (df["effective_date_wd.int2128o"] > df["recent_hire_date"]) & (df["effective_date_wd.int2128o"] > df["contract_end_date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Status Mismatch"

    # TODO (skipped) Step 12: IF / THEN
    # Reason: THEN action is free text and is not in the formulas: IF file sap.hi0256 column "persno" is blank/null:
    # Developer Logic:
    # mask = df["persno"].fillna("").astype(str).str.strip().eq("")

    # Step 13: IF / THEN
    mask = df["workday_employee_id"].fillna("").astype(str).str.strip().eq("") & df["residual_indicator"].fillna("").astype(str).str.strip().eq("") & df["persno"].fillna("").astype(str).str.strip().ne("")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Blank IT9184"

    # Step 14: IF / THEN
    mask = df["workday_position_id"].fillna("").astype(str).str.strip().eq("") & df["residual_indicator"].fillna("").astype(str).str.strip().eq("") & df["persno"].fillna("").astype(str).str.strip().ne("")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Blank IT9185"

    # Step 15: IF / THEN
    mask = df["residual_indicator"].fillna("").astype(str).str.strip().eq("") & df["position_text"].fillna("").astype(str).str.contains("Residual", case=False, regex=False) & (df["position_text"] != "'Manager, Residuals', 'Sr Manager, Residuals', 'VP, Participations & Residuals', 'Payroll Analyst - Residuals'") & ~(df["position_text"].fillna("").astype(str).str.contains("Director, Residuals", case=False, regex=False))
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Residual Mismatch"

    # Step 16: IF / THEN
    mask = df["position_number"] == "90000005"
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "SAP Position Error"

    # Step 17: IF / THEN
    mask = df["workday_position_id"] != df["position_number"]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Position Mismatch"

    # Step 18: IF / THEN
    mask = df["workday_employee_id"] != df["employee_id_wd.int2128s"]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "IT9184 Mismatch"

    # Step 19: IF / THEN
    mask = df["sap_pernr_wd.int2128s"] != df["persno"]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "PERNR Mismatch"

    # Step 20: IF / THEN
    mask = df["Workday PERNR by SAP PERNR_wd.int2128s"].fillna("").astype(str).str.strip().eq("") & df["Workday Employee ID by SAP PERNR_wd.int2128s"].fillna("").astype(str).str.strip().eq("") & df["Workday Employee ID by SAP Position_wd.int2128s"].fillna("").astype(str).str.strip().eq("") & df["Workday Employee ID by IT9184_wd.int2128s"].fillna("").astype(str).str.strip().eq("") & df["residual_indicator"].fillna("").astype(str).str.strip().eq("") & (df["job_key_number"] != "'90000001', '90000002', '90000003', '90000004'")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "No Match"

    # Step 21: IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["Error Message"].fillna("").astype(str).str.strip().eq("")
    df = df[~mask]

    return df


def main():
    check_paths()
    sources = {name: read_source(path) for name, path in SOURCE_PATHS.items()}
    results = run_audit(sources)
    write_output(results, OUTPUT_PATH)
    print(f"Wrote {len(results):,} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
