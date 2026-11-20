# Sample Audit Logic Flow - Python (pandas) audit script
# Exported from ATLAS Align on 2026-01-01. 2 enabled steps; disabled steps are left out.
# Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
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
    "primary.source": "",  # Primary Source File
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
    # Step 1: Reference primary source
    df = sources["primary.source"].copy()

    # Step 2: Apply IF condition
    mask = df["Status"] == "Open"
    df["Audit Result"] = df.get("Audit Result", "")
    existing = df.loc[mask, "Audit Result"].fillna("").astype(str)
    df.loc[mask, "Audit Result"] = existing.where(existing == "", existing + "||") + "Review"

    return df


def main():
    check_paths()
    sources = {name: read_source(path) for name, path in SOURCE_PATHS.items()}
    results = run_audit(sources)
    write_output(results, OUTPUT_PATH)
    print(f"Wrote {len(results):,} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
