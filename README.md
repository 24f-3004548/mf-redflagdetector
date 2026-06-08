# MF Red Flag Detector

A full-stack web application that analyses Indian mutual fund schemes for accounting quality red flags using Howard Schilit's *Financial Shenanigans* framework.

---

## Architecture

```
mf-redflag/
├── schema.sql              ← Supabase PostgreSQL schema
├── scripts/
│   └── ingest.py           ← Data pipeline (xlsx → Supabase)
├── backend/
│   ├── main.py             ← FastAPI REST API
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/App.jsx         ← React SPA (single file)
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── vercel.json             ← Vercel deployment config
```

---

## Database (Supabase)

### Step 1 — Create Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Open the SQL Editor → paste `schema.sql` → Run

### Tables

| Table | Purpose |
|---|---|
| `companies` | Master list of companies (one row per company) |
| `company_financials` | Raw annual P&L, balance sheet, cash flow data |
| `company_red_flags` | Computed 16-flag results per company per year |
| `mf_name_mappings` | Maps MF-provider stock names to company records |
| `mf_schemes` | Mutual fund schemes metadata (name, AUM, ISIN) |
| `scheme_holdings` | Individual stock weights per scheme snapshot |
| `scheme_scores` | Pre-computed weighted red flag scores per scheme |

### Adding New Data
Every time you have a new `financials.xlsx` or `Scheme_Holdings.xlsx`:
```bash
python scripts/ingest.py \
  --financials new_financials.xlsx \
  --holdings   new_holdings.xlsx \
  --date       2026-03-31
```
The script upserts everything — safe to re-run.

---

## Backend (FastAPI)

### Local Development
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # fill in keys
uvicorn main:app --reload
```
API runs at `http://localhost:8000`

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/schemes` | All schemes with scores (for list + cards) |
| `GET` | `/api/schemes/{id}` | Full detail: score + per-stock flags + metrics |
| `POST` | `/api/explain` | Gemini-powered narrative explanation |
| `GET` | `/api/health` | Health check |

### Deploy to Vercel
```bash
npm i -g vercel
vercel login
vercel --prod
# Set env vars in Vercel dashboard:
# SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY
```

---

## Frontend (React + Vite)

### Local Development
```bash
cd frontend
npm install
cp .env.example .env.local   # set VITE_API_URL if needed
npm run dev
```
Opens at `http://localhost:5173`

### Build & Deploy
```bash
npm run build
# Deploy dist/ to Vercel (auto on push if connected to GitHub)
```

### Features
- **Scheme List** — searchable, sortable by risk score / name / AUM
- **Score Cards** — weighted red flag score with visual gauge, coverage meter
- **AI Explanation** — Gemini-powered narrative (generated on demand)
- **Holdings Table** — click any row to expand 16-flag breakdown
- **Flag Tooltips** — hover each RS/ES/CS flag cell for description
- **Unmatched Holdings** — clearly shown with weight chips

---

## The 16 Red Flags

### Revenue Shenanigans (RS1–RS14)
| Flag | Signal |
|---|---|
| RS1 | Sales & PAT moved in opposite directions |
| RS2 | Sales & COGS moved in opposite directions |
| RS3 | Sales & Operating Expenses moved in opposite directions |
| RS4 | Sales & Average Receivables moved in opposite directions |
| RS5 | Sales & Average Fixed Assets moved in opposite directions |
| RS6 | Sales/PAT ratio at 5-year high (profits outpacing sales) |
| RS7 | Sales/COGS ratio at 5-year high (COGS suspiciously low) |
| RS8 | Sales/OpEx ratio at 5-year high (OpEx suspiciously low) |
| RS9 | Sales/Avg Receivables at 5-year low (receivables bloating) |
| RS10 | Sales/Avg Fixed Assets at 5-year high (asset efficiency extreme) |
| RS11 | Inventory / Current Assets at 5-year high |
| RS12 | Receivables / Current Assets at 5-year high |
| RS13 | GPM / OPM ratio at 5-year high |
| RS14 | Other Income / Sales at 5-year high |

### Earnings Quality (ES1)
| Flag | Signal |
|---|---|
| ES1 | DSI fell while sales also fell (inventory manipulation signal) |

### Cash Flow Quality (CS1)
| Flag | Signal |
|---|---|
| CS1 | Net Income / CFO ratio rising (earnings diverging from cash) |

### Score Typology
| Score | Typology | Avg Flags |
|---|---|---|
| < 0.20 | Low Risk | < 3.2 / 16 |
| 0.20–0.35 | Moderate Risk | 3.2–5.6 / 16 |
| 0.35–0.50 | Elevated Risk | 5.6–8.0 / 16 |
| ≥ 0.50 | High Risk | > 8.0 / 16 |

---

## Environment Variables

### Backend
```
SUPABASE_URL          = https://xxx.supabase.co
SUPABASE_ANON_KEY     = eyJ...   (public, read-only)
SUPABASE_SERVICE_KEY  = eyJ...   (private, for ingest script only)
GEMINI_API_KEY        = AIzaSy...
```

### Frontend
```
VITE_API_URL = https://your-api.vercel.app   (or http://localhost:8000 locally)
```
