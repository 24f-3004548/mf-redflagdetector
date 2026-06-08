import os
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="MF Red Flag Detector API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production to your Vercel domain
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

sb: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_ANON_KEY"],
)

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
gemini = genai.GenerativeModel("gemini-2.5-flash")

MAX_FLAGS = 16

FLAG_DESCRIPTIONS = {
    "rs1":  "Sales & PAT moved in opposite directions — revenue grew but profit fell (or vice versa)",
    "rs2":  "Sales & COGS moved in opposite directions — unusual cost behaviour relative to revenue",
    "rs3":  "Sales & Operating Expenses moved in opposite directions",
    "rs4":  "Sales & Average Receivables moved in opposite directions — receivables not tracking revenue",
    "rs5":  "Sales & Average Fixed Assets moved in opposite directions",
    "rs6":  "Sales/PAT ratio is at a 5-year high — profits growing much faster than sales",
    "rs7":  "Sales/COGS ratio is at a 5-year high — COGS dropped suspiciously relative to sales",
    "rs8":  "Sales/OpEx ratio is at a 5-year high — operating costs dropped unusually",
    "rs9":  "Sales/Avg Receivables ratio is at a 5-year low — receivables ballooning vs revenue",
    "rs10": "Sales/Avg Fixed Assets ratio is at a 5-year high — asset efficiency suspiciously elevated",
    "rs11": "Inventory as % of Current Assets is at a 5-year high",
    "rs12": "Receivables as % of Current Assets is at a 5-year high",
    "rs13": "Gross Margin / Operating Margin ratio is at a 5-year high — below-line costs unusually low",
    "rs14": "Other Income as % of Sales is at a 5-year high — reliance on non-core income",
    "es1":  "Days Sales of Inventory fell while sales also fell — possible inventory manipulation",
    "cs1":  "Net Income / Cash from Operations ratio is rising — earnings diverging from cash flow",
}

TYPOLOGY_COLORS = {
    "Low Risk":      "#16a34a",
    "Moderate Risk": "#d97706",
    "Elevated Risk": "#ea580c",
    "High Risk":     "#dc2626",
    "Unrated":       "#6b7280",
}

# ── endpoints ────────────────────────────────────────────────────────────────

@app.get("/api/schemes")
def list_schemes():
    """Return all schemes with their scores for the dropdown + summary table."""
    s_res = (
        sb.table("mf_schemes")
        .select("id, scheme_name, scheme_code, aum_cr, as_of_date")
        .order("scheme_name")
        .execute()
    )
    sc_res = (
        sb.table("scheme_scores")
        .select("scheme_id, total_holdings, matched_holdings, unmatched_holdings, coverage_pct, weighted_rf_score, typology")
        .execute()
    )
    score_map = {r["scheme_id"]: r for r in (sc_res.data or [])}
    schemes = []
    for s in (s_res.data or []):
        score = score_map.get(s["id"], {})
        schemes.append({
            "id":                 s["id"],
            "scheme_name":        s["scheme_name"],
            "scheme_code":        s.get("scheme_code"),
            "aum_cr":             s.get("aum_cr"),
            "as_of_date":         s.get("as_of_date"),
            "total_holdings":     score.get("total_holdings"),
            "matched_holdings":   score.get("matched_holdings"),
            "unmatched_holdings": score.get("unmatched_holdings"),
            "coverage_pct":       score.get("coverage_pct"),
            "weighted_rf_score":  score.get("weighted_rf_score"),
            "typology":           score.get("typology") or "Unrated",
        })
    return {"schemes": schemes}


@app.get("/api/schemes/{scheme_id}")
def get_scheme_detail(scheme_id: int):
    """Return full detail for one scheme including per-stock red flag breakdown."""

    # 1. Scheme meta
    s_res = (
        sb.table("mf_schemes")
        .select("id, scheme_name, scheme_code, aum_cr, as_of_date")
        .eq("id", scheme_id)
        .single()
        .execute()
    )
    if not s_res.data:
        raise HTTPException(404, "Scheme not found")
    scheme = s_res.data

    # 2. Scheme score
    sc_res = (
        sb.table("scheme_scores")
        .select("total_holdings, matched_holdings, unmatched_holdings, coverage_pct, weighted_rf_score, typology")
        .eq("scheme_id", scheme_id)
        .execute()
    )
    score = sc_res.data[0] if sc_res.data else {}

    # 3. All holdings for this scheme
    h_res = (
        sb.table("scheme_holdings")
        .select("mf_name, weight_pct, company_id")
        .eq("scheme_id", scheme_id)
        .order("weight_pct", desc=True)
        .execute()
    )
    holdings = h_res.data or []

    # 4. Collect all company_ids that were matched
    company_ids = [h["company_id"] for h in holdings if h.get("company_id")]

    # 5. Fetch company names
    comp_map = {}
    if company_ids:
        c_res = (
            sb.table("companies")
            .select("id, fin_name")
            .in_("id", company_ids)
            .execute()
        )
        comp_map = {r["id"]: r["fin_name"] for r in (c_res.data or [])}

    # 6. Fetch latest red flags for those companies (all years, we'll pick latest)
    flags_map = {}
    if company_ids:
        f_res = (
            sb.table("company_red_flags")
            .select(
                "company_id, year, total_red_flags, "
                "rs1,rs2,rs3,rs4,rs5,rs6,rs7,rs8,rs9,rs10,rs11,rs12,rs13,rs14,"
                "es1,cs1,gpm,opm,ebit,dsi,ni_cfo,cogs"
            )
            .in_("company_id", company_ids)
            .order("year", desc=True)
            .execute()
        )
        # Keep only the latest year per company
        for r in (f_res.data or []):
            cid = r["company_id"]
            if cid not in flags_map:
                flags_map[cid] = r

    # 7. Build matched / unmatched lists
    matched   = []
    unmatched = []

    for h in holdings:
        cid = h.get("company_id")
        if not cid or cid not in comp_map:
            unmatched.append({"mf_name": h["mf_name"], "weight_pct": h["weight_pct"]})
            continue

        latest_flag = flags_map.get(cid)
        flag_detail = {}
        if latest_flag:
            for k, desc in FLAG_DESCRIPTIONS.items():
                flag_detail[k] = {
                    "triggered": bool(latest_flag.get(k)),
                    "description": desc,
                }

        matched.append({
            "mf_name":             h["mf_name"],
            "fin_name":            comp_map[cid],
            "weight_pct":          h["weight_pct"],
            "year":                latest_flag["year"] if latest_flag else None,
            "total_red_flags":     latest_flag["total_red_flags"] if latest_flag else None,
            "normalised_score":    round(latest_flag["total_red_flags"] / MAX_FLAGS, 4) if latest_flag else None,
            "weighted_contribution": round(h["weight_pct"] * (latest_flag["total_red_flags"] / MAX_FLAGS), 6) if latest_flag else None,
            "flags":               flag_detail,
            "metrics": {
                "gpm":    latest_flag.get("gpm") if latest_flag else None,
                "opm":    latest_flag.get("opm") if latest_flag else None,
                "ebit":   latest_flag.get("ebit") if latest_flag else None,
                "dsi":    latest_flag.get("dsi") if latest_flag else None,
                "ni_cfo": latest_flag.get("ni_cfo") if latest_flag else None,
                "cogs":   latest_flag.get("cogs") if latest_flag else None,
            } if latest_flag else {},
        })

    return {
        "id":          scheme["id"],
        "scheme_name": scheme["scheme_name"],
        "aum_cr":      scheme.get("aum_cr"),
        "as_of_date":  scheme.get("as_of_date"),
        "score":       score,
        "matched":     matched,
        "unmatched":   unmatched,
    }


class ExplainRequest(BaseModel):
    scheme_name: str
    weighted_rf_score: float
    typology: str
    total_holdings: int
    matched_holdings: int
    matched_companies: int
    coverage_pct: float
    top_holdings: list   # [{fin_name, weight_pct, total_red_flags, normalised_score}]
    flag_frequency: dict[str, int]  # {"flag description": count}


@app.post("/api/explain")
async def explain_scheme(req: ExplainRequest):
    """Generate a Gemini-powered natural language explanation of the scheme's risk profile."""
    top_text = "\n".join(
        f"  - {h['fin_name']} ({h['weight_pct']:.2f}% weight, {h['total_red_flags']} red flags, {h.get('weighted_contribution', 0):.4f} weighted contribution)"
        for h in req.top_holdings[:10]
    )
    flags_text = "\n".join(
        f"  - {flag}: {count}" for flag, count in list(req.flag_frequency.items())[:8]
    )

    prompt = f"""You are a financial analyst explaining accounting-quality risk in a mutual fund portfolio.

        Context:
        - The Red Flag Score ranges from 0 to 1.
        - Lower scores indicate cleaner accounting quality and fewer warning signals.
        - Higher scores indicate greater concentrations of accounting red flags.
        - The score is NOT a prediction of stock returns or fund performance.
        - The analysis covers only the holdings that could be matched to the accounting-quality database.

        Instructions:

        1. Write exactly 3 paragraphs.

        2. Paragraph 1:
            - Explain the overall score and risk category.
            - Explain what the score means in plain English.
            - Mention portfolio coverage.
            - Avoid overstating certainty.

        3. Paragraph 2:
            - Identify the holdings contributing the most red flags.
            - Explain the most common warning signals observed.
            - Explain why those signals matter from an accounting-quality perspective.
            - Do not accuse companies of fraud or manipulation.

        4. Paragraph 3:
            - Provide balanced guidance for a retail investor.
            - Emphasise that the score should be used alongside broader fundamental analysis.
            - Mention monitoring changes in future reports.

        5. Use professional academic language.
        6. Do not use bullet points.
        7. Do not use headings.
        8. Do not mention AI, machine learning, algorithms, Gemini, or prompt instructions.
        9. Keep length between 250 and 350 words.
        10. Never state that a company has committed wrongdoing. Use phrases such as:
            - "may warrant closer scrutiny"
            - "could indicate"
            - "may reflect"
            - "requires monitoring"

        Scheme: {req.scheme_name}
        Overall Score: {req.weighted_rf_score:.4f} / 1.0
        Risk Typology: {req.typology}
        Holdings covered: {req.matched_holdings} of {req.total_holdings} ({req.coverage_pct:.1f}% of portfolio weight)
        Number of matched companies analysed: {req.matched_companies}

        Top holdings by weighted contribution:
        {top_text}

        Most common triggered signals:
        {flags_text}

        Output only the final explanation AND ANSWER WITHIN 250 WORDS. DO NOT EXPLAIN YOUR REASONING OR SHOW YOUR CALCULATIONS."""

    response = gemini.generate_content(prompt)
    return {"explanation": response.text}


@app.get("/api/health")
def health():
    return {"status": "ok"}