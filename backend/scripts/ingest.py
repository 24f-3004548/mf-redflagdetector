#!/usr/bin/env python3
"""
ingest.py  —  Load financials.xlsx + Scheme_Holdings.xlsx into Supabase
              then compute red flags and scheme scores.

Usage:
    pip install pandas numpy supabase python-dotenv openpyxl
    python scripts/ingest.py \
        --financials path/to/financials.xlsx \
        --holdings   path/to/Scheme_Holdings.xlsx \
        --date       2025-03-31          # as_of_date for this holdings snapshot
"""

import os, ast, argparse
import pandas as pd
import numpy as np
import warnings
from datetime import date
from dotenv import load_dotenv
from supabase import create_client, Client

warnings.filterwarnings("ignore")
load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]   # service-role key for writes
MAX_FLAGS    = 16

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── helpers ──────────────────────────────────────────────────────────────────

def safe_div(a, b):
    return np.where(b != 0, a / b, np.nan)

def lag(df, col, n=1):
    return df.groupby("Company Name")[col].shift(n)

def opposite_sign(a, b):
    return ((a > 0) & (b < 0)) | ((a < 0) & (b > 0))

def nan_to_none(v):
    if v is None: return None
    try:
        if np.isnan(v): return None
    except Exception: pass
    return float(v)

def bool_to_py(v):
    if pd.isna(v): return None
    return bool(v)

# ── 1. load & compute financials ─────────────────────────────────────────────

def load_financials(path: str) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name="Sheet1", skiprows=3)
    df.columns = df.columns.str.strip().str.replace(r"\s+", " ", regex=True)
    df = df.sort_values(["Company Name", "CFC_Year"]).reset_index(drop=True)

    df["COGS"] = (
        df["PLC_ Opening Raw Materials"].fillna(0)
        + df["PLC_ Purchases Raw Materials"].fillna(0)
        - df["PLC_ Closing Raw Materials"].fillna(0)
        + df["PLC_ Other Direct Purchases / Brought in cost"].fillna(0)
        - df["PLC_ Raw Material Consumed Capitalised"].fillna(0)
    ).clip(lower=0)

    df["Op_Exp"]      = df["PLC_Total Expenditure"] - df["PLC_Miscellaneous Expenses"].fillna(0)
    df["GPM"]         = np.where(df["PLC_Net Sales"] != 0,
                                  (df["PLC_Net Sales"] - df["COGS"]) / df["PLC_Net Sales"], np.nan)
    df["EBIT"]        = df["PLC_Net Sales"] - df["Op_Exp"] - df["PLC_Depreciation"].fillna(0)
    df["OPM"]         = safe_div(df["EBIT"], df["PLC_Net Sales"])
    df["DSI"]         = safe_div(df["BSC_Inventories"] * 365, df["COGS"])
    df["NI_CFO"]      = safe_div(df["PLC_Profit After Tax"],
                                  df["CFC_Cash From Operating Activities"])

    # lags
    for col in ["PLC_Net Sales","PLC_Profit After Tax","COGS","Op_Exp",
                "BSC_ Sundry Debtors","BSC_Net Block","GPM","OPM",
                "PLC_Other Income","DSI","NI_CFO"]:
        df[col+"_lag1"] = lag(df, col)

    df["Avg_Debtors"]  = (df["BSC_ Sundry Debtors"] + df["BSC_ Sundry Debtors_lag1"]) / 2
    df["Avg_NetBlock"] = (df["BSC_Net Block"] + df["BSC_Net Block_lag1"]) / 2

    df["d_Sales"]  = df["PLC_Net Sales"]     - df["PLC_Net Sales_lag1"]
    df["d_PAT"]    = df["PLC_Profit After Tax"] - df["PLC_Profit After Tax_lag1"]
    df["d_COGS"]   = df["COGS"]              - df["COGS_lag1"]
    df["d_OpExp"]  = df["Op_Exp"]            - df["Op_Exp_lag1"]
    df["d_AvgRec"] = df["Avg_Debtors"]       - lag(df, "Avg_Debtors")
    df["d_AvgFA"]  = df["Avg_NetBlock"]      - lag(df, "Avg_NetBlock")

    df["R_SalesPAT"]    = safe_div(df["PLC_Net Sales"], df["PLC_Profit After Tax"])
    df["R_SalesCOGS"]   = safe_div(df["PLC_Net Sales"], df["COGS"])
    df["R_SalesOpExp"]  = safe_div(df["PLC_Net Sales"], df["Op_Exp"])
    df["R_SalesAvgRec"] = safe_div(df["PLC_Net Sales"], df["Avg_Debtors"])
    df["R_SalesAvgFA"]  = safe_div(df["PLC_Net Sales"], df["Avg_NetBlock"])
    df["R_InvCA"]       = safe_div(df["BSC_Inventories"], df["BSC_Total Current Assets"])
    df["R_RecCA"]       = safe_div(df["BSC_ Sundry Debtors"], df["BSC_Total Current Assets"])
    df["R_GPMOPM"]      = safe_div(df["GPM"], df["OPM"])
    df["R_OtherIncSales"] = safe_div(df["PLC_Other Income"], df["PLC_Net Sales"])

    for r in ["R_SalesPAT","R_SalesCOGS","R_SalesOpExp","R_SalesAvgFA",
              "R_InvCA","R_RecCA","R_GPMOPM","R_OtherIncSales"]:
        df[r+"_5max"] = df.groupby("Company Name")[r].transform(
            lambda x: x.shift(1).rolling(5).max())

    df["R_SalesAvgRec_5min"] = df.groupby("Company Name")["R_SalesAvgRec"].transform(
        lambda x: x.shift(1).rolling(5).min())

    df["RS1"]  = opposite_sign(df["d_Sales"], df["d_PAT"])
    df["RS2"]  = opposite_sign(df["d_Sales"], df["d_COGS"])
    df["RS3"]  = opposite_sign(df["d_Sales"], df["d_OpExp"])
    df["RS4"]  = opposite_sign(df["d_Sales"], df["d_AvgRec"])
    df["RS5"]  = opposite_sign(df["d_Sales"], df["d_AvgFA"])
    df["RS6"]  = (~df["RS1"]) & (df["R_SalesPAT"]    > df["R_SalesPAT_5max"])
    df["RS7"]  = (~df["RS2"]) & (df["R_SalesCOGS"]   > df["R_SalesCOGS_5max"])
    df["RS8"]  = (~df["RS3"]) & (df["R_SalesOpExp"]  > df["R_SalesOpExp_5max"])
    df["RS9"]  = df["R_SalesAvgRec"] < df["R_SalesAvgRec_5min"]
    df["RS10"] = df["R_SalesAvgFA"]  > df["R_SalesAvgFA_5max"]
    df["RS11"] = df["R_InvCA"]       > df["R_InvCA_5max"]
    df["RS12"] = df["R_RecCA"]       > df["R_RecCA_5max"]
    df["RS13"] = df["R_GPMOPM"]      > df["R_GPMOPM_5max"]
    df["RS14"] = df["R_OtherIncSales"] > df["R_OtherIncSales_5max"]
    df["ES1"]  = (df["DSI"] - df["DSI_lag1"] < 0) & (df["d_Sales"] < 0)
    df["CS1"]  = df["NI_CFO"] > df["NI_CFO_lag1"]

    FLAG_COLS = [f"RS{i}" for i in range(1,15)] + ["ES1","CS1"]
    for c in FLAG_COLS:
        df[c] = df[c].fillna(False)
    df["Total_Red_Flags"] = df[FLAG_COLS].sum(axis=1).astype(int)

    return df

# ── 2. upsert to Supabase ────────────────────────────────────────────────────

def upsert_companies(df: pd.DataFrame):
    names = df["Company Name"].dropna().unique().tolist()
    rows  = [{"fin_name": n} for n in names]
    sb.table("companies").upsert(rows, on_conflict="fin_name").execute()
    print(f"  ✓ Upserted {len(rows)} companies")

def get_company_id_map() -> dict:
    res = sb.table("companies").select("id,fin_name").execute()
    return {r["fin_name"]: r["id"] for r in res.data}

def upsert_financials(df: pd.DataFrame, company_map: dict):
    rows = []
    for _, r in df.iterrows():
        cid = company_map.get(r["Company Name"])
        if not cid: continue
        rows.append({
            "company_id":               cid,
            "year":                     int(r["CFC_Year"]),
            "year_end_date":            str(r["CFC_Year end date"])[:10] if pd.notna(r.get("CFC_Year end date")) else None,
            "net_sales":                nan_to_none(r["PLC_Net Sales"]),
            "opening_raw_materials":    nan_to_none(r["PLC_ Opening Raw Materials"]),
            "purchases_raw_materials":  nan_to_none(r["PLC_ Purchases Raw Materials"]),
            "closing_raw_materials":    nan_to_none(r["PLC_ Closing Raw Materials"]),
            "other_direct_purchases":   nan_to_none(r["PLC_ Other Direct Purchases / Brought in cost"]),
            "raw_material_capitalised": nan_to_none(r["PLC_ Raw Material Consumed Capitalised"]),
            "miscellaneous_expenses":   nan_to_none(r["PLC_Miscellaneous Expenses"]),
            "total_expenditure":        nan_to_none(r["PLC_Total Expenditure"]),
            "other_income":             nan_to_none(r["PLC_Other Income"]),
            "interest":                 nan_to_none(r["PLC_Interest"]),
            "pbdt":                     nan_to_none(r["PLC_PBDT"]),
            "depreciation":             nan_to_none(r["PLC_Depreciation"]),
            "profit_after_tax":         nan_to_none(r["PLC_Profit After Tax"]),
            "sundry_debtors":           nan_to_none(r["BSC_ Sundry Debtors"]),
            "inventories":              nan_to_none(r["BSC_Inventories"]),
            "total_current_assets":     nan_to_none(r["BSC_Total Current Assets"]),
            "net_block":                nan_to_none(r["BSC_Net Block"]),
            "cash_from_operations":     nan_to_none(r["CFC_Cash From Operating Activities"]),
        })
    sb.table("company_financials").upsert(rows, on_conflict="company_id,year").execute()
    print(f"  ✓ Upserted {len(rows)} financial rows")

def upsert_red_flags(df: pd.DataFrame, company_map: dict):
    FLAG_COLS = [f"rs{i}" for i in range(1,15)] + ["es1","cs1"]
    rows = []
    for _, r in df.iterrows():
        cid = company_map.get(r["Company Name"])
        if not cid: continue
        row = {
            "company_id":       cid,
            "year":             int(r["CFC_Year"]),
            "total_red_flags":  int(r["Total_Red_Flags"]),
            "cogs":             nan_to_none(r["COGS"]),
            "gpm":              nan_to_none(r["GPM"]),
            "opm":              nan_to_none(r["OPM"]),
            "ebit":             nan_to_none(r["EBIT"]),
            "dsi":              nan_to_none(r["DSI"]),
            "ni_cfo":           nan_to_none(r["NI_CFO"]),
        }
        for i in range(1,15):
            row[f"rs{i}"] = bool_to_py(r[f"RS{i}"])
        row["es1"] = bool_to_py(r["ES1"])
        row["cs1"] = bool_to_py(r["CS1"])
        rows.append(row)
    sb.table("company_red_flags").upsert(rows, on_conflict="company_id,year").execute()
    print(f"  ✓ Upserted {len(rows)} red flag rows")

def upsert_name_mappings(company_map: dict):
    MF_TO_FIN = {
        "Adani Enterp.":    "Adani Enterprises Ltd.",
        "Adani Ports":      "Adani Ports and Special Economic Zone Ltd.",
        "Apollo Hospitals": "Apollo Hospitals Enterprise Ltd.",
        "Asian Paints":     "Asian Paints Ltd.",
        "Axis Bank":        "Axis Bank Ltd.",
        "Bajaj Auto":       "Bajaj Auto Ltd.",
        "Bajaj Finance":    "Bajaj Finance Ltd.",
        "Bajaj Finserv":    "Bajaj Finserv Ltd.",
        "Bharat Electron":  "Bharat Electronics Ltd.",
        "Bharti Airtel":    "Bharti Airtel Ltd.",
        "Cipla":            "Cipla Ltd.",
        "Coal India":       "Coal India Ltd.",
        "Dr Reddy's Labs":  "Dr. Reddy's Laboratories Ltd.",
        "Eicher Motors":    "Eicher Motors Ltd.",
        "Eternal":          "Eternal Ltd.",
        "Grasim Inds":      "Grasim Industries Ltd.",
        "HCL Technologies": "HCL Technologies Ltd.",
        "HDFC Bank":        "HDFC Bank Ltd.",
        "HDFC Life Insur.": "HDFC Life Insurance Company Ltd.",
        "Hind. Unilever":   "Hindustan Unilever Ltd.",
        "Hindalco Inds.":   "Hindalco Industries Ltd.",
        "ICICI Bank":       "ICICI Bank Ltd.",
        "ITC":              "ITC Ltd.",
        "Infosys":          "Infosys Ltd.",
        "Interglobe Aviat": "Interglobe Aviation Ltd.",
        "Jio Financial":    "JIO Financial Services Ltd.",
        "JSW Steel":        "JSW Steel Ltd.",
        "Kotak Mah. Bank":  "Kotak Mahindra Bank Ltd.",
        "Larsen & Toubro":  "Larsen & Toubro Ltd.",
        "M & M":            "Mahindra & Mahindra Ltd.",
        "Maruti Suzuki":    "Maruti Suzuki India Ltd.",
        "Max Healthcare":   "Max Healthcare Institute Ltd.",
        "NTPC":             "NTPC Ltd.",
        "Nestle India":     "Nestle India Ltd.",
        "O N G C":          "Oil & Natural Gas Corporation Ltd.",
        "Power Grid Corpn": "Power Grid Corporation Of India Ltd.",
        "Reliance Industr": "Reliance Industries Ltd.",
        "SBI":              "State Bank Of India",
        "Shriram Finance":  "Shriram Finance Ltd.",
        "Sun Pharma.Inds.": "Sun Pharmaceutical Industries Ltd.",
        "TCS":              "Tata Consultancy Services Ltd.",
        "Tata Consumer":    "Tata Consumer Products Ltd.",
        "Tata Motors PVeh": "Tata Motors Passenger Vehicles Ltd.",
        "Tata Steel":       "Tata Steel Ltd.",
        "Tech Mahindra":    "Tech Mahindra Ltd.",
        "Titan Company":    "Titan Company Ltd.",
        "Trent":            "Trent Ltd.",
        "UltraTech Cem.":   "Ultratech Cement Ltd.",
        "Wipro":            "Wipro Ltd.",
    }
    rows = []
    for mf_name, fin_name in MF_TO_FIN.items():
        cid = company_map.get(fin_name)
        rows.append({"mf_name": mf_name, "company_id": cid})
    sb.table("mf_name_mappings").upsert(rows, on_conflict="mf_name").execute()
    print(f"  ✓ Upserted {len(rows)} name mappings")

def upsert_holdings(path: str, as_of: str, company_map: dict):
    # build mf_name → company_id from DB
    res = sb.table("mf_name_mappings").select("mf_name,company_id").execute()
    mf_map = {r["mf_name"]: r["company_id"] for r in res.data}

    mf_df = pd.read_excel(path)
    for _, row in mf_df.iterrows():
        scheme_code = str(row.get("n_mf_schcode","")).strip()
        scheme_name = str(row["s_sch_name"]).strip()
        isin        = str(row.get("s_isin","")).strip() or None
        aum         = float(row["n_schemeaum"]) if pd.notna(row["n_schemeaum"]) else None

        # upsert scheme
        scheme_row = {
            "scheme_name": scheme_name,
            "scheme_code": scheme_code or None,
            "isin":        isin,
            "aum_cr":      aum,
            "as_of_date":  as_of,
        }
        res2 = sb.table("mf_schemes").upsert(
            scheme_row, on_conflict="scheme_code"
        ).execute()
        scheme_id = res2.data[0]["id"]

        # delete old holdings for this scheme (fresh snapshot)
        sb.table("scheme_holdings").delete().eq("scheme_id", scheme_id).execute()

        try:
            holdings = ast.literal_eval(str(row["scheme_holdings"]))
        except Exception:
            continue

        h_rows = []
        for mf_name, weight in holdings.items():
            h_rows.append({
                "scheme_id":  scheme_id,
                "mf_name":    mf_name,
                "company_id": mf_map.get(mf_name),
                "weight_pct": float(weight),
            })
        if h_rows:
            sb.table("scheme_holdings").insert(h_rows).execute()

        # compute score
        compute_scheme_score(scheme_id, holdings, mf_map)
        print(f"  ✓ Processed scheme: {scheme_name}")

def compute_scheme_score(scheme_id: int, holdings: dict, mf_map: dict):
    # get latest red flags per company
    res = sb.table("company_red_flags").select(
        "company_id,total_red_flags"
    ).order("year", desc=True).execute()

    latest = {}
    for r in res.data:
        cid = r["company_id"]
        if cid not in latest:
            latest[cid] = r["total_red_flags"]

    total = len(holdings)
    matched = 0
    matched_w = 0.0
    weighted_score = 0.0
    total_weight = sum(w for w in holdings.values() if w > 0)

    for mf_name, weight in holdings.items():
        cid = mf_map.get(mf_name)
        if cid and cid in latest:
            flags = latest[cid]
            norm  = flags / MAX_FLAGS
            weighted_score += weight * norm
            matched_w      += weight
            matched        += 1

    mf_score = (weighted_score / matched_w) if matched_w > 0 else None
    coverage = round((matched_w / total_weight * 100) if total_weight > 0 else 0, 1)

    if mf_score is None:
        typology = "Unrated"
    elif mf_score < 0.20:
        typology = "Low Risk"
    elif mf_score < 0.35:
        typology = "Moderate Risk"
    elif mf_score < 0.50:
        typology = "Elevated Risk"
    else:
        typology = "High Risk"

    sb.table("scheme_scores").upsert({
        "scheme_id":         scheme_id,
        "total_holdings":    total,
        "matched_holdings":  matched,
        "unmatched_holdings":total - matched,
        "coverage_pct":      coverage,
        "weighted_rf_score": mf_score,
        "typology":          typology,
    }, on_conflict="scheme_id").execute()

# ── main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--financials", required=True)
    parser.add_argument("--holdings",   required=True)
    parser.add_argument("--date",       default=str(date.today()))
    args = parser.parse_args()

    print("\n📊 Loading financials...")
    df = load_financials(args.financials)

    print("\n📥 Upserting to Supabase...")
    upsert_companies(df)
    company_map = get_company_id_map()
    upsert_financials(df, company_map)
    upsert_red_flags(df, company_map)
    upsert_name_mappings(company_map)

    print("\n📂 Processing scheme holdings...")
    upsert_holdings(args.holdings, args.date, company_map)

    print("\n✅ Ingestion complete.")

if __name__ == "__main__":
    main()
