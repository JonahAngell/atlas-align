# Currency Accuracy Outside North America - Python (pandas) audit script
# Exported from ATLAS Align on 2026-01-01. 66 enabled steps; disabled steps are left out.
# Generated from Developer Logic. Review the code and test it on sample data before relying on the results.
#
# TODO: 12 steps could not be converted and are skipped below:
#   - Step 1.8: The formulas mark rows that match this condition.
#   - Step 5.8: The formulas mark rows that match this condition.
#   - Step 11: THEN action is free text and is not in the formulas: DISPLAY "Incomplete Data" in column "Error Message"
#   - Step 12: The formulas mark rows that match this condition.
#   - Step 12.1: The formulas mark rows that match this condition.
#   - Step 12.2: The formulas mark rows that match this condition.
#   - Step 13: The formulas mark rows that match this condition.
#   - Step 13.1: The formulas mark rows that match this condition.
#   - Step 13.2: The formulas mark rows that match this condition.
#   - Step 13.3: The formulas mark rows that match this condition.
#   - Step 13.3.2: The formulas mark rows that match this condition.
#   - Step 13.3.3: The formulas mark rows that match this condition.
#
# Review:
#   - Steps 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 12.1, 12.1.1, 12.2, 12.2.1, 12.3, 12.4, 12.5, 13.1, 13.2, 13.2.1, 13.2.2, 13.3, 13.3.1, 13.3.2, 13.3.2.1, 13.3.2.2, 13.3.2.3, 13.3.3, 13.3.3.1, 13.3.3.2, 13.3.3.3, 13.3.3.4, 13.3.4, 13.4 are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.
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
    "sap.currency": "",
    "wd.INT2128a": "",
    "wd.int2128v": "",
    "s9.cont": "",
    "sap.currency_previous": "",  # source_ae23d139
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
    # Step 1: Reference sap.currency
    df = sources["sap.currency"].copy()

    # Step 1.1 (THEN branch): Reference Source Substep
    df["Workday ID & Position"] = df["Workday Employee ID"].fillna("").astype(str) + df["Position"].fillna("").astype(str)

    # Step 1.2 (THEN branch): Reference Source Substep
    df["SAP Annual Salary (Rounded)"] = np.trunc(df["Annual salary"])

    # Step 1.3 (THEN branch): Reference Source Substep
    df["SAP ID & Position"] = df["Pers.No."].fillna("").astype(str) + df["Position"].fillna("").astype(str)

    # Step 1.4 (THEN branch): Reference Source Substep
    df["SAP Hourly Rate (Rounded)"] = np.trunc(df["Amount"])

    # Step 1.5 (THEN branch): Reference Source Substep
    df["Calculation"] = pd.NA

    # Step 1.6 (THEN branch): Reference Source Substep
    df["Compensation Plan"] = pd.NA

    # Step 1.7 (THEN branch): Reference Source Substep
    df["Amount * 1.5"] = df["Amount"] * 1.5

    # TODO (skipped) Step 1.8 (THEN branch): Reference Source Substep
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["CoCd"].isin(["1016", "1058", "3999"])

    # Step 1.9 (THEN branch): Reference Source Substep
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["CoCd"].isin(["1016", "1058", "3999"])
    df = df[~mask]

    # Step 2: Reference wd.INT2128a
    df = sources["wd.INT2128a"].copy()

    # Step 2.1 (THEN branch): Reference Source Substep
    df["Workday Annual Salary (Rounded)"] = np.trunc(df["CF - CC total Base Pay - Amount Local Currency"])

    # Step 2.2 (THEN branch): Reference Source Substep
    df["Hourly Rate (Rounded)"] = np.trunc((df["Hourly Rate - Amount"]) * 10**2) / 10**2

    # Step 2.3 (THEN branch): Reference Source Substep
    df["Workday ID & Position"] = df["Employee ID"].fillna("").astype(str) + df["Position ID"].fillna("").astype(str)

    # Step 2.4 (THEN branch): Reference Source Substep
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["Worker Active"] == "No"
    df = df[~mask]

    # Step 2.5 (THEN branch): Reference Source Substep
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["Location Address - Country / Region"].isin(["United States of America", "Canada", "Bahamas", "Puerto Rico", "Virgin Islands of the US"])
    df = df[~mask]

    # Step 2.6 (THEN branch): Reference Source Substep
    mask = df["Compensation Plan"].fillna("").astype(str).str.strip().eq("")
    df["Compensation Plan"] = df.get("Compensation Plan", "")
    existing = df.loc[mask, "Compensation Plan"].fillna("").astype(str)
    df.loc[mask, "Compensation Plan"] = existing.where(existing == "", existing + "||") + "12 Month Plan"

    # Step 2.7 (THEN branch): Reference Source Substep
    mask = df["Compensation Plan"] == "Service Bonus"
    df["Compensation Plan"] = df.get("Compensation Plan", "")
    existing = df.loc[mask, "Compensation Plan"].fillna("").astype(str)
    df.loc[mask, "Compensation Plan"] = existing.where(existing == "", existing + "||") + "13 Month Plan"

    # Step 3: Reference wd.int2128v
    df = sources["wd.int2128v"].copy()

    # Step 3.1 (THEN branch): Reference Source Substep
    df["Total Base Pay (Rounded)"] = np.trunc(df["total_base_pay_amount"] * 10**2) / 10**2

    # Step 3.2 (THEN branch): Reference Source Substep
    df["Workday ID & Position"] = df["employee_id"].fillna("").astype(str) + df["position_id_all_positions"].fillna("").astype(str)

    # Step 4: Reference s9.cont
    df = sources["s9.cont"].copy()

    # Step 4.1 (THEN branch): Reference Source Substep
    df["SAP ID & Position"] = df["S9 ID"].fillna("").astype(str) + df["Position Number"].fillna("").astype(str)

    # Step 4.2 (THEN branch): Reference Source Substep
    df["S9 Annual Salary (Rounded)"] = np.trunc(df["Monthly Salary calculated"] * 13)

    # Step 5: Reference sap.currency_previous
    df = sources["sap.currency_previous"].copy()

    # Step 5.1 (THEN branch): Reference Source Substep
    df["Workday ID & Position"] = df["Workday Employee ID"].fillna("").astype(str) + df["Position"].fillna("").astype(str)

    # Step 5.2 (THEN branch): Reference Source Substep
    df["SAP Annual Salary (Rounded)"] = np.trunc(df["Annual salary"])

    # Step 5.3 (THEN branch): Reference Source Substep
    df["SAP ID & Position"] = df["Pers.No."].fillna("").astype(str) + df["Position"].fillna("").astype(str)

    # Step 5.4 (THEN branch): Reference Source Substep
    df["SAP Hourly Rate (Rounded)"] = np.trunc(df["Amount"])

    # Step 5.5 (THEN branch): Reference Source Substep
    df["Calculation"] = pd.NA

    # Step 5.6 (THEN branch): Reference Source Substep
    df["Compensation Plan"] = pd.NA

    # Step 5.7 (THEN branch): Reference Source Substep
    df["Amount * 1.5"] = df["Amount"] * 1.5

    # TODO (skipped) Step 5.8 (THEN branch): Reference Source Substep
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["CoCd"].isin(["1016", "1058", "3999"])

    # Step 5.9 (THEN branch): Reference Source Substep
    # Note: Do Not Display - Keep only rows that do not match this condition.
    mask = df["CoCd"].isin(["1016", "1058", "3999"])
    df = df[~mask]

    # Step 6: Join / Union Sources
    df = df.merge(sources["sap.currency_previous"], how="left", left_on="SAP ID & Position", right_on="SAP ID & Position", suffixes=("", "_sap.currency_previous"))

    # Step 7: Join / Union Sources
    df = df.merge(sources["s9.cont"], how="left", left_on="SAP ID & Position", right_on="SAP ID & Position", suffixes=("", "_s9.cont"))

    # Step 8: Join / Union Sources
    df = df.merge(sources["wd.INT2128a"], how="outer", left_on="Workday ID & Position", right_on="Workday ID & Position", suffixes=("", "_wd.INT2128a"))

    # Step 9: Join / Union Sources
    df = df.merge(sources["wd.int2128v"], how="outer", left_on="Workday ID & Position", right_on="Workday ID & Position", suffixes=("", "_wd.int2128v"))

    # Step 10: Create Column
    df["Error Message"] = pd.NA

    # TODO (skipped) Step 11: IF / THEN
    # Reason: THEN action is free text and is not in the formulas: DISPLAY "Incomplete Data" in column "Error Message"
    # Developer Logic:
    # mask = df["Workday ID & Position"].fillna("").astype(str).str.strip().eq("") | df["Workday ID & Position"].fillna("").astype(str).str.strip().eq("") | df["Workday ID & Position"].fillna("").astype(str).str.strip().eq("")

    # TODO (skipped) Step 12: IF / THEN
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["Pay Rate Type"] == "Hourly"

    # TODO (skipped) Step 12.1 (THEN branch): New Child Logic Step
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["CoCd"] == "EMEA Company Codes (see reference file)"

    # Step 12.1.1 (THEN branch): New Child Logic Step
    mask = df["CF - CC total Base Pay - Amount Local Currency"] != df["Amount"]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Hourly Rate Mismatch"

    # TODO (skipped) Step 12.2 (THEN branch): Inverse ELSE
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["CoCd"] != "EMEA Company Codes (see reference file)"

    # Step 12.2.1 (THEN branch): New Child Logic Step
    mask = (df["Total Base Pay (Rounded)"] != df["SAP Hourly Rate (Rounded)"]) & (df["EEGrp"] != "2") & (df["ESgrp"] == "4")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Hourly Rate Mismatch"

    # Step 12.3 (THEN branch): New Child Logic Step
    mask = df["Amount"] >= df["Amount * 1.5"]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "50%+ Wage Increase"

    # Step 12.4 (THEN branch): New Child Logic Step Copy
    mask = df["total Base Pay - Currency"] >= df["Crcy"]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Hourly Currency Mismatch"

    # Step 12.5 (THEN branch): New Child Logic Step Copy Copy
    mask = ~df["Wage Type"].isin(["0010", "0035", "0080"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Hourly Incorrect Wage Type"

    # TODO (skipped) Step 13: New Child Logic Step
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["Pay Rate Type"] == "Salaried"

    # TODO (skipped) Step 13.1 (THEN branch): New Child Logic Step
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["Annual salary"] >= df["Amount * 1.5"]

    # TODO (skipped) Step 13.2 (THEN branch): New Child Logic Step
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["Location Address - Country / Region"] == "India"

    # Step 13.2.1 (THEN branch): New Child Logic Step
    mask = df["Primary Compensation Basis - Amount"] != df["Annual salary"]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Salaried Rate Mismatch"

    # Step 13.2.2 (THEN branch): New Child Logic Step Copy
    mask = df["Primary Compensation Basis - Currency"] != df["Curr."]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Salaried Currency Mismatch"

    # TODO (skipped) Step 13.3 (THEN branch): Inverse ELSE
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["Location Address - Country / Region"] != "India"

    # Step 13.3.1 (THEN branch): New Child Logic Step
    mask = (df["Location Address - Country / Region"] == "France") & ~df["Employee Type"].isin(["Apprentice", "Student Program / Intern", "Trainee"]) & (df["Amount"] != "0")
    df.loc[mask, "Calculation"] = df["Annual salary"]

    # TODO (skipped) Step 13.3.2 (THEN branch): New Child Logic Step
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["Position Number"].fillna("").astype(str).str.strip().ne("")

    # Step 13.3.2.1 (THEN branch): New Child Logic Step
    mask = (df["S9 Annual Salary (Rounded)"] != df["SAP Annual Salary (Rounded)"]) | (df["S9 Annual Salary (Rounded)"] != df["Workday Annual Salary (Rounded)"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Salaried Rate Mismatch - DLP"

    # Step 13.3.2.2 (THEN branch): New Child Logic Step
    mask = df["ESgrp"].isin(["40", "24"]) & (df["S9 Annual Salary (Rounded)"] != "0")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Incorrect Intern Wage"

    # Step 13.3.2.3 (THEN branch): New Child Logic Step
    mask = (df["ESgrp"] == "22") & ~df["S9 Annual Salary (Rounded)"].isin(["0", "basic pay"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Incorrect Intern Wage"

    # TODO (skipped) Step 13.3.3 (THEN branch): Inverse ELSE
    # Reason: The formulas mark rows that match this condition.
    # Developer Logic:
    # mask = df["Position Number"].fillna("").astype(str).str.strip().eq("")

    # Step 13.3.3.1 (THEN branch): New Child Logic Step
    mask = df["total Base Pay - Currency"] != df["Curr."]
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Salaried Currency Mismatch"

    # Step 13.3.3.2 (THEN branch): New Child Logic Step
    mask = (df["Company"] == "8002 Shanghai Intl Theme Park Company, Ltd.") & (df["Workday Annual Salary (Rounded)"] == df["SAP Annual Salary (Rounded)"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Salaried Rate Mismatch"

    # Step 13.3.3.3 (THEN branch): New Child Logic Step Copy
    mask = (df["Company"] == "EMEA") & (df["CF - CC total Base Pay - Amount Local Currency"] == df["Annual salary"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Salaried Rate Mismatch"

    # Step 13.3.3.4 (THEN branch): New Child Logic Step Copy Copy
    mask = ~df["Company"].isin(["8002 Shanghai Intl Theme Park Company, Ltd.", "EMEA"]) & (df["Workday Annual Salary (Rounded)"] == df["SAP Annual Salary (Rounded)"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Salaried Rate Mismatch"

    # Step 13.3.4 (THEN branch): New Child Logic Step
    mask = (df["Compensation Plan"] != df["Calculation"]) & (df["CoCd"] != "4007") & ~df["Location Address - Country / Region"].isin(["Brazil", "Argentina"]) & (df["Employee Type"] != "Student Program / Intern") & (df["employee_contract_type_ref_id"] != "EMPLOYEE_CONTRACT_TYPE_PERMANENT")
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Compensation Plan Mismatch"

    # Step 13.4 (THEN branch): New Child Logic Step
    mask = ~df["Wage Type"].isin(["0010", "0020", "0030", "0080", "0082", "1500"])
    df["Error Message"] = df.get("Error Message", "")
    existing = df.loc[mask, "Error Message"].fillna("").astype(str)
    df.loc[mask, "Error Message"] = existing.where(existing == "", existing + "||") + "Salaried Incorrect Wage Type"

    return df


def main():
    check_paths()
    sources = {name: read_source(path) for name, path in SOURCE_PATHS.items()}
    results = run_audit(sources)
    write_output(results, OUTPUT_PATH)
    print(f"Wrote {len(results):,} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
