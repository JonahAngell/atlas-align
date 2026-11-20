# DIESI SAPL - Infotypes Missing (Notebook) - Python (pandas) audit script
# Exported from ATLAS Align on 2026-01-01. 36 enabled steps; disabled steps are left out.
# Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
#
# TODO: 8 steps could not be converted and are skipped below:
#   - Step 13: The formulas mark rows that match this condition.
#   - Step 13.2: The formulas mark rows that match this condition.
#   - Step 13.3: The formulas mark rows that match this condition.
#   - Step 14: The formulas mark rows that match this condition.
#   - Step 14.2: The formulas mark rows that match this condition.
#   - Step 14.2.2: The formulas mark rows that match this condition.
#   - Step 14.3: The formulas mark rows that match this condition.
#   - Step 14.4: The formulas mark rows that match this condition.
#
# Review:
#   - Steps 1.1, 2.1, 12.1, 13.1, 13.2, 13.2.1, 13.2.2, 13.3, 13.3.1, 13.3.2, 14.1, 14.2, 14.2.1, 14.2.2, 14.2.2.1, 14.3, 14.3.1, 14.3.2, 14.4, 14.4.1, 14.4.2 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
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
    "sap.diesicst": "",
    "sap.diesicst_2": "",  # sap.diesicst__v2
    "sap.diesi27": "",
    "sap.diesi209": "",
    "sap.diesi395": "",
    "sap.diesi396": "",
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
    # Step 1: Reference DIESI-SAPL Cast List
    df = sources["sap.diesicst"].copy()

    # Step 1.1 (THEN branch): Create Column
    df["Data_Pull"] = "Current"

    # Step 2: Reference sap.diesicst__v2
    df = sources["sap.diesicst_2"].copy()

    # Step 2.1 (THEN branch): Create Column
    df["Data_Pull"] = "Previous"

    # Step 3: Reference DIESI-SAPL IT0027
    df = sources["sap.diesi27"].copy()

    # Step 4: Reference DIESI-SAPL IT0209
    df = sources["sap.diesi209"].copy()

    # Step 5: Reference DIESI-SAPL IT0395
    df = sources["sap.diesi395"].copy()

    # Step 6: Reference DIESI-SAPL IT0396
    df = sources["sap.diesi396"].copy()

    # Step 7: Join
    df = df.merge(sources["sap.diesi27"], how="outer", left_on="Pers.No.", right_on="Pers.No.", suffixes=("", "_sap.diesi27"))

    # Step 8: Join
    df = df.merge(sources["sap.diesi209"], how="outer", left_on="Pers.No.", right_on="Pers.No.", suffixes=("", "_sap.diesi209"))

    # Step 9: Join
    df = df.merge(sources["sap.diesi395"], how="outer", left_on="Pers.No.", right_on="Pers.No.", suffixes=("", "_sap.diesi395"))

    # Step 10: Join
    df = df.merge(sources["sap.diesi396"], how="outer", left_on="Pers.No.", right_on="Pers.No.", suffixes=("", "_sap.diesi396"))

    # Step 11: Create Column
    df["Error Message"] = pd.NA

    # Step 12: Union Sources
    df = pd.concat([df, sources["sap.diesicst_2"]], ignore_index=True)

    # Step 12.1 (THEN branch): Remove Duplicates
    df = df.drop_duplicates(subset=["Pers.No."], keep="first")

    # TODO (skipped) Step 13: IF / THEN
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["Data_Pull"] == "Previous"

    # Step 13.1 (THEN branch): IF / THEN
    mask = df["S_sap.diesi27"].fillna("").astype(str).str.strip().ne("") & ~df["PA"].isin(["2540", "3110", "4014"]) & (df["CoCd"] != "1058")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Research IT0027"

    # TODO (skipped) Step 13.2 (THEN branch): IF / THEN
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["S_sap.diesi395"].fillna("").astype(str).str.strip().ne("") & ((df["End Date_sap.diesi395"] == "12/31/9999") | df["End Date_sap.diesi395"].fillna("").astype(str).str.strip().eq(""))

    # Step 13.2.1 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["PA"].isin(["2540", "3110"])
    df = df[~mask]

    # Step 13.2.2 (THEN branch): Linked Inverse
    mask = ~df["PA"].isin(["2540", "3110"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Research IT0395"

    # TODO (skipped) Step 13.3 (THEN branch): IF / THEN
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["S_sap.diesi396"].fillna("").astype(str).str.strip().ne("") & ((df["End Date_sap.diesi396"] == "12/31/9999") | df["End Date_sap.diesi396"].fillna("").astype(str).str.strip().eq(""))

    # Step 13.3.1 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["PA"].isin(["2540", "3110"])
    df = df[~mask]

    # Step 13.3.2 (THEN branch): Linked Inverse
    mask = ~df["PA"].isin(["2540", "3110"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Research IT0396"

    # TODO (skipped) Step 14: Linked Inverse
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["Data_Pull"] != "Previous"

    # Step 14.1 (THEN branch): IF / THEN
    mask = df["S_sap.diesi209"].fillna("").astype(str).str.strip().eq("")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Missing IT0209"

    # TODO (skipped) Step 14.2 (THEN branch): IF / THEN
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["S_sap.diesi27"].fillna("").astype(str).str.strip().eq("")

    # Step 14.2.1 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["PA"].isin(["2540", "3110", "4014"])
    df = df[~mask]

    # TODO (skipped) Step 14.2.2 (THEN branch): Linked Inverse
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = ~df["PA"].isin(["2540", "3110", "4014"])

    # Step 14.2.2.1 (THEN branch): IF / THEN
    mask = df["CoCd"] != "1058"
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Missing IT0027"

    # TODO (skipped) Step 14.3 (THEN branch): IF / THEN
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["S_sap.diesi395"].fillna("").astype(str).str.strip().eq("")

    # Step 14.3.1 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["PA"].isin(["2540", "3110", "4014"])
    df = df[~mask]

    # Step 14.3.2 (THEN branch): Linked Inverse
    mask = ~df["PA"].isin(["2540", "3110", "4014"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Missing IT0395"

    # TODO (skipped) Step 14.4 (THEN branch): IF / THEN
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["S_sap.diesi396"].fillna("").astype(str).str.strip().eq("")

    # Step 14.4.1 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["PA"].isin(["2540", "3110", "4014"])
    df = df[~mask]

    # Step 14.4.2 (THEN branch): Linked Inverse
    mask = ~df["PA"].isin(["2540", "3110", "4014"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Missing IT0396"

    # Step 15: IF / THEN
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
