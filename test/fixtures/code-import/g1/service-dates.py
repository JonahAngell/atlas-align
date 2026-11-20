# Service Dates - Python (pandas) audit script
# Exported from ATLAS Align on 2026-01-01. 131 enabled steps; disabled steps are left out.
# Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
#
# TODO: 6 steps could not be converted and are skipped below:
#   - Step 10: THEN action is free text and is not in the formulas: IF file sap.hi0256 column "employee_sub_group_text" is not equal to "Daily NE":
#   - Step 11: THEN action is free text and is not in the formulas: IF file sap.it41 column "workday_employee_id" is not blank/null AND file wd.dvwsd column "Worker ID" is not blank/null:
#   - Step 11.1: THEN action is free text and is not in the formulas: IF file sap.hi0256 column "company_code_number" is equal to "2236", "2237", "2238", "2239", or "9079":
#   - Step 11.2: The step only marks matching rows, so there is no change to make.
#   - Step 11.2.1: THEN action is free text and is not in the formulas: IF column "company_code_number" is equal to "3047", "3048", "3049", "3050", "3121", "3138", "3300", "3387", or "3801" OR column "company_code_number" is equal to "3010" AND column "personnel_area" is equal to "0195":
#   - Step 11.2.1.2: THEN action is free text and is not in the formulas: IF column "company_code_number" is not equal to "3010" AND column "personnel_area" is not equal to "0195":
#
# Review:
#   - Steps 1.1, 2.1, 2.2, 2.2.1, 2.3, 2.3.1, 2.4, 2.4.1, 2.5, 2.5.1, 2.6, 2.6.1, 2.6.2, 2.7, 2.7.1, 2.7.2, 2.7.3, 2.8, 2.8.1, 2.9, 2.9.1, 2.10, 2.10.1, 2.11, 2.11.1, 2.11.2, 2.11.3, 2.11.4, 2.11.5, 2.12, 2.12.1, 2.12.2, 2.13, 2.13.1, 2.13.2, 2.14, 2.14.1, 2.14.2, 2.14.3, 2.14.4, 2.14.5, 2.15, 2.15.1, 2.15.2, 2.15.3, 2.15.4, 2.15.5, 2.15.6, 2.16, 2.16.1, 2.16.2, 2.16.3, 2.16.4, 2.16.5, 2.16.6, 2.16.7, 2.17, 2.17.1, 2.17.2, 2.17.3, 2.17.4, 2.17.5, 2.17.6, 2.17.7, 2.17.8, 2.18, 2.18.1, 2.18.2, 2.18.3, 2.19, 2.19.1, 2.19.2, 2.19.3, 2.20, 2.20.1, 2.20.2, 2.20.3, 2.20.4, 2.20.5, 2.21, 2.21.1, 2.21.2, 2.21.3, 2.21.4, 2.21.5, 3.1, 3.2, 3.3, 10.1, 10.2, 11.1, 11.1.1, 11.1.2, 11.1.3, 11.2, 11.2.1, 11.2.1.1, 11.2.1.2, 11.2.1.2.1, 11.2.2, 11.2.3, 11.2.4, 11.2.5, 11.2.6, 11.2.7, 11.2.8, 11.2.9, 11.2.10, 11.2.11, 11.2.12, 11.2.13, 11.2.14, 11.2.15, 11.2.16, 11.2.17, 11.2.18, 11.2.19, 11.2.20, 11.2.21 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
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
    "wd.dvwsd": "",  # WD_Data Validation_Worker Service Dates_
    "sap.it41": "",  # SAP Service Dates
    "sap.hi0256": "",  # HI0256_Maseke
    "s9.cont": "",  # DLP Contractual Data
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
    # Step 1: Reference WD_Data Validation_Worker Service Dates_
    df = sources["wd.dvwsd"].copy()

    # Step 1.1 (THEN branch): Create Column
    df["Workday ID & Position"] = df["Worker ID"].fillna("").astype(str) + df["Position ID"].fillna("").astype(str)

    # Step 2: Reference SAP Service Dates
    df = sources["sap.it41"].copy()

    # Step 2.1 (THEN branch): Create Column
    df["Workday ID & Position"] = df["workday_employee_id"].fillna("").astype(str) + df["workday_position_id"].fillna("").astype(str)

    # Step 2.2 (THEN branch): Create Column
    df["SAP Original Hire Date"] = pd.NA

    # Step 2.2.1 (THEN branch): IF / THEN
    mask = df["dt1"] == "00"
    df.loc[mask, "SAP Original Hire Date"] = df["date1"]

    # Step 2.3 (THEN branch): Create Column
    df["SAP Recent Hire Date"] = pd.NA

    # Step 2.3.1 (THEN branch): IF / THEN
    mask = df["dt2"] == "01"
    df.loc[mask, "SAP Recent Hire Date"] = df["date2"]

    # Step 2.4 (THEN branch): Create Column
    df["SAP Adjusted Service Date"] = pd.NA

    # Step 2.4.1 (THEN branch): IF / THEN
    mask = df["dt3"] == "02"
    df.loc[mask, "SAP Adjusted Service Date"] = df["date3"]

    # Step 2.5 (THEN branch): Create Column
    df["SAP Departure Date (HK Only)"] = pd.NA

    # Step 2.5.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "H3"
    df.loc[mask, "SAP Departure Date (HK Only)"] = df["date4"]

    # Step 2.6 (THEN branch): Create Column
    df["SAP Program Arrival Date"] = pd.NA

    # Step 2.6.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "R1"
    df.loc[mask, "SAP Program Arrival Date"] = df["date4"]

    # Step 2.6.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "R1"
    df.loc[mask, "SAP Program Arrival Date"] = df["date5"]

    # Step 2.7 (THEN branch): Create Column
    df["SAP Program End Date"] = pd.NA

    # Step 2.7.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "R2"
    df.loc[mask, "SAP Program End Date"] = df["date4"]

    # Step 2.7.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "R2"
    df.loc[mask, "SAP Program End Date"] = df["date5"]

    # Step 2.7.3 (THEN branch): IF / THEN
    mask = df["dt6"] == "R2"
    df.loc[mask, "SAP Program End Date"] = df["date6"]

    # Step 2.8 (THEN branch): Create Column
    df["SAP Insurance Date (DCL Only)"] = pd.NA

    # Step 2.8.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "R4"
    df.loc[mask, "SAP Insurance Date (DCL Only)"] = df["date4"]

    # Step 2.9 (THEN branch): Create Column
    df["SAP Current Role CN"] = pd.NA

    # Step 2.9.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "Z1"
    df.loc[mask, "SAP Current Role CN"] = df["date4"]

    # Step 2.10 (THEN branch): Create Column
    df["SAP Company Change Date"] = pd.NA

    # Step 2.10.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "Z2"
    df.loc[mask, "SAP Company Change Date"] = df["date4"]

    # Step 2.11 (THEN branch): Create Column
    df["SAP Seniority Date (WDW Only)"] = pd.NA

    # Step 2.11.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "Z3"
    df.loc[mask, "SAP Seniority Date (WDW Only)"] = df["date4"]

    # Step 2.11.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "Z3"
    df.loc[mask, "SAP Seniority Date (WDW Only)"] = df["date5"]

    # Step 2.11.3 (THEN branch): IF / THEN
    mask = df["dt6"] == "Z3"
    df.loc[mask, "SAP Seniority Date (WDW Only)"] = df["date6"]

    # Step 2.11.4 (THEN branch): IF / THEN
    mask = df["dt7"] == "Z3"
    df.loc[mask, "SAP Seniority Date (WDW Only)"] = df["date7"]

    # Step 2.11.5 (THEN branch): IF / THEN
    mask = df["dt8"] == "Z3"
    df.loc[mask, "SAP Seniority Date (WDW Only)"] = df["date8"]

    # Step 2.12 (THEN branch): Create Column
    df["SAP Acquisition Date"] = pd.NA

    # Step 2.12.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "Z6"
    df.loc[mask, "SAP Acquisition Date"] = df["date4"]

    # Step 2.12.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "Z6"
    df.loc[mask, "SAP Acquisition Date"] = df["date5"]

    # Step 2.13 (THEN branch): Create Column
    df["SAP Pfund Effective Date"] = pd.NA

    # Step 2.13.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "ZM"
    df.loc[mask, "SAP Pfund Effective Date"] = df["date4"]

    # Step 2.13.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "ZM"
    df.loc[mask, "SAP Pfund Effective Date"] = df["date5"]

    # Step 2.14 (THEN branch): Create Column
    df["SAP Seniority Date A (DLR Only)"] = pd.NA

    # Step 2.14.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "ZP"
    df.loc[mask, "SAP Seniority Date A (DLR Only)"] = df["date4"]

    # Step 2.14.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "ZP"
    df.loc[mask, "SAP Seniority Date A (DLR Only)"] = df["date5"]

    # Step 2.14.3 (THEN branch): IF / THEN
    mask = df["dt6"] == "ZP"
    df.loc[mask, "SAP Seniority Date A (DLR Only)"] = df["date6"]

    # Step 2.14.4 (THEN branch): IF / THEN
    mask = df["dt7"] == "ZP"
    df.loc[mask, "SAP Seniority Date A (DLR Only)"] = df["date7"]

    # Step 2.14.5 (THEN branch): IF / THEN
    mask = df["dt8"] == "ZP"
    df.loc[mask, "SAP Seniority Date A (DLR Only)"] = df["date8"]

    # Step 2.15 (THEN branch): Create Column
    df["SAP Seniority Date B (DLR Only)"] = pd.NA

    # Step 2.15.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "ZQ"
    df.loc[mask, "SAP Seniority Date B (DLR Only)"] = df["date4"]

    # Step 2.15.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "ZQ"
    df.loc[mask, "SAP Seniority Date B (DLR Only)"] = df["date5"]

    # Step 2.15.3 (THEN branch): IF / THEN
    mask = df["dt6"] == "ZQ"
    df.loc[mask, "SAP Seniority Date B (DLR Only)"] = df["date6"]

    # Step 2.15.4 (THEN branch): IF / THEN
    mask = df["dt7"] == "ZQ"
    df.loc[mask, "SAP Seniority Date B (DLR Only)"] = df["date7"]

    # Step 2.15.5 (THEN branch): IF / THEN
    mask = df["dt8"] == "ZQ"
    df.loc[mask, "SAP Seniority Date B (DLR Only)"] = df["date8"]

    # Step 2.15.6 (THEN branch): IF / THEN
    mask = df["dt9"] == "ZQ"
    df.loc[mask, "SAP Seniority Date B (DLR Only)"] = df["date9"]

    # Step 2.16 (THEN branch): Create Column
    df["SAP Seniority Date C (DLR Only)"] = pd.NA

    # Step 2.16.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "ZR"
    df.loc[mask, "SAP Seniority Date C (DLR Only)"] = df["date4"]

    # Step 2.16.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "ZR"
    df.loc[mask, "SAP Seniority Date C (DLR Only)"] = df["date5"]

    # Step 2.16.3 (THEN branch): IF / THEN
    mask = df["dt6"] == "ZR"
    df.loc[mask, "SAP Seniority Date C (DLR Only)"] = df["date6"]

    # Step 2.16.4 (THEN branch): IF / THEN
    mask = df["dt7"] == "ZR"
    df.loc[mask, "SAP Seniority Date C (DLR Only)"] = df["date7"]

    # Step 2.16.5 (THEN branch): IF / THEN
    mask = df["dt8"] == "ZR"
    df.loc[mask, "SAP Seniority Date C (DLR Only)"] = df["date8"]

    # Step 2.16.6 (THEN branch): IF / THEN
    mask = df["dt9"] == "ZR"
    df.loc[mask, "SAP Seniority Date C (DLR Only)"] = df["date9"]

    # Step 2.16.7 (THEN branch): IF / THEN
    mask = df["dt10"] == "ZR"
    df.loc[mask, "SAP Seniority Date C (DLR Only)"] = df["date10"]

    # Step 2.17 (THEN branch): Create Column
    df["SAP Scheduling Seniority Date"] = pd.NA

    # Step 2.17.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "ZS"
    df.loc[mask, "SAP Scheduling Seniority Date"] = df["date4"]

    # Step 2.17.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "ZS"
    df.loc[mask, "SAP Scheduling Seniority Date"] = df["date5"]

    # Step 2.17.3 (THEN branch): IF / THEN
    mask = df["dt6"] == "ZS"
    df.loc[mask, "SAP Scheduling Seniority Date"] = df["date6"]

    # Step 2.17.4 (THEN branch): IF / THEN
    mask = df["dt7"] == "ZS"
    df.loc[mask, "SAP Scheduling Seniority Date"] = df["date7"]

    # Step 2.17.5 (THEN branch): IF / THEN
    mask = df["dt8"] == "ZS"
    df.loc[mask, "SAP Scheduling Seniority Date"] = df["date8"]

    # Step 2.17.6 (THEN branch): IF / THEN
    mask = df["dt9"] == "ZS"
    df.loc[mask, "SAP Scheduling Seniority Date"] = df["date9"]

    # Step 2.17.7 (THEN branch): IF / THEN
    mask = df["dt10"] == "ZS"
    df.loc[mask, "SAP Scheduling Seniority Date"] = df["date10"]

    # Step 2.17.8 (THEN branch): IF / THEN
    mask = df["dt11"] == "ZS"
    df.loc[mask, "SAP Scheduling Seniority Date"] = df["date11"]

    # Step 2.18 (THEN branch): Create Column
    df["SAP Transfer In"] = pd.NA

    # Step 2.18.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "ZT"
    df.loc[mask, "SAP Transfer In"] = df["date4"]

    # Step 2.18.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "ZT"
    df.loc[mask, "SAP Transfer In"] = df["date5"]

    # Step 2.18.3 (THEN branch): IF / THEN
    mask = df["dt6"] == "ZT"
    df.loc[mask, "SAP Transfer In"] = df["date6"]

    # Step 2.19 (THEN branch): Create Column
    df["SAP 4-18 Elig Date"] = pd.NA

    # Step 2.19.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "ZV"
    df.loc[mask, "SAP 4-18 Elig Date"] = df["date4"]

    # Step 2.19.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "ZV"
    df.loc[mask, "SAP 4-18 Elig Date"] = df["date5"]

    # Step 2.19.3 (THEN branch): IF / THEN
    mask = df["dt6"] == "ZV"
    df.loc[mask, "SAP 4-18 Elig Date"] = df["date6"]

    # Step 2.20 (THEN branch): Create Column
    df["SAP Recent Elig Date"] = pd.NA

    # Step 2.20.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "ZW"
    df.loc[mask, "SAP Recent Elig Date"] = df["date4"]

    # Step 2.20.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "ZW"
    df.loc[mask, "SAP Recent Elig Date"] = df["date5"]

    # Step 2.20.3 (THEN branch): IF / THEN
    mask = df["dt6"] == "ZW"
    df.loc[mask, "SAP Recent Elig Date"] = df["date6"]

    # Step 2.20.4 (THEN branch): IF / THEN
    mask = df["dt7"] == "ZW"
    df.loc[mask, "SAP Recent Elig Date"] = df["date7"]

    # Step 2.20.5 (THEN branch): IF / THEN
    mask = df["dt8"] == "ZW"
    df.loc[mask, "SAP Recent Elig Date"] = df["date8"]

    # Step 2.21 (THEN branch): Create Column
    df["SAP Social Working Date"] = pd.NA

    # Step 2.21.1 (THEN branch): IF / THEN
    mask = df["dt4"] == "ZY"
    df.loc[mask, "SAP Social Working Date"] = df["date4"]

    # Step 2.21.2 (THEN branch): IF / THEN
    mask = df["dt5"] == "ZY"
    df.loc[mask, "SAP Social Working Date"] = df["date5"]

    # Step 2.21.3 (THEN branch): IF / THEN
    mask = df["dt6"] == "ZY"
    df.loc[mask, "SAP Social Working Date"] = df["date6"]

    # Step 2.21.4 (THEN branch): IF / THEN
    mask = df["dt7"] == "ZY"
    df.loc[mask, "SAP Social Working Date"] = df["date7"]

    # Step 2.21.5 (THEN branch): IF / THEN
    mask = df["dt8"] == "ZY"
    df.loc[mask, "SAP Social Working Date"] = df["date8"]

    # Step 3: Reference HI0256_Maseke
    df = sources["sap.hi0256"].copy()

    # Step 3.1 (THEN branch): Create Column
    df["Workday ID & Position"] = df["workday_employee_id"].fillna("").astype(str) + df["workday_position_id"].fillna("").astype(str)

    # Step 3.2 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["comp_code"].isin(["3332", "3336", "3350", "3362", "2421", "3088"])
    df = df[~mask]

    # Step 3.3 (THEN branch): IF / THEN
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["comp_code"].isin(["3024", "3122", "3123", "3124", "3125", "3142", "3359"]) & df["emp_grp"].isin(["1", "2", "3"]) & (df["emp_subgrp"] == "24")
    df = df[~mask]

    # Step 4: Reference DLP Contractual Data
    df = sources["s9.cont"].copy()

    # Step 5: Join
    df = df.merge(sources["sap.it41"], how="outer", left_on="Workday ID & Position", right_on="Workday ID & Position", suffixes=("", "_sap.it41"))

    # Step 6: Join
    df = df.merge(sources["sap.hi0256"], how="left", left_on="Workday ID & Position", right_on="Workday ID & Position", suffixes=("", "_sap.hi0256"))

    # Step 7: Join
    df = df.merge(sources["s9.cont"], how="left", left_on="persno", right_on="S9 ID", suffixes=("", "_s9.cont"))

    # Step 8: Create Column
    df["Error Message"] = pd.NA

    # Step 9: IF / THEN
    mask = df["SAP Original Hire Date"].fillna("").astype(str).str.strip().eq("") | df["SAP Recent Hire Date"].fillna("").astype(str).str.strip().eq("") | df["SAP Adjusted Service Date"].fillna("").astype(str).str.strip().eq("")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Mandatory Dates not in SAP"

    # TODO (skipped) Step 10: IF / THEN
    # Reason: THEN action is free text and is not in the formulas: IF file sap.hi0256 column "employee_sub_group_text" is not equal to "Daily NE":
    # Developer Logic:
    # mask = df["employee_sub_group_text"] != "Daily NE"

    # Step 10.1 (THEN branch): IF / THEN
    mask = df["workday_employee_id"].fillna("").astype(str).str.strip().eq("")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Combination of WD ID & Position ID not found in SAP"

    # Step 10.2 (THEN branch): IF / THEN
    mask = df["Worker ID"].fillna("").astype(str).str.strip().eq("")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Combination of WD ID & Position ID not found in WD"

    # TODO (skipped) Step 11: IF / THEN
    # Reason: THEN action is free text and is not in the formulas: IF file sap.it41 column "workday_employee_id" is not blank/null AND file wd.dvwsd column "Worker ID" is not blank/null:
    # Developer Logic:
    # mask = df["workday_employee_id"].fillna("").astype(str).str.strip().ne("") & df["Worker ID"].fillna("").astype(str).str.strip().ne("")

    # TODO (skipped) Step 11.1 (THEN branch): IF / THEN
    # Reason: THEN action is free text and is not in the formulas: IF file sap.hi0256 column "company_code_number" is equal to "2236", "2237", "2238", "2239", or "9079":
    # Developer Logic:
    # mask = df["company_code_number"].isin(["2236", "2237", "2238", "2239", "9079"])

    # Step 11.1.1 (THEN branch): IF / THEN
    mask = (df["SAP Original Hire Date"] != df["Original Hire Date"]) | (df["SAP Original Hire Date"] != df["Original_Hire_date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Original Hire Date Mismatch"

    # Step 11.1.2 (THEN branch): IF / THEN
    mask = (df["SAP Recent Hire Date"] != df["Recent Hire Date"]) | (df["SAP Recent Hire Date"] != df["Recent_Hire_date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Recent Hire Date Mismatch"

    # Step 11.1.3 (THEN branch): IF / THEN
    mask = (df["SAP Adjusted Service Date"] != df["Adjusted Service Date"]) | (df["SAP Adjusted Service Date"] != df["Adjusted_Service_date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Adjusted Service Date Mismatch"

    # TODO (skipped) Step 11.2 (ELSE branch): ELSE
    # Reason: The step only marks matching rows, so there is no change to make.
    # Developer Logic:
    # mask = ~(df["company_code_number"].isin(["2236", "2237", "2238", "2239", "9079"]))

    # TODO (skipped) Step 11.2.1 (THEN branch): IF / THEN
    # Reason: THEN action is free text and is not in the formulas: IF column "company_code_number" is equal to "3047", "3048", "3049", "3050", "3121", "3138", "3300", "3387", or "3801" OR column "company_code_number" is equal to "3010" AND column "personnel_area" is equal to "0195":
    # Developer Logic:
    # mask = df["company_code_number"].isin(["3047", "3048", "3049", "3050", "3121", "3138", "3300", "3387", "3801"]) | ((df["company_code_number"] == "3010") & (df["personnel_area"] == "0195"))

    # Step 11.2.1.1 (THEN branch): IF / THEN
    mask = (df["SAP Original Hire Date"].fillna("").astype(str).str.strip().eq("") & df["Original Hire Date"].fillna("").astype(str).str.strip().eq("")) | (df["SAP Recent Hire Date"].fillna("").astype(str).str.strip().eq("") & df["Recent Hire Date"].fillna("").astype(str).str.strip().eq("")) | (df["SAP Adjusted Service Date"].fillna("").astype(str).str.strip().eq("") & df["Adjusted Service Date"].fillna("").astype(str).str.strip().eq(""))
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Mandatory date fields blank in WD and SAP"

    # TODO (skipped) Step 11.2.1.2 (THEN branch): IF / THEN
    # Reason: THEN action is free text and is not in the formulas: IF column "company_code_number" is not equal to "3010" AND column "personnel_area" is not equal to "0195":
    # Developer Logic:
    # mask = (df["company_code_number"] != "3010") & (df["personnel_area"] != "0195")

    # Step 11.2.1.2.1 (THEN branch): IF / THEN
    mask = (df["Recent Elig Date"].fillna("").astype(str).str.strip().eq("") & df["Recent Elig Date"].fillna("").astype(str).str.strip().eq("")) | (df["SAP Social Working Date"].fillna("").astype(str).str.strip().eq("") & df["Social Working Date"].fillna("").astype(str).str.strip().eq("") & (df["emp_grp"] != "2"))
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Mandatory date fields blank in WD and SAP"

    # Step 11.2.2 (THEN branch): IF / THEN
    mask = df["SAP Original Hire Date"] != df["Original Hire Date"]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Original Hire Date Mismatch"

    # Step 11.2.3 (THEN branch): IF / THEN
    mask = df["SAP Recent Hire Date"] != df["Recent Hire Date"]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Recent Hire Date Mismatch"

    # Step 11.2.4 (THEN branch): IF / THEN
    mask = df["SAP Adjusted Service Date"] != df["Adjusted Service Date"]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Adjusted Service Date Mismatch"

    # Step 11.2.5 (THEN branch): IF / THEN
    mask = df["SAP Departure Date (HK Only)"].fillna("").astype(str).str.strip().ne("") & (df["SAP Departure Date (HK Only)"] != df["Departure Date(HK Only)"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Departure Date (HK Only) Mismatch"

    # Step 11.2.6 (THEN branch): IF / THEN
    mask = df["SAP Program Arrival Date"].fillna("").astype(str).str.strip().ne("") & (df["SAP Program Arrival Date"] != df["Program Arrival Date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Program Arrival Date Mismatch"

    # Step 11.2.7 (THEN branch): IF / THEN
    mask = df["SAP Program End Date"].fillna("").astype(str).str.strip().ne("") & (df["SAP Program End Date"] != df["Program End Date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Program End Date Mismatch"

    # Step 11.2.8 (THEN branch): IF / THEN
    mask = df["SAP Insurance Date (DCL Only)"].fillna("").astype(str).str.strip().ne("") & (df["SAP Insurance Date (DCL Only)"] != df["Insurance Date(DCL Only)"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Insurance Date (DCL Only) Mismatch"

    # Step 11.2.9 (THEN branch): IF / THEN
    mask = df["SAP Current Role CN"].fillna("").astype(str).str.strip().ne("") & (df["SAP Current Role CN"] != df["Current Role CN"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Current Role CN Mismatch"

    # Step 11.2.10 (THEN branch): IF / THEN
    mask = df["SAP Company Change Date"].fillna("").astype(str).str.strip().ne("") & (df["SAP Company Change Date"] != df["Company Change Date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Company Change Date Mismatch"

    # Step 11.2.11 (THEN branch): IF / THEN
    mask = df["SAP Seniority Date (WDW Only)"].fillna("").astype(str).str.strip().ne("") & (df["SAP Seniority Date (WDW Only)"] != df["Seniority Date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Seniority Date (WDW Only) Mismatch"

    # Step 11.2.12 (THEN branch): IF / THEN
    mask = df["SAP Acquisition Date"].fillna("").astype(str).str.strip().ne("") & (df["SAP Acquisition Date"] != df["Acquisition Date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Acquisition Date Mismatch"

    # Step 11.2.13 (THEN branch): IF / THEN
    mask = df["SAP Pfund Effective Date"].fillna("").astype(str).str.strip().ne("") & (df["SAP Pfund Effective Date"] != df["Pfund Effective Date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Pfund Effective Date Mismatch"

    # Step 11.2.14 (THEN branch): IF / THEN
    mask = df["SAP Seniority Date A (DLR Only)"].fillna("").astype(str).str.strip().ne("") & (df["SAP Seniority Date A (DLR Only)"] != df["Seniority Date A"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Seniority Date A (DLR Only) Mismatch"

    # Step 11.2.15 (THEN branch): IF / THEN
    mask = df["SAP Seniority Date B (DLR Only)"].fillna("").astype(str).str.strip().ne("") & (df["SAP Seniority Date B (DLR Only)"] != df["Seniority Date B"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Seniority Date B (DLR Only) Mismatch"

    # Step 11.2.16 (THEN branch): IF / THEN
    mask = df["SAP Seniority Date C (DLR Only)"].fillna("").astype(str).str.strip().ne("") & (df["SAP Seniority Date C (DLR Only)"] != df["Seniority Date C"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Seniority Date C Mismatch"

    # Step 11.2.17 (THEN branch): IF / THEN
    mask = df["SAP Scheduling Seniority Date"].fillna("").astype(str).str.strip().ne("") & (df["SAP Scheduling Seniority Date"] != df["Scheduling Seniority Date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Scheduling Seniority Date Mismatch"

    # Step 11.2.18 (THEN branch): IF / THEN
    mask = df["SAP Transfer In"].fillna("").astype(str).str.strip().ne("") & (df["SAP Transfer In"] != df["Transfer In"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Transfer In Mismatch"

    # Step 11.2.19 (THEN branch): IF / THEN
    mask = df["SAP 4-18 Elig Date"].fillna("").astype(str).str.strip().ne("") & (df["SAP 4-18 Elig Date"] != df["4-18 Elig Date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "4-18 Elig Date Mismatch"

    # Step 11.2.20 (THEN branch): IF / THEN
    mask = df["SAP Recent Elig Date"].fillna("").astype(str).str.strip().ne("") & (df["SAP Recent Elig Date"] != df["Recent Elig Date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Recent Elig Date Mismatch"

    # Step 11.2.21 (THEN branch): IF / THEN
    mask = df["SAP Social Working Date"].fillna("").astype(str).str.strip().ne("") & (df["SAP Social Working Date"] != df["Social Working Date"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Social Working Date Mismatch"

    # Step 12: IF / THEN
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
