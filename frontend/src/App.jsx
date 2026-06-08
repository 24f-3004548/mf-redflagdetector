import { useState, useEffect, useRef } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const FLAG_LABELS = {
  rs1:  "Sales ↔ PAT Direction",
  rs2:  "Sales ↔ COGS Direction",
  rs3:  "Sales ↔ OpEx Direction",
  rs4:  "Sales ↔ Receivables Direction",
  rs5:  "Sales ↔ Fixed Assets Direction",
  rs6:  "Sales/PAT Ratio Peak",
  rs7:  "Sales/COGS Ratio Peak",
  rs8:  "Sales/OpEx Ratio Peak",
  rs9:  "Receivables Velocity Low",
  rs10: "Asset Efficiency Peak",
  rs11: "Inventory Concentration Peak",
  rs12: "Receivables Concentration Peak",
  rs13: "GPM/OPM Ratio Peak",
  rs14: "Other Income Ratio Peak",
  es1:  "Inventory Manipulation Signal",
  cs1:  "Earnings vs Cash Divergence",
};

const TYPOLOGY_CONFIG = {
  "Low Risk":      { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", badge: "#dcfce7" },
  "Moderate Risk": { color: "#d97706", bg: "#fffbeb", border: "#fde68a", badge: "#fef3c7" },
  "Elevated Risk": { color: "#ea580c", bg: "#fff7ed", border: "#fed7aa", badge: "#ffedd5" },
  "High Risk":     { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", badge: "#fee2e2" },
  "Unrated":       { color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", badge: "#f3f4f6" },
};

const FLAG_GROUPS = {
  "Revenue Quality":     ["rs1","rs2","rs3","rs4","rs5","rs6","rs7","rs8","rs9","rs10"],
  "Earnings Quality":    ["rs11","rs12","rs13","rs14","es1"],
  "Cash Flow Quality":   ["cs1"],
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = (n, d = 2) =>
  n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: d });
const fmtPct = (n) => n == null ? "—" : `${Number(n).toFixed(2)}%`;
const fmtScore = (n) => n == null ? "—" : Number(n).toFixed(4);
const scoreBar = (n) => (n == null ? 0 : Math.min(100, Number(n) * 100));

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function Tooltip({ children, content }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);

  const handleMouseMove = (e) => {
    setPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <span
      ref={ref}
      className="tooltip-trigger"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onMouseMove={handleMouseMove}
    >
      {children}
      {visible && (
        <div
          className="tooltip-box"
          style={{ left: pos.x + 14, top: pos.y - 10 }}
        >
          {content}
        </div>
      )}
    </span>
  );
}

function TypologyBadge({ typology }) {
  const cfg = TYPOLOGY_CONFIG[typology] || TYPOLOGY_CONFIG["Unrated"];
  return (
    <span
      className="typology-badge"
      style={{
        color: cfg.color,
        background: cfg.badge,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {typology}
    </span>
  );
}

function ScoreGauge({ score }) {
  const pct = scoreBar(score);
  const color =
    score < 0.2 ? "#16a34a"
    : score < 0.35 ? "#d97706"
    : score < 0.5 ? "#ea580c"
    : "#dc2626";

  return (
    <div className="score-gauge">
      <div className="gauge-track">
        <div
          className="gauge-fill"
          style={{ width: `${pct}%`, background: color }}
        />
        <div className="gauge-zones">
          <div style={{ width: "20%", background: "#16a34a22" }} />
          <div style={{ width: "15%", background: "#d9770622" }} />
          <div style={{ width: "15%", background: "#ea580c22" }} />
          <div style={{ width: "50%", background: "#dc262622" }} />
        </div>
      </div>
      <div className="gauge-labels">
        <span>0</span>
        <span style={{ color: "#16a34a" }}>Low</span>
        <span style={{ color: "#d97706" }}>Moderate</span>
        <span style={{ color: "#ea580c" }}>Elevated</span>
        <span style={{ color: "#dc2626" }}>High</span>
        <span>1</span>
      </div>
    </div>
  );
}

function FlagGrid({ flags }) {
  return (
    <div className="flag-grid">
      {Object.entries(FLAG_GROUPS).map(([group, keys]) => (
        <div key={group} className="flag-group">
          <div className="flag-group-label">{group}</div>
          <div className="flag-grid-inner">
            {keys.map((k) => {
              const f = flags?.[k];
              const triggered = f?.triggered;

              const ACADEMIC_TOOLTIPS = {
                rs1:  "Divergent movements of revenue and net profit suggest recognition or expense-timing anomalies.",
                rs2:  "Atypical sales–COGS divergence may indicate cost classification or revenue recognition inconsistencies.",
                rs3:  "Opposing sales and operating-expense trends can reflect discretionary expense timing or misclassification.",
                rs4:  "Receivables growing out of line with sales suggests credit extension or revenue recognition concerns.",
                rs5:  "Sales and fixed-asset changes moving inversely may indicate capitalization policy shifts or one‑off disposals.",
                rs6:  "An elevated sales-to-profit ratio relative to history can imply transitory or non‑operating profit components.",
                rs7:  "A spike in sales/COGS ratio versus prior periods can reflect inventory/cost smoothing or margin manipulation.",
                rs8:  "Sales/OpEx ratio at historical highs may indicate cost deferral or reclassification to inflate margins.",
                rs9:  "A sustained decline in receivables velocity versus sales signals potential collectability or channel-stuffing issues.",
                rs10: "Unusually high sales per fixed asset suggests aggressive revenue recognition or temporary capacity utilisation." ,
                rs11: "Inventory concentration within current assets may signal write‑downs risk or valuation subjectivity.",
                rs12: "Receivables concentration indicates exposure to a few large debtors and attendant recognition risk.",
                rs13: "A large divergence between gross and operating margins can reflect non‑recurring below‑the‑line items.",
                rs14: "Disproportionate other income relative to sales suggests earnings reliance on non‑operating sources.",
                es1:  "Concurrent declines in DSI and sales may indicate inventory timing manipulation to smooth earnings.",
                cs1:  "Rising net income relative to operating cash flow suggests earnings not backed by underlying cash generation.",
              };

              return (
                <Tooltip
                  key={k}
                  content={
                    <div className="tooltip-flag-content">
                      <div className="tooltip-flag-key">{k.toUpperCase()}</div>
                      <div className="tooltip-flag-label">{FLAG_LABELS[k]}</div>
                      <div className="tooltip-flag-desc">{ACADEMIC_TOOLTIPS[k]}</div>
                      <div style={{ marginTop: 8 }} className={`tooltip-flag-status ${triggered ? "triggered" : "clear"}`}>
                        {triggered ? "⚑ TRIGGERED" : "✓ Clear"}
                      </div>
                    </div>
                  }
                >
                  <div className={`flag-cell ${triggered ? "flag-on" : "flag-off"}`}>
                    <span className="flag-cell-key">{k.toUpperCase()}</span>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function HoldingRow({ h, rank }) {
  const [expanded, setExpanded] = useState(false);
  const flagCount = h.total_red_flags ?? 0;
  const score = h.normalised_score;

  const color =
    score < 0.2 ? "#16a34a"
    : score < 0.35 ? "#d97706"
    : score < 0.5 ? "#ea580c"
    : "#dc2626";

  const triggeredFlags = h.flags
    ? Object.entries(h.flags).filter(([, v]) => v.triggered).length
    : 0;

  return (
    <>
      <tr
        className={`holding-row ${expanded ? "expanded" : ""}`}
        onClick={() => h.flags && setExpanded((p) => !p)}
        style={{ cursor: h.flags ? "pointer" : "default" }}
      >
        <td className="rank-cell">{rank}</td>
        <td className="name-cell">
          <div className="holding-name">{h.fin_name || h.mf_name}</div>
          {h.fin_name && h.mf_name !== h.fin_name && (
            <div className="holding-alias">{h.mf_name}</div>
          )}
        </td>
        <td className="weight-cell">{fmtPct(h.weight_pct)}</td>
        <td className="flags-cell">
          {h.total_red_flags != null ? (
            <div className="flag-count" style={{ color }}>
              <span className="flag-num">{flagCount}</span>
              <span className="flag-denom">/16</span>
            </div>
          ) : <span className="no-data">—</span>}
        </td>
        <td className="score-cell">
          {score != null ? (
            <div className="mini-bar-wrap">
              <div className="mini-bar-track">
                <div
                  className="mini-bar-fill"
                  style={{ width: `${scoreBar(score)}%`, background: color }}
                />
              </div>
              <span className="mini-bar-label">{fmtScore(score)}</span>
            </div>
          ) : <span className="no-data">—</span>}
        </td>
        <td className="wc-cell">
          {h.weighted_contribution != null
            ? fmtScore(h.weighted_contribution)
            : <span className="no-data">—</span>}
        </td>
        <td className="expand-cell">
          {h.flags && (
            <span className={`expand-chevron ${expanded ? "up" : ""}`}>›</span>
          )}
        </td>
      </tr>
      {expanded && h.flags && (
        <tr className="detail-row">
          <td colSpan={7}>
            <div className="detail-panel">
              <div className="detail-panel-header">
                <span>Flag Analysis — {h.fin_name} (FY{h.year})</span>
                <span className="triggered-count">{triggeredFlags} of 16 triggered</span>
              </div>
              <FlagGrid flags={h.flags} metrics={h.metrics} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ExplanationPanel({ scheme, detail }) {
  const [text, setText]     = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded]  = useState(false);

  const generateExplanation = async () => {
    setLoading(true);
    setText("");
    try {
      const top = [...detail.matched]
        .sort((a, b) => (b.weighted_contribution ?? 0) - (a.weighted_contribution ?? 0))
        .slice(0, 10)
        .map((h) => ({
          fin_name: h.fin_name,
          weight_pct: h.weight_pct,
          total_red_flags: h.total_red_flags,
          normalised_score: h.normalised_score,
          weighted_contribution: h.weighted_contribution,
        }));

      const triggered = new Map();
      detail.matched.forEach((h) => {
        if (h.flags) {
          Object.entries(h.flags).forEach(([, v]) => {
            if (v.triggered) {
              triggered.set(v.description, (triggered.get(v.description) || 0) + 1);
            }
          });
        }
      });

      const flag_frequency = Object.fromEntries(
        [...triggered.entries()].sort((a, b) => b[1] - a[1])
      );

      const res = await fetch(`${API_BASE}/api/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheme_name:       scheme.scheme_name,
          weighted_rf_score: detail.score.weighted_rf_score,
          typology:          detail.score.typology,
          total_holdings:    detail.score.total_holdings,
          matched_holdings:  detail.score.matched_holdings,
          matched_companies: detail.matched.length,
          coverage_pct:      detail.score.coverage_pct,
          top_holdings:      top,
          flag_frequency,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("/api/explain returned error", res.status, res.statusText, body);
        setText(`Failed to generate explanation: ${res.status} ${res.statusText}`);
        return;
      }

      let data = null;
      try {
        data = await res.json();
      } catch (err) {
        console.error("Failed to parse /api/explain JSON", err);
        const txt = await res.text().catch(() => "");
        setText(`Invalid response from server: ${txt || res.statusText}`);
        return;
      }

      if (!data || !data.explanation) {
        console.error("/api/explain returned no explanation", data);
        setText("No explanation returned from server.");
        return;
      }

      setText(data.explanation);
      setLoaded(true);
    } catch (e) {
      setText("Failed to generate explanation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="explanation-panel">
      <div className="explanation-header">
        <div className="explanation-title">
          <span className="ai-icon">✦</span>
          AI Risk Explanation
        </div>
        {!loaded && (
          <button
            className="explain-btn"
            onClick={generateExplanation}
            disabled={loading}
          >
            {loading ? (
              <><span className="spinner" />Generating…</>
            ) : (
              "Generate Explanation"
            )}
          </button>
        )}
        {loaded && (
          <button className="explain-btn outline" onClick={() => { setLoaded(false); setText(""); }}>
            Regenerate
          </button>
        )}
      </div>
      {loading && !text && (
        <div className="explanation-loading">
          <div className="loading-dots"><span /><span /><span /></div>
          <p>Analysing holdings and generating insight…</p>
        </div>
      )}
      {text && <div className="explanation-text">{text}</div>}
      {!text && !loading && (
        <div className="explanation-placeholder">
          Click "Generate Explanation" for an AI-powered narrative analysis of this scheme's risk profile.
        </div>
      )}
    </div>
  );
}

function SchemeCard({ scheme }) {
  const cfg = TYPOLOGY_CONFIG[scheme.typology] || TYPOLOGY_CONFIG["Unrated"];
  return (
    <div className="scheme-card" style={{ borderLeft: `3px solid ${cfg.color}` }}>
      <div className="scheme-card-header">
        <div className="scheme-card-name">{scheme.scheme_name}</div>
        <TypologyBadge typology={scheme.typology} />
      </div>
      <div className="scheme-card-meta">
        {scheme.aum_cr && <span>AUM ₹{fmt(scheme.aum_cr, 0)} Cr</span>}
        {scheme.coverage_pct != null && <span>Coverage {scheme.coverage_pct}%</span>}
      </div>
      <div className="scheme-card-score">
        <span className="score-value" style={{ color: cfg.color }}>
          {fmtScore(scheme.weighted_rf_score)}
        </span>
        <span className="score-label">Red Flag Score</span>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [schemes, setSchemes]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  const [detail, setDetail]           = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch]           = useState("");
  const [sortBy, setSortBy]           = useState("score");

  useEffect(() => {
    fetch(`${API_BASE}/api/schemes`)
      .then((r) => r.json())
      .then((d) => { setSchemes(d.schemes); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSelect = async (scheme) => {
    setSelected(scheme);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/schemes/${scheme.id}`);
      const data = await res.json();
      setDetail(data);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = schemes
    .filter((s) => s.scheme_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "score") return (a.weighted_rf_score ?? 99) - (b.weighted_rf_score ?? 99);
      if (sortBy === "name")  return a.scheme_name.localeCompare(b.scheme_name);
      if (sortBy === "aum")   return (b.aum_cr ?? 0) - (a.aum_cr ?? 0);
      return 0;
    });

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* ── HEADER ── */}
        <header className="header">
          <div className="header-inner">
            <div className="logo">
              <div className="logo-mark">⚑</div>
              <div>
                <div className="logo-title">Red Flag Detector</div>
                <div className="logo-sub">Mutual Fund Accounting Quality Analyser</div>
              </div>
            </div>
          </div>
        </header>

        <div className="main">
          {/* ── LEFT PANEL — scheme list ── */}
          <aside className="sidebar">
            <div className="sidebar-controls">
              <input
                className="search-input"
                placeholder="Search schemes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="sort-row">
                <span className="sort-label">Sort:</span>
                {["score","name","aum"].map((s) => (
                  <button
                    key={s}
                    className={`sort-btn ${sortBy === s ? "active" : ""}`}
                    onClick={() => setSortBy(s)}
                  >
                    {s === "score" ? "Risk" : s === "name" ? "Name" : "AUM"}
                  </button>
                ))}
              </div>
            </div>

            <div className="scheme-list">
              {loading ? (
                <div className="list-loader">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">No schemes match your search.</div>
              ) : (
                filtered.map((s) => (
                  <div
                    key={s.id}
                    className={`scheme-list-item ${selected?.id === s.id ? "active" : ""}`}
                    onClick={() => handleSelect(s)}
                  >
                    <SchemeCard scheme={s} />
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* ── RIGHT PANEL — detail ── */}
          <main className="content">
            {!selected && (
              <div className="welcome">
                <div className="welcome-icon">⚑</div>
                <h2>Select a Mutual Fund Scheme</h2>
                <p>
                  Choose a scheme from the left panel to see its red flag score,
                  constituent breakdown and an AI-generated risk narrative.
                </p>
              </div>
            )}

            {selected && (
              <div className="detail">
                {/* ── Score Summary ── */}
                <div className="detail-header">
                  <div>
                    <h1 className="detail-title">{selected.scheme_name}</h1>
                    {detail?.as_of_date && (
                      <div className="detail-date">Holdings as of {detail.as_of_date}</div>
                    )}
                  </div>
                  {detail?.score && <TypologyBadge typology={detail.score.typology} />}
                </div>

                {detailLoading ? (
                  <div className="detail-loader">
                    <div className="spinner-lg" />
                    <p>Loading scheme analysis…</p>
                  </div>
                ) : detail ? (
                  <>
                    {/* Score Cards */}
                    <div className="score-cards">
                      <div className="score-card primary">
                        <div className="score-card-label">Weighted Red Flag Score</div>
                        <div className="score-card-value">
                          {fmtScore(detail.score.weighted_rf_score)}
                        </div>
                        <ScoreGauge score={detail.score.weighted_rf_score} />
                      </div>
                      <div className="score-card">
                        <div className="score-card-label">Holdings Covered</div>
                        <div className="score-card-value">
                          {detail.score.matched_holdings}
                          <span className="score-card-sub"> / {detail.score.total_holdings}</span>
                        </div>
                        <div className="coverage-bar-wrap">
                          <div className="coverage-bar-track">
                            <div
                              className="coverage-bar-fill"
                              style={{ width: `${detail.score.coverage_pct}%` }}
                            />
                          </div>
                          <span className="coverage-pct">{detail.score.coverage_pct}% by weight</span>
                        </div>
                      </div>
                      <div className="score-card">
                        <div className="score-card-label">Unmatched Holdings</div>
                        <div className="score-card-value" style={{ color: detail.score.unmatched_holdings > 0 ? "#d97706" : "#16a34a" }}>
                          {detail.score.unmatched_holdings}
                        </div>
                        <div className="score-card-hint">
                          {detail.score.unmatched_holdings === 0
                            ? "All holdings mapped"
                            : "Outside coverage universe"}
                        </div>
                      </div>
                      {detail.score.aum_cr && (
                        <div className="score-card">
                          <div className="score-card-label">AUM</div>
                          <div className="score-card-value">₹{fmt(detail.score.aum_cr, 0)}</div>
                          <div className="score-card-hint">Crores</div>
                        </div>
                      )}
                    </div>

                    {/* AI Explanation */}
                    <ExplanationPanel scheme={selected} detail={detail} />

                    {/* Holdings Table */}
                    <div className="holdings-section">
                      <div className="section-title">
                        Matched Holdings
                        <span className="section-count">{detail.matched.length}</span>
                      </div>
                      <div className="table-hint">Click any row to expand flag breakdown · Hover flags for details</div>
                      <div className="table-wrap">
                        <table className="holdings-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Company</th>
                              <th>Weight</th>
                              <th>Red Flags</th>
                              <th>Normalised Score</th>
                              <th>Wtd. Contribution</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {detail.matched.map((h, i) => (
                              <HoldingRow key={h.mf_name + i} h={h} rank={i + 1} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Unmatched Holdings */}
                    {detail.unmatched.length > 0 && (
                      <div className="unmatched-section">
                        <div className="section-title">
                          Unmatched Holdings
                          <span className="section-count warn">{detail.unmatched.length}</span>
                        </div>
                        <div className="unmatched-grid">
                          {detail.unmatched.map((h) => (
                            <div key={h.mf_name} className="unmatched-chip">
                              {h.mf_name}
                              <span className="unmatched-weight">{fmtPct(h.weight_pct)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #f8f9fb;
    --surface:   #ffffff;
    --surface2:  #f4f5f8;
    --border:    #e8eaed;
    --border2:   #d1d5db;
    --text:      #111827;
    --text2:     #4b5563;
    --text3:     #9ca3af;
    --accent:    #1d4ed8;
    --accent-l:  #eff6ff;
    --red:       #dc2626;
    --green:     #16a34a;
    --amber:     #d97706;
    --orange:    #ea580c;
    --radius:    10px;
    --shadow:    0 1px 3px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.05);
    --shadow-md: 0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04);
  }

  body {
    font-family: 'Sora', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  .app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

  /* HEADER */
  .header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    flex-shrink: 0;
    position: relative;
    z-index: 10;
  }
  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 60px;
  }
  .logo { display: flex; align-items: center; gap: 12px; }
  .logo-mark {
    width: 34px; height: 34px;
    background: linear-gradient(135deg, #1d4ed8, #3b82f6);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 16px; font-weight: 700;
  }
  .logo-title { font-size: 16px; font-weight: 700; letter-spacing: -.3px; }
  .logo-sub   { font-size: 11px; color: var(--text3); font-weight: 400; }
  .header-meta { font-size: 12px; color: var(--text3); }

  /* LAYOUT */
  .main { display: flex; flex: 1; overflow: hidden; }

  /* SIDEBAR */
  .sidebar {
    width: 340px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    background: var(--surface);
  }
  .sidebar-controls { padding: 16px; border-bottom: 1px solid var(--border); }
  .search-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border2);
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    background: var(--surface2);
    color: var(--text);
    outline: none;
    transition: border .15s;
  }
  .search-input:focus { border-color: var(--accent); background: white; }
  .sort-row { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
  .sort-label { font-size: 12px; color: var(--text3); }
  .sort-btn {
    padding: 4px 10px;
    border: 1px solid var(--border2);
    border-radius: 6px;
    background: white;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    color: var(--text2);
    transition: all .15s;
  }
  .sort-btn.active { background: var(--accent-l); border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .scheme-list { flex: 1; overflow-y: auto; padding: 8px; }
  .scheme-list-item {
    border-radius: var(--radius);
    margin-bottom: 6px;
    cursor: pointer;
    transition: transform .1s;
  }
  .scheme-list-item:hover { transform: translateX(2px); }
  .scheme-list-item.active .scheme-card { box-shadow: 0 0 0 2px var(--accent); }

  /* SCHEME CARD */
  .scheme-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
    box-shadow: var(--shadow);
    transition: box-shadow .15s;
  }
  .scheme-card:hover { box-shadow: var(--shadow-md); }
  .scheme-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
  .scheme-card-name { font-size: 13px; font-weight: 600; line-height: 1.3; }
  .scheme-card-meta { display: flex; gap: 10px; font-size: 11px; color: var(--text3); margin-bottom: 6px; }
  .scheme-card-score { display: flex; align-items: baseline; gap: 6px; }
  .score-value { font-size: 20px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
  .score-label { font-size: 11px; color: var(--text3); }

  /* TYPOLOGY BADGE */
  .typology-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 20px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* CONTENT */
  .content { flex: 1; overflow-y: auto; padding: 28px; }

  /* WELCOME */
  .welcome { max-width: 560px; margin: 60px auto; text-align: center; }
  .welcome-icon { font-size: 40px; margin-bottom: 16px; opacity: .3; }
  .welcome h2 { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
  .welcome p { color: var(--text2); font-size: 15px; line-height: 1.6; margin-bottom: 32px; }
  .legend-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align: left; }
  .legend-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px;
    border: 1px solid;
    border-radius: var(--radius);
  }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 3px; flex-shrink: 0; }
  .legend-name { font-size: 13px; font-weight: 600; }
  .legend-range { font-size: 11px; color: var(--text3); margin-top: 2px; }

  /* DETAIL */
  .detail { max-width: 960px; }
  .detail-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 20px;
  }
  .detail-title { font-size: 20px; font-weight: 700; letter-spacing: -.3px; margin-bottom: 4px; }
  .detail-date { font-size: 12px; color: var(--text3); }

  /* SCORE CARDS */
  .score-cards { display: grid; grid-template-columns: 2fr 1.2fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .score-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 18px;
    box-shadow: var(--shadow);
  }
  .score-card.primary { border-color: var(--accent); }
  .score-card-label { font-size: 11px; color: var(--text3); font-weight: 500; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
  .score-card-value { font-size: 28px; font-weight: 700; font-family: 'JetBrains Mono', monospace; margin-bottom: 10px; }
  .score-card-sub { font-size: 16px; color: var(--text3); }
  .score-card-hint { font-size: 12px; color: var(--text3); }

  /* SCORE GAUGE */
  .score-gauge { position: relative; }
  .gauge-track {
    height: 8px; border-radius: 4px; background: var(--surface2);
    position: relative; overflow: hidden; margin-bottom: 4px;
  }
  .gauge-fill {
    height: 100%; border-radius: 4px;
    transition: width .6s cubic-bezier(.4,0,.2,1);
    position: relative; z-index: 2;
  }
  .gauge-zones {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    display: flex; z-index: 1;
  }
  .gauge-zones > div { height: 100%; }
  .gauge-labels {
    display: flex; justify-content: space-between;
    font-size: 9px; color: var(--text3); margin-top: 3px;
  }

  /* COVERAGE BAR */
  .coverage-bar-wrap { display: flex; flex-direction: column; gap: 4px; }
  .coverage-bar-track { height: 6px; border-radius: 3px; background: var(--surface2); overflow: hidden; }
  .coverage-bar-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width .5s; }
  .coverage-pct { font-size: 11px; color: var(--text3); }

  /* EXPLANATION */
  .explanation-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: var(--shadow);
  }
  .explanation-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .explanation-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .ai-icon { color: var(--accent); font-size: 16px; }
  .explain-btn {
    padding: 8px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    display: flex; align-items: center; gap: 6px;
    transition: opacity .15s;
  }
  .explain-btn:hover { opacity: .88; }
  .explain-btn:disabled { opacity: .6; cursor: not-allowed; }
  .explain-btn.outline { background: white; color: var(--accent); border: 1px solid var(--accent); }
  .explanation-text { font-size: 14px; line-height: 1.75; color: var(--text2); white-space: pre-wrap; }
  .explanation-placeholder { font-size: 13px; color: var(--text3); text-align: center; padding: 20px; }
  .explanation-loading { text-align: center; padding: 20px; color: var(--text3); }

  .loading-dots { display: flex; justify-content: center; gap: 6px; margin-bottom: 10px; }
  .loading-dots span {
    width: 8px; height: 8px; border-radius: 50%; background: var(--accent);
    animation: bounce 1.2s infinite;
  }
  .loading-dots span:nth-child(2) { animation-delay: .2s; }
  .loading-dots span:nth-child(3) { animation-delay: .4s; }
  @keyframes bounce { 0%,80%,100%{transform:scale(.7);opacity:.4} 40%{transform:scale(1);opacity:1} }

  /* HOLDINGS TABLE */
  .holdings-section, .unmatched-section { margin-bottom: 24px; }
  .section-title {
    font-size: 14px; font-weight: 700; margin-bottom: 4px;
    display: flex; align-items: center; gap: 8px;
  }
  .section-count {
    font-size: 12px; font-weight: 600;
    background: var(--surface2); color: var(--text2);
    padding: 2px 8px; border-radius: 20px;
  }
  .section-count.warn { background: #fef3c7; color: #d97706; }
  .table-hint { font-size: 11px; color: var(--text3); margin-bottom: 10px; }
  .table-wrap { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
  .holdings-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .holdings-table thead tr { background: var(--surface2); }
  .holdings-table th {
    padding: 10px 12px; text-align: left;
    font-size: 11px; font-weight: 600; color: var(--text3);
    text-transform: uppercase; letter-spacing: .5px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .holding-row { border-bottom: 1px solid var(--border); transition: background .1s; }
  .holding-row:hover { background: var(--surface2); }
  .holding-row.expanded { background: #eff6ff; }
  .holding-row td { padding: 10px 12px; vertical-align: middle; }

  .rank-cell { color: var(--text3); font-size: 12px; width: 32px; }
  .name-cell { max-width: 200px; }
  .holding-name { font-weight: 500; }
  .holding-alias { font-size: 11px; color: var(--text3); margin-top: 1px; }
  .weight-cell { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .flags-cell { text-align: center; }
  .flag-count { font-family: 'JetBrains Mono', monospace; font-weight: 700; }
  .flag-num { font-size: 16px; }
  .flag-denom { font-size: 11px; opacity: .6; }
  .no-data { color: var(--text3); }

  .mini-bar-wrap { display: flex; align-items: center; gap: 8px; min-width: 120px; }
  .mini-bar-track { flex: 1; height: 5px; border-radius: 3px; background: var(--surface2); overflow: hidden; }
  .mini-bar-fill { height: 100%; border-radius: 3px; }
  .mini-bar-label { font-family: 'JetBrains Mono', monospace; font-size: 11px; white-space: nowrap; }

  .wc-cell { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text2); }
  .expand-cell { width: 28px; text-align: center; }
  .expand-chevron {
    display: inline-block; font-size: 18px; color: var(--text3);
    transition: transform .2s; transform: rotate(0deg);
  }
  .expand-chevron.up { transform: rotate(90deg); }

  /* DETAIL PANEL (expanded row) */
  .detail-row td { padding: 0; border-bottom: 1px solid var(--border); }
  .detail-panel {
    background: #f8faff;
    border-top: 1px solid #dbeafe;
    padding: 16px 16px 16px 44px;
  }
  .detail-panel-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px; font-size: 12px; font-weight: 600; color: var(--text2);
  }
  .triggered-count { font-size: 11px; color: var(--text3); }

  /* FLAG GRID */
  .flag-grid { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  .flag-group { }
  .flag-group-label { font-size: 10px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 5px; }
  .flag-grid-inner { display: flex; flex-wrap: wrap; gap: 4px; }
  .flag-cell {
    width: 42px; height: 28px;
    border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    cursor: help;
    transition: transform .1s, box-shadow .1s;
  }
  .flag-cell:hover { transform: scale(1.08); box-shadow: 0 2px 6px rgba(0,0,0,.15); }
  .flag-on  { background: #fee2e2; border: 1px solid #fca5a5; }
  .flag-off { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .flag-cell-key { font-size: 9px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
  .flag-on  .flag-cell-key { color: #dc2626; }
  .flag-off .flag-cell-key { color: #16a34a; }

  /* METRICS ROW */
  .metrics-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .metric-pill {
    display: flex; align-items: center; gap: 6px;
    background: white; border: 1px solid var(--border);
    border-radius: 6px; padding: 4px 10px;
    font-size: 12px;
  }
  .metric-pill span { font-size: 10px; color: var(--text3); font-weight: 600; text-transform: uppercase; }

  /* TOOLTIP */
  .tooltip-trigger { position: relative; display: inline-block; }
  .tooltip-box {
    position: fixed;
    z-index: 9999;
    background: #1a1f2e;
    color: white;
    border-radius: 8px;
    padding: 12px 14px;
    width: 260px;
    box-shadow: 0 8px 24px rgba(0,0,0,.25);
    pointer-events: none;
  }
  .tooltip-flag-key { font-size: 10px; font-weight: 700; color: #94a3b8; font-family: 'JetBrains Mono', monospace; margin-bottom: 3px; }
  .tooltip-flag-label { font-size: 13px; font-weight: 600; margin-bottom: 6px; line-height: 1.3; }
  .tooltip-flag-desc { font-size: 12px; color: #cbd5e1; line-height: 1.5; margin-bottom: 8px; }
  .tooltip-flag-status { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; display: inline-block; }
  .tooltip-flag-status.triggered { background: #dc2626; color: white; }
  .tooltip-flag-status.clear     { background: #16a34a; color: white; }

  /* UNMATCHED */
  .unmatched-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .unmatched-chip {
    background: var(--surface2);
    border: 1px solid var(--border2);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    display: flex; align-items: center; gap: 8px;
  }
  .unmatched-weight { font-size: 11px; color: var(--text3); font-family: 'JetBrains Mono', monospace; }

  /* LOADERS */
  .detail-loader { text-align: center; padding: 60px 0; color: var(--text3); }
  .spinner-lg {
    width: 36px; height: 36px;
    border: 3px solid var(--border2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin .8s linear infinite;
    margin: 0 auto 12px;
  }
  .spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .list-loader { padding: 8px; }
  .skeleton-card {
    height: 88px; border-radius: var(--radius);
    background: linear-gradient(90deg, #f0f2f5 25%, #e8eaed 50%, #f0f2f5 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    margin-bottom: 6px;
  }
  @keyframes shimmer { to { background-position: -200% 0; } }

  .empty-state { text-align: center; padding: 40px; color: var(--text3); font-size: 13px; }
  .list-loader { display: flex; flex-direction: column; }

  /* SCROLLBARS */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text3); }
`;
