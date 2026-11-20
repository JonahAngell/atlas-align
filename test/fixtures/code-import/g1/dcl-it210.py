# DCL IT210 - Python (pandas) audit script
# Exported from ATLAS Align on 2026-01-01. 24 enabled steps; disabled steps are left out.
# Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
#
# TODO: 6 steps could not be converted and are skipped below:
#   - Step 7: THEN action is free text and is not in the formulas: IF sap.hi0256 column "nationality" is equal to "US" or "Minor_OUTL._ISL":
#   - Step 7.1: THEN action is free text and is not in the formulas: IF sap.hi0256 column "personnel_area_text" is equal to "CASTAWAY CAY":
#   - Step 7.2: The step only marks matching rows, so there is no change to make.
#   - Step 8: The step only marks matching rows, so there is no change to make.
#   - Step 8.2: THEN action is free text and is not in the formulas: IF sap.dclit210 column "Tax exemption indicator" is blank/null:
#   - Step 8.2.1: THEN action is free text and is not in the formulas: Do Not Display all records for this employee
#
# Review:
#   - Steps 1.1, 1.2, 1.3, 2.1, 3.1, 3.2, 3.3, 7.1, 7.1.1, 7.2, 7.2.1, 8.1, 8.2, 8.2.1, 8.2.2 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
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
    "sap.dclit210": "",  # ZHRPAYR060
    "wd.passport": "",  # Data Validation - Worker Visa & Passport Data
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

    # Step 1.1 (THEN branch): Format Field
    df["persno"] = df["persno"].astype("string")

    # Step 1.2 (THEN branch): Format Field
    df["workday_employee_id"] = df["workday_employee_id"].astype("string")

    # Step 1.3 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = (df["personnel_area"] != "2540,3357,3358,3359,3360,3361,3362,3744,3745,3981,3982,3983,3984,4024") & (df["employee_group_number"] == "4") & (df["employment_status_text"] != "ACTIVE")
    df = df[~mask]

    # Step 2: Reference ZHRPAYR060
    df = sources["sap.dclit210"].copy()

    # Step 2.1 (THEN branch): Format Field
    df["PersNo."] = df["PersNo."].astype("string")

    # Step 3: Reference Data Validation - Worker Visa & Passport Data
    df = sources["wd.passport"].copy()

    # Step 3.1 (THEN branch): Format Field
    df["Worker ID"] = df["Worker ID"].astype("string")

    # Step 3.2 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["Passport Type"] == "blank/null,Country of Issue"
    df = df[~mask]

    # Step 3.3 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = the run date
    df = df[~mask]

    # Step 4: Join
    df = df.merge(sources["wd.passport"], how="left", left_on="workday_employee_id", right_on="Worker ID", suffixes=("", "_wd.passport"))

    # Step 5: Join
    df = df.merge(sources["sap.dclit210"], how="left", left_on="persno", right_on="PersNo.", suffixes=("", "_sap.dclit210"))

    # Step 6: Create Column
    df["Error Message"] = pd.NA

    # TODO (skipped) Step 7: IF / THEN
    # Reason: THEN action is free text and is not in the formulas: IF sap.hi0256 column "nationality" is equal to "US" or "Minor_OUTL._ISL":
    # Developer Logic:
    # mask = df["nationality"] == "US,Minor_OUTL._ISL"

    # TODO (skipped) Step 7.1 (THEN branch): IF / THEN
    # Reason: THEN action is free text and is not in the formulas: IF sap.hi0256 column "personnel_area_text" is equal to "CASTAWAY CAY":
    # Developer Logic:
    # mask = df["personnel_area_text"] == "CASTAWAY CAY"

    # Step 7.1.1 (THEN branch): IF / THEN
    mask = df["Tax exemption indicator"] != "Y"
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Research Domestic Tax Exemption Indicator"

    # TODO (skipped) Step 7.2 (ELSE branch): ELSE
    # Reason: The step only marks matching rows, so there is no change to make.
    # Developer Logic:
    # mask = ~(df["personnel_area_text"] == "CASTAWAY CAY")

    # Step 7.2.1 (THEN branch): IF / THEN
    mask = df["Tax exemption indicator"] != "R,blank/null"
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Research Domestic Tax Exemption Indicator"

    # TODO (skipped) Step 8: ELSE
    # Reason: The step only marks matching rows, so there is no change to make.
    # Developer Logic:
    # mask = ~(df["nationality"] == "US,Minor_OUTL._ISL")

    # Step 8.1 (THEN branch): IF / THEN
    mask = df["Tax exemption indicator"] != "Y,blank/null"
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Research International Tax Exemption Indicator"

    # TODO (skipped) Step 8.2 (THEN branch): IF / THEN
    # Reason: THEN action is free text and is not in the formulas: IF sap.dclit210 column "Tax exemption indicator" is blank/null:
    # Developer Logic:
    # mask = df["Tax exemption indicator"].fillna("").astype(str).str.strip().eq("")

    # TODO (skipped) Step 8.2.1 (THEN branch): IF / THEN
    # Reason: THEN action is free text and is not in the formulas: Do Not Display all records for this employee
    # Developer Logic:
    # mask = df["Passport Type_wd.passport"] == "AR Alien Resident Card"

    # Step 8.2.2 (THEN branch): IF / THEN
    mask = df["Passport Type_wd.passport"].fillna("").astype(str).str.strip().eq("")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "No Passport Found"

    # Step 9: IF / THEN
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
