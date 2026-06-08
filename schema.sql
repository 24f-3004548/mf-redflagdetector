-- ============================================================
-- MF Red Flag Detector — Supabase Schema
-- ============================================================

-- 1. COMPANIES
--    One row per company (master list).
CREATE TABLE companies (
  id            BIGSERIAL PRIMARY KEY,
  fin_name      TEXT NOT NULL UNIQUE,   -- name as it appears in financials.xlsx
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. COMPANY FINANCIALS
--    Raw annual financials — one row per (company, year).
CREATE TABLE company_financials (
  id                              BIGSERIAL PRIMARY KEY,
  company_id                      BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year                            INT    NOT NULL,
  year_end_date                   DATE,

  -- P&L
  net_sales                       NUMERIC,
  opening_raw_materials           NUMERIC,
  purchases_raw_materials         NUMERIC,
  closing_raw_materials           NUMERIC,
  other_direct_purchases          NUMERIC,
  raw_material_capitalised        NUMERIC,
  miscellaneous_expenses          NUMERIC,
  total_expenditure               NUMERIC,
  other_income                    NUMERIC,
  interest                        NUMERIC,
  pbdt                            NUMERIC,
  depreciation                    NUMERIC,
  profit_after_tax                NUMERIC,

  -- Balance Sheet
  sundry_debtors                  NUMERIC,
  inventories                     NUMERIC,
  total_current_assets            NUMERIC,
  net_block                       NUMERIC,

  -- Cash Flow
  cash_from_operations            NUMERIC,

  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, year)
);

-- 3. COMPANY RED FLAGS
--    Computed flags per (company, year). Re-run the compute script to refresh.
CREATE TABLE company_red_flags (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year            INT    NOT NULL,

  -- 14 Revenue/Sales checks
  rs1             BOOLEAN,   -- Sales & PAT move in opposite directions
  rs2             BOOLEAN,   -- Sales & COGS move in opposite directions
  rs3             BOOLEAN,   -- Sales & OpEx move in opposite directions
  rs4             BOOLEAN,   -- Sales & Avg Receivables move in opposite directions
  rs5             BOOLEAN,   -- Sales & Avg Fixed Assets move in opposite directions
  rs6             BOOLEAN,   -- Sales/PAT ratio > 5-yr max (profit outpaces sales)
  rs7             BOOLEAN,   -- Sales/COGS ratio > 5-yr max (COGS drops suspiciously)
  rs8             BOOLEAN,   -- Sales/OpEx ratio > 5-yr max (OpEx drops suspiciously)
  rs9             BOOLEAN,   -- Sales/AvgRec ratio < 5-yr min (receivables bloating)
  rs10            BOOLEAN,   -- Sales/AvgFA ratio > 5-yr max (asset efficiency suspiciously high)
  rs11            BOOLEAN,   -- Inventory/CurrentAssets > 5-yr max
  rs12            BOOLEAN,   -- Receivables/CurrentAssets > 5-yr max
  rs13            BOOLEAN,   -- GPM/OPM ratio > 5-yr max
  rs14            BOOLEAN,   -- OtherIncome/Sales ratio > 5-yr max

  -- Earnings quality
  es1             BOOLEAN,   -- DSI fell while sales also fell (inventory manipulation signal)

  -- Cash flow quality
  cs1             BOOLEAN,   -- NI/CFO ratio rising (earnings diverging from cash)

  total_red_flags INT,

  -- Derived metrics (stored for UI display)
  cogs            NUMERIC,
  gpm             NUMERIC,
  opm             NUMERIC,
  ebit            NUMERIC,
  dsi             NUMERIC,
  ni_cfo          NUMERIC,

  computed_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, year)
);

-- 4. NAME MAPPINGS
--    Maps MF-provider stock names → company fin_name. Editable via UI.
CREATE TABLE mf_name_mappings (
  id          BIGSERIAL PRIMARY KEY,
  mf_name     TEXT NOT NULL UNIQUE,   -- name as in Scheme_Holdings
  company_id  BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. MF SCHEMES
--    One row per mutual fund scheme.
CREATE TABLE mf_schemes (
  id              BIGSERIAL PRIMARY KEY,
  scheme_code     TEXT UNIQUE,         -- n_mf_schcode
  scheme_name     TEXT NOT NULL,       -- s_sch_name
  isin            TEXT,                -- s_isin
  aum_cr          NUMERIC,             -- n_schemeaum
  as_of_date      DATE,                -- date of the holdings snapshot
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SCHEME HOLDINGS
--    Individual stock weights within each scheme snapshot.
CREATE TABLE scheme_holdings (
  id              BIGSERIAL PRIMARY KEY,
  scheme_id       BIGINT NOT NULL REFERENCES mf_schemes(id) ON DELETE CASCADE,
  mf_name         TEXT NOT NULL,       -- raw name from the holdings file
  company_id      BIGINT REFERENCES companies(id) ON DELETE SET NULL,  -- resolved via mf_name_mappings
  weight_pct      NUMERIC NOT NULL,    -- weight as percentage (0–100)
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 7. SCHEME SCORES
--    Pre-computed weighted red flag scores per scheme snapshot.
--    Recomputed whenever new financials or holdings are ingested.
CREATE TABLE scheme_scores (
  id                      BIGSERIAL PRIMARY KEY,
  scheme_id               BIGINT NOT NULL REFERENCES mf_schemes(id) ON DELETE CASCADE,
  total_holdings          INT,
  matched_holdings        INT,
  unmatched_holdings      INT,
  coverage_pct            NUMERIC,     -- % of portfolio weight that was matched
  weighted_rf_score       NUMERIC,     -- 0–1 normalised score
  typology                TEXT,        -- Low Risk / Moderate Risk / Elevated Risk / High Risk
  computed_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (scheme_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_company_financials_company_year ON company_financials(company_id, year);
CREATE INDEX idx_company_red_flags_company_year  ON company_red_flags(company_id, year);
CREATE INDEX idx_scheme_holdings_scheme          ON scheme_holdings(scheme_id);
CREATE INDEX idx_scheme_holdings_company         ON scheme_holdings(company_id);
CREATE INDEX idx_scheme_scores_score             ON scheme_scores(weighted_rf_score);

-- ============================================================
-- ROW-LEVEL SECURITY (enable in Supabase dashboard)
-- ============================================================
-- All tables default to public read for the API key in use.
-- Restrict writes to service-role key only.
ALTER TABLE companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_financials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_red_flags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mf_name_mappings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mf_schemes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_holdings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_scores        ENABLE ROW LEVEL SECURITY;

-- Public read policy (anon key)
CREATE POLICY "public_read_companies"          ON companies            FOR SELECT USING (true);
CREATE POLICY "public_read_financials"         ON company_financials   FOR SELECT USING (true);
CREATE POLICY "public_read_red_flags"          ON company_red_flags    FOR SELECT USING (true);
CREATE POLICY "public_read_mappings"           ON mf_name_mappings     FOR SELECT USING (true);
CREATE POLICY "public_read_schemes"            ON mf_schemes           FOR SELECT USING (true);
CREATE POLICY "public_read_holdings"           ON scheme_holdings      FOR SELECT USING (true);
CREATE POLICY "public_read_scores"             ON scheme_scores        FOR SELECT USING (true);
