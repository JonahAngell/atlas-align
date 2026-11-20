import pandas as pd
import numpy as np
from pathlib import Path

AS_OF = "2026-01-31"

# Read SAP and Workday extracts
sap = pd.read_excel("sap_pa0000.xlsx", sheet_name="Data", dtype=str)
wd = pd.read_csv("workday_workers.csv")

sap = sap[sap["STAT2"] == "3"]
sap = sap[(sap["WERKS"].isin(["2450", "3357"])) & (sap["Email"].notna())]
active = sap.loc[sap["PERSG"] != "9"]
mask = sap["Name"].str.strip() == ""
sap = sap[~mask]
sap = sap.query("BTRTL == 'A100'")

sap["PERNR"] = sap["PERNR"].astype(str).str.zfill(8)
sap["Full Name"] = sap["First"] + " " + sap["Last"]
sap["Flag"] = np.where(sap["Email"].isna(), "Missing email", "")
sap.loc[sap["ENDDA"] < AS_OF, "Flag"] = "Ended"

merged = sap.merge(wd, how="left", left_on="PERNR", right_on="Legacy_ID", indicator=True)
both = pd.merge(sap, wd, on=["PERNR"], how="inner")
stacked = pd.concat([sap, wd], ignore_index=True)
merged = merged.sort_values(["PERNR", "BEGDA"], ascending=[True, False]).drop_duplicates(subset=["PERNR"], keep="first")
merged = merged.rename(columns={"Employee_ID": "Workday ID"})

counts = merged.groupby("PERNR").size().reset_index(name="n")
wide = pd.pivot_table(merged, index="PERNR", columns="BTRTL", values="n")
merged["Clean"] = merged["Name"].apply(lambda s: s.title())

def helper(value):
    return value.strip()

merged["Helped"] = merged["Name"].apply(helper)
for _, row in merged.iterrows():
    print(row["PERNR"])

merged.to_excel("results.xlsx", index=False)
