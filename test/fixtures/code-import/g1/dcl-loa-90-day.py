# DCL LOA 90 Day - Python (pandas) audit script
# Exported from ATLAS Align on 2026-01-01. 16 enabled steps; disabled steps are left out.
# Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
#
# Review:
#   - Steps 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
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
    "sap.hi0256": "",
    "sensitive_churnover": "",
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

    # Step 1.2 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["personnel_area"] != "\"2450\", \"3357\", \"3358\", \"3359\", \"3360\", \"3361\", \"3362\", \"3744\", \"3745\", \"3981\", \"3982\", \"3983\", \"3984\", \"4024\""
    df = df[~mask]

    # Step 1.3 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["employment_status_number"] != "1"
    df = df[~mask]

    # Step 2: Reference sensitive_churnover
    df = sources["sensitive_churnover"].copy()

    # Step 2.1 (THEN branch): Create Column
    # Note: The expression is free text and is copied as written. Review it before running.
    df["Days on Leave"] = REPORT DATE - start_date

    # Step 2.2 (THEN branch): Format Field
    df["persno"] = df["persno"].astype("string")

    # Step 2.3 (THEN branch): Format Field
    df["act_type"] = df["act_type"].astype("string")

    # Step 2.4 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["act_type"] != "'Start__LOA_with_Pay', 'Start__LOA_without_P', 'Start_LOA'"
    df = df[~mask]

    # Step 2.5 (THEN branch): Sort Records
    df = df.sort_values(["start_date"], ascending=[False], kind="stable")

    # Step 2.6 (THEN branch): Remove Duplicates
    df = df.drop_duplicates(subset=["persno"], keep="first")

    # Step 3: Join
    df = df.merge(sources["sensitive_churnover"], how="left", left_on="persno", right_on="persno", suffixes=("", "_sensitive_churnover"))

    # Step 4: Create Column
    df["Error Message"] = pd.NA

    # Step 5: IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["start_date"] > "run_date"
    df = df[~mask]

    # Step 6: IF / THEN
    mask = df["Days on Leave"] > 90
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Over 90 Days on Leave"

    # Step 7: IF / THEN
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
