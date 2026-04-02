import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, BarChart, Bar, Cell, ReferenceLine,
  ScatterChart, Scatter, ZAxis
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const COLORS = ["#00d4ff", "#ff6b35", "#7fff6b", "#ffd700", "#ff4fd8"];
const SECTOR_COLORS = {
  Tech: "#00d4ff", Finance: "#ffd700", Healthcare: "#7fff6b",
  Energy: "#ff6b35", Consumer: "#ff4fd8", ETF: "#aabbcc",
};

function fmt$(n) {
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtPct(n) {
  return (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";
}
function fmtN(n, d = 3) { return Number(n).toFixed(d); }

// ─── Sparkline ────────────────────────────────────────────────────────────────

function SparkLine({ priceSeries, color }) {
  const data = Object.values(priceSeries).map(v => ({ v }));
  return (
    <ResponsiveContainer width={100} height={36}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}


// ─── About / Education Section ────────────────────────────────────────────────

function MetricCard({ icon, color, title, plain, example, formula }) {
  return (
    <div className="metric-card" style={{ borderTopColor: color }}>
      <div className="metric-card-icon" style={{ color }}>{icon}</div>
      <div className="metric-card-title">{title}</div>
      <div className="metric-card-plain">{plain}</div>
      {formula && <div className="metric-card-formula">{formula}</div>}
      {example && <div className="metric-card-example">e.g. {example}</div>}
    </div>
  );
}

function StepCard({ num, color, title, desc, icon }) {
  return (
    <div className="step-card">
      <div className="step-num" style={{ background: color }}>{num}</div>
      <div className="step-icon">{icon}</div>
      <div className="step-title">{title}</div>
      <div className="step-desc">{desc}</div>
    </div>
  );
}

function ChartExplainer({ title, color, icon, desc, points }) {
  return (
    <div className="chart-explainer" style={{ borderLeftColor: color }}>
      <div className="chart-explainer-header">
        <span className="chart-explainer-icon">{icon}</span>
        <span className="chart-explainer-title" style={{ color }}>{title}</span>
      </div>
      <p className="chart-explainer-desc">{desc}</p>
      <ul className="chart-explainer-points">
        {points.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
    </div>
  );
}

function MiniPriceViz() {
  const days = Array.from({ length: 30 }, (_, i) => i);
  const price = [100,102,101,104,103,107,106,108,110,109,112,111,115,113,116,118,117,120,119,122,121,124,123,126,125,128,127,130,129,132];
  const ma7   = days.map((_, i) => i < 6 ? null : price.slice(i-6, i+1).reduce((a,b) => a+b,0)/7);
  const ma30  = days.map((_, i) => i < 29 ? null : price.reduce((a,b) => a+b,0)/30);
  const w = 300, h = 100, minP = 98, maxP = 134;
  const px = i => (i / 29) * (w - 20) + 10;
  const py = v => h - 10 - ((v - minP) / (maxP - minP)) * (h - 20);
  const priceD = price.map((v,i) => `${i===0?"M":"L"}${px(i)},${py(v)}`).join(" ");
  const ma7D   = ma7.map((v,i) => v===null ? "" : `${ma7.slice(0,i).every(x=>x===null)?"M":"L"}${px(i)},${py(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mini-viz" aria-label="Price chart example">
      <path d={priceD} stroke="#00d4ff" strokeWidth="2" fill="none" />
      <path d={ma7D}   stroke="#ffd700" strokeWidth="1.5" fill="none" strokeDasharray="4 2" />
      <text x="10" y="12" fill="#5a7090" fontSize="8">Price</text>
      <text x="80" y="12" fill="#ffd700" fontSize="8">MA7 (fast)</text>
      <circle cx={px(8)} cy={py(110)} r="4" fill="#2a9d6e" />
      <text x={px(8)-2} y={py(110)-8} fill="#2a9d6e" fontSize="7">BUY</text>
    </svg>
  );
}

function MiniDrawdownViz() {
  const vals = [0,-1,-3,-8,-15,-9,-4,-2,-5,-3,-1,0,0,-2,-6,-12,-17,-10,-5,-2,-1,0,0,-3,-7,-11,-8,-4,-2,0];
  const w = 300, h = 80;
  const px = i => (i/29)*(w-20)+10;
  const py = v => 10 + (v / -17) * (h - 20);
  const d = vals.map((v,i) => `${i===0?"M":"L"}${px(i)},${py(v)}`).join(" ");
  const fillD = d + ` L${px(29)},${py(0)} L${px(0)},${py(0)} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mini-viz" aria-label="Drawdown chart example">
      <path d={fillD} fill="#e05252" fillOpacity="0.2" />
      <path d={d} stroke="#e05252" strokeWidth="1.5" fill="none" />
      <line x1="10" y1={py(0)} x2={w-10} y2={py(0)} stroke="#5a7090" strokeWidth="0.5" strokeDasharray="3 3" />
      <text x="12" y={py(-17)+12} fill="#e05252" fontSize="7">Max Drawdown</text>
    </svg>
  );
}

function MiniFanViz() {
  const w = 300, h = 90;
  const days = Array.from({length:20},(_,i)=>i);
  const p50 = days.map(d => 1000 + d*30);
  const p5  = days.map(d => 1000 + d*8 - d*d*0.3);
  const p95 = days.map(d => 1000 + d*60 - d*d*0.5);
  const minV = 900, maxV = 2100;
  const px = i => (i/19)*(w-20)+10;
  const py = v => h-10 - ((v-minV)/(maxV-minV))*(h-20);
  const path = arr => arr.map((v,i)=>`${i===0?"M":"L"}${px(i)},${py(v)}`).join(" ");
  const fill = `${path(p95)} ${[...days].reverse().map(i=>`L${px(i)},${py(p5[i])}`).join(" ")} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mini-viz" aria-label="Fan chart example">
      <path d={fill} fill="#1a4d7a" fillOpacity="0.3" />
      <path d={path(p95)} stroke="#2a9d6e" strokeWidth="1" fill="none" strokeDasharray="3 2" />
      <path d={path(p50)} stroke="#00d4ff" strokeWidth="2" fill="none" />
      <path d={path(p5)}  stroke="#e05252" strokeWidth="1" fill="none" strokeDasharray="3 2" />
      <line x1="10" y1={py(1000)} x2={w-10} y2={py(1000)} stroke="#ffffff" strokeWidth="0.5" strokeDasharray="3 3" strokeOpacity="0.3" />
      <text x="12" y={py(p95[19])-4} fill="#2a9d6e" fontSize="7">Best</text>
      <text x="12" y={py(p50[19])-4} fill="#00d4ff" fontSize="7">Median</text>
      <text x="12" y={py(p5[19])+10}  fill="#e05252" fontSize="7">Worst</text>
    </svg>
  );
}

// ─── Screener ─────────────────────────────────────────────────────────────────

function Screener({ stocks, sectors, onSelectStock, compareList, onToggleCompare, portfolio, loading, onSearchFetch, extraStocks }) {
  const [activeSector, setActiveSector] = useState("All");
  const [sortKey, setSortKey]           = useState("bnh_return");
  const [sortDir, setSortDir]           = useState(-1);
  const [query, setQuery]               = useState("");
  const [searching, setSearching]       = useState(false);
  const [searchError, setSearchError]   = useState(null);
  const [suggestions, setSuggestions]   = useState([]); // company name search results
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef  = React.useRef(null);
  const searchRef    = React.useRef(null);

  // Close suggestions when clicking outside
  React.useEffect(() => {
    function handleClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Merge curated + searched stocks, deduplicated
  const allStocks = [...stocks];
  extraStocks.forEach(s => {
    if (!allStocks.find(x => x.ticker === s.ticker)) allStocks.push(s);
  });

  const queryUpper    = query.trim().toUpperCase();
  const alreadyInList = queryUpper && allStocks.some(s => s.ticker === queryUpper);

  const filtered = allStocks
    .filter(s => {
      const sectorMatch = activeSector === "All" || s.sector === activeSector;
      const searchMatch = !query.trim() ||
        s.ticker.includes(queryUpper) ||
        (s.name || "").toLowerCase().includes(query.trim().toLowerCase());
      return sectorMatch && searchMatch;
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDir * (bv - av);
    });

function handleQueryChange(val) {
    setQuery(val);
    setSearchError(null);
    setSuggestions([]);
    setShowSuggestions(false);
    clearTimeout(debounceRef.current);

    const trimmed = val.trim();
    if (!trimmed) return;

    const upper  = trimmed.toUpperCase();
    const inList = allStocks.some(s => s.ticker === upper);
    if (inList) return;

    debounceRef.current = setTimeout(() => runSearch(trimmed, upper), 600);
  }

  async function runSearch(trimmed, upper) {
    setSearching(true);
    setSearchError(null);

    // Step 1: always try direct ticker fetch first
    let tickerOk = false;
    try {
      await onSearchFetch(upper);
      setActiveSector("All");
      tickerOk = true;
    } catch {
      // not a valid ticker — fall through to name search
    }

    if (tickerOk) {
      setSearching(false);
      return;
    }

    // Step 2: name/company search
    try {
      const res     = await axios.get(`${API}/api/search?q=${encodeURIComponent(trimmed)}`);
      const results = res.data.results || [];
      if (results.length === 0) {
        setSearchError("Not a recognised ticker or company name. Try again.");
      } else {
        setSuggestions(results);
        setShowSuggestions(true);
      }
    } catch {
      setSearchError("Not a recognised ticker or company name. Try again.");
    }

    setSearching(false);
  }

  async function handleSelectSuggestion(ticker) {
    setShowSuggestions(false);
    setSuggestions([]);
    setQuery(ticker);
    setSearching(true);
    try {
      await onSearchFetch(ticker);
      setActiveSector("All");
    } catch (e) {
      setSearchError(`Could not load data for ${ticker}.`);
    } finally {
      setSearching(false);
    }
  }

  function SortTh({ label, k }) {
    const active = sortKey === k;
    return (
      <th className={`sortable ${active ? "active" : ""}`} onClick={() => {
        if (sortKey === k) setSortDir(d => -d);
        else { setSortKey(k); setSortDir(-1); }
      }}>
        {label}
        <span className="sort-arrow">{active ? (sortDir === -1 ? " ↓" : " ↑") : " ↕"}</span>
      </th>
    );
  }

  return (
    <div className="screener">
      {/* Search */}
      <div className="search-row" ref={searchRef}>
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Search by ticker or company name… (e.g. INTC, Intel, Apple Inc)"
          />
          {searching && (
            <span className="search-fetching">
              <span className="spinner-small" /> Looking up…
            </span>
          )}
          {query && !searching && (
            <button className="search-clear" onClick={() => {
              setQuery(""); setSearchError(null); setSuggestions([]);
              setShowSuggestions(false); clearTimeout(debounceRef.current);
            }}>✕</button>
          )}

          {/* Company name suggestion dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="search-suggestions">
              <div className="suggestions-header">
                Select a stock to load its profile
              </div>
              {suggestions.map(s => (
                <button
                  key={s.ticker}
                  className={`suggestion-item ${s.private ? "suggestion-private" : ""}`}
                  onClick={() => !s.private && handleSelectSuggestion(s.ticker)}
                  disabled={s.private}
                  title={s.private ? "Privately traded — no public price data available" : `Load ${s.ticker}`}>
                  <span className="suggestion-ticker">{s.ticker}</span>
                  <span className="suggestion-name">{s.name}</span>
                  <span className="suggestion-exchange">{s.exchange}</span>
                  <div className="suggestion-right">
                    <span className={`suggestion-type type-${(s.type || "equity").toLowerCase()}`}>
                      {s.type}
                    </span>
                    {s.private && (
                      <span className="suggestion-private-badge">Private — no data</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {searchError && <span className="search-error">{searchError}</span>}
      </div>

      {/* Sector filters */}
      <div className="sector-filters">
        {["All", ...sectors].map(s => (
          <button key={s}
            className={`sector-btn ${activeSector === s ? "active" : ""}`}
            style={activeSector === s && s !== "All" ? { borderColor: SECTOR_COLORS[s], color: SECTOR_COLORS[s] } : {}}
            onClick={() => setActiveSector(s)}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="screener-loading">
          <div className="loading-spinner" />
          <p>Fetching 1-year data for all stocks…</p>
          <p className="loading-sub">This takes about 20 seconds on first load</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="screener-table">
            <thead>
              <tr>
                <th>Stock</th>
                <th>Sector</th>
                <th>Price</th>
                <SortTh label="1yr Return"    k="bnh_return" />
                <SortTh label="30d Momentum"  k="momentum_30d" />
                <SortTh label="Volatility"    k="volatility" />
                <SortTh label="Max Drawdown"  k="max_drawdown" />
                <SortTh label="Sharpe"        k="sharpe" />
                <th>Trend</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="no-results">No stocks match your search.</td></tr>
              ) : filtered.map(s => {
                const inPortfolio = s.ticker in portfolio;
                const inCompare   = compareList.includes(s.ticker);
                const sColor      = SECTOR_COLORS[s.sector] || "#aabbcc";
                return (
                  <tr key={s.ticker}
                    className={`clickable-row ${inPortfolio ? "row-in-portfolio" : ""}`}
                    onClick={() => onSelectStock(s.ticker)}>
                    <td>
                      <div className="stock-name-cell">
                        <span className="ticker-badge" style={{ color: sColor }}>{s.ticker}</span>
                        <span className="company-name">{s.name || ""}</span>
                      </div>
                    </td>
                    <td><span className="sector-tag-small" style={{ color: sColor }}>{s.sector || "Custom"}</span></td>
                    <td className="mono">${s.current_price}</td>
                    <td className={`mono bold ${s.bnh_return >= 0 ? "pos" : "neg"}`}>{fmtPct(s.bnh_return)}</td>
                    <td className={`mono ${(s.momentum_30d ?? 0) >= 0 ? "pos" : "neg"}`}>
                      {s.momentum_30d != null ? fmtPct(s.momentum_30d) : "—"}
                    </td>
                    <td className="mono">{fmtN(s.volatility, 1)}%</td>
                    <td className="mono neg">{fmtN(s.max_drawdown, 1)}%</td>
                    <td className="mono">{s.sharpe ?? "—"}</td>
                    <td>
                      <SparkLine priceSeries={s.price_series}
                        color={s.bnh_return >= 0 ? "#2a9d6e" : "#e05252"} />
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="action-btns">
                        <button className="btn-profile" onClick={() => onSelectStock(s.ticker)}>Profile</button>
                        <button
                          className={`btn-compare ${inCompare ? "active" : ""}`}
                          onClick={() => onToggleCompare(s.ticker)}
                          disabled={!inCompare && compareList.length >= 3}>
                          {inCompare ? "✓ Cmp" : "Compare"}
                        </button>
                        <button
                          className={`btn-add ${inPortfolio ? "added" : ""}`}
                          onClick={() => !inPortfolio && onSelectStock(s.ticker, true)}>
                          {inPortfolio ? "✓ Added" : "+ Add"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Stock Modal ──────────────────────────────────────────────────────────────

function StockModal({ ticker, name, sector, onClose, onAdd, inPortfolio }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true); setData(null); setError(null);
    axios.get(`${API}/api/stock/${ticker}`)
      .then(r => setData(r.data.stock))
      .catch(() => setError("Failed to load stock data."))
      .finally(() => setLoading(false));
  }, [ticker]);

  const sColor    = SECTOR_COLORS[sector] || "#aabbcc";
  const priceData = data ? Object.entries(data.price_series).map(([date, val]) => ({
    date: date.slice(5), price: val,
    ma7:  data.ma7_series?.[date]  ?? null,
    ma30: data.ma30_series?.[date] ?? null,
  })) : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="modal-ticker" style={{ color: sColor }}>{ticker}</span>
            <span className="modal-name">{name}</span>
            {sector && <span className="modal-sector" style={{ color: sColor }}>{sector}</span>}
          </div>
          <div className="modal-header-actions">
            {!inPortfolio
              ? <button className="btn-add-modal" onClick={() => onAdd(ticker)}>+ Add to Portfolio</button>
              : <span className="already-added">✓ In Portfolio</span>}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {loading && <div className="modal-loading"><div className="loading-spinner" /><p>Loading full profile…</p></div>}
        {error   && <div className="modal-error">{error}</div>}

        {data && (
          <div className="modal-body">
            <div className="modal-stats">
              {[
                { label: "Strategy Return",  value: fmtPct(data.strategy_return),  accent: data.strategy_return  >= 0 ? "#2a9d6e" : "#e05252" },
                { label: "Buy & Hold",       value: fmtPct(data.benchmark_return), accent: data.benchmark_return >= 0 ? "#2a9d6e" : "#e05252" },
                { label: "Alpha vs B&H",     value: fmtPct(data.alpha),            accent: data.alpha            >= 0 ? "#2a9d6e" : "#e05252" },
                { label: "Sharpe Ratio",     value: data.sharpe  ?? "—" },
                { label: "Sortino Ratio",    value: data.sortino ?? "—" },
                { label: "Win Rate",         value: data.win_rate != null ? data.win_rate.toFixed(1) + "%" : "—" },
                { label: "Volatility",       value: fmtN(data.volatility, 1) + "%" },
                { label: "Max Drawdown",     value: fmtN(data.max_drawdown, 1) + "%", accent: "#e05252" },
              ].map(({ label, value, accent }) => (
                <div key={label} className="modal-stat">
                  <span className="modal-stat-label">{label}</span>
                  <strong className="modal-stat-value" style={accent ? { color: accent } : {}}>{value}</strong>
                </div>
              ))}
            </div>

            <div className="modal-chart-title">Price & Moving Averages — 1 Year</div>
            <div className="modal-chart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={priceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
                  <XAxis dataKey="date" tick={{ fill: "#5a7090", fontSize: 10 }} interval={20} />
                  <YAxis tick={{ fill: "#5a7090", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#0d1421", border: "1px solid #1e2d45", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="price" stroke={sColor} strokeWidth={2} dot={false} name="Price" />
                  <Line type="monotone" dataKey="ma7"   stroke={sColor} strokeWidth={1} dot={false} strokeDasharray="4 2" opacity={0.6} name="MA7" />
                  <Line type="monotone" dataKey="ma30"  stroke={sColor} strokeWidth={1} dot={false} strokeDasharray="1 3" opacity={0.4} name="MA30" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="modal-chart-title">Drawdown</div>
            <div className="modal-chart">
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={Object.entries(data.drawdown_series).map(([d, v]) => ({ date: d.slice(5), drawdown: v }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
                  <XAxis dataKey="date" tick={{ fill: "#5a7090", fontSize: 9 }} interval={20} />
                  <YAxis tick={{ fill: "#5a7090", fontSize: 9 }} />
                  <Tooltip contentStyle={{ background: "#0d1421", border: "1px solid #1e2d45", borderRadius: 8 }}
                    formatter={v => [v.toFixed(2) + "%", "Drawdown"]} />
                  <Area type="monotone" dataKey="drawdown" stroke="#e05252" fill="#e05252" fillOpacity={0.2} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="modal-trade-row">
              <span>Signals: <strong>{data.num_signals}</strong></span>
              <span>Trades: <strong>{data.completed_trades}</strong></span>
              <span>Invested days: <strong>{data.invested_days}</strong></span>
              <span>Final: <strong className={data.final_balance >= data.allocated ? "pos" : "neg"}>{fmt$(data.final_balance)}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Compare Panel ────────────────────────────────────────────────────────────

function ComparePanel({ compareList, allStocks, onClear }) {
  if (compareList.length < 2) return null;
  const stocks = compareList.map(t => allStocks.find(s => s.ticker === t)).filter(Boolean);

  const metrics = [
    { label: "1yr Return",    key: "bnh_return",    fmt: v => fmtPct(v) },
    { label: "30d Momentum",  key: "momentum_30d",  fmt: v => v != null ? fmtPct(v) : "—" },
    { label: "Volatility",    key: "volatility",    fmt: v => fmtN(v, 1) + "%" },
    { label: "Max Drawdown",  key: "max_drawdown",  fmt: v => fmtN(v, 1) + "%" },
    { label: "Sharpe",        key: "sharpe",        fmt: v => v ?? "—" },
    { label: "Price",         key: "current_price", fmt: v => fmt$(v) },
  ];

  function isBest(key, val) {
    const vals = stocks.map(s => s[key]).filter(v => v != null);
    if (key === "volatility" || key === "max_drawdown") return val === Math.min(...vals);
    return val === Math.max(...vals);
  }

  return (
    <div className="compare-panel">
      <div className="compare-header">
        <span>Comparing {compareList.length} stocks</span>
        <button onClick={onClear} className="compare-clear">Clear</button>
      </div>
      <div className="compare-grid" style={{ gridTemplateColumns: `140px repeat(${stocks.length}, 1fr)` }}>
        <div className="compare-cell label-cell" />
        {stocks.map((s, i) => (
          <div key={s.ticker} className="compare-cell stock-header-cell">
            <span style={{ color: COLORS[i % COLORS.length], fontWeight: 700 }}>{s.ticker}</span>
            <span className="compare-stock-name">{s.name}</span>
          </div>
        ))}
        {metrics.map(m => (
          <>
            <div key={m.label} className="compare-cell label-cell">{m.label}</div>
            {stocks.map((s, i) => {
              const val  = s[m.key];
              const best = isBest(m.key, val);
              return (
                <div key={s.ticker} className={`compare-cell value-cell ${best ? "best" : ""}`}
                  style={best ? { color: COLORS[i % COLORS.length] } : {}}>
                  {m.fmt(val)}
                </div>
              );
            })}
          </>
        ))}
        <div className="compare-cell label-cell">Trend</div>
        {stocks.map((s, i) => (
          <div key={s.ticker} className="compare-cell">
            <SparkLine priceSeries={s.price_series} color={COLORS[i % COLORS.length]} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Efficient Frontier Chart ─────────────────────────────────────────────────

function FrontierChart({ frontier, maxSharpe, minVol }) {
  const data    = frontier.map(p => ({ vol: p.vol, ret: p.ret, sharpe: p.sharpe }));
  const special = [
    { vol: maxSharpe.volatility, ret: maxSharpe.return, label: "Max Sharpe" },
    { vol: minVol.volatility,    ret: minVol.return,    label: "Min Vol" },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
        <XAxis dataKey="vol" name="Volatility" type="number" domain={["auto","auto"]}
          tick={{ fill: "#5a7090", fontSize: 9 }}
          label={{ value: "Volatility %", fill: "#5a7090", fontSize: 10, position: "insideBottom", offset: -10 }} />
        <YAxis dataKey="ret" name="Return" type="number" domain={["auto","auto"]}
          tick={{ fill: "#5a7090", fontSize: 9 }}
          label={{ value: "Return %", fill: "#5a7090", fontSize: 10, angle: -90, position: "insideLeft" }} />
        <ZAxis range={[30, 30]} />
        <Tooltip
          contentStyle={{ background: "#0d1421", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 11 }}
          formatter={(v, name) => [fmtN(v, 1) + "%", name]}
          cursor={{ strokeDasharray: "3 3" }}
        />
        <Scatter name="Frontier" data={data} fill="#1a4d7a" opacity={0.7} />
        <Scatter name="Key Points" data={special} fill="#00d4ff" shape="star" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ─── Portfolio Builder ────────────────────────────────────────────────────────

function PortfolioBuilder({ portfolio, onUpdateAlloc, onRemove, onEqualSplit, onOptimise, onApplyOptimal, optimiserData, onSetOptimiserData, onRun, cash, onCashChange, horizon, onHorizonChange }) {
  const tickers    = Object.keys(portfolio);
  const totalAlloc = Object.values(portfolio).reduce((s, v) => s + (parseFloat(v.alloc) || 0), 0);
  const allPositive = Object.values(portfolio).every(v => (parseFloat(v.alloc) || 0) > 0);
  const allocValid = Math.abs(totalAlloc - 100) < 0.01 && allPositive;
  const optimData  = optimiserData;
  const setOptimData = onSetOptimiserData;
  const [optimLoading, setOptimLoading] = useState(false);
  const [optimError, setOptimError] = useState(null);
  const [showFrontier, setShowFrontier] = useState(false);

  const allocRef = React.useRef(null);
  const prevTickerCount = React.useRef(tickers.length);
  React.useEffect(() => {
    if (tickers.length !== prevTickerCount.current) {
      setOptimData(null);
      setOptimError(null);
      prevTickerCount.current = tickers.length;
    }
  }, [tickers.length]);

  async function handleOptimise() {
    setOptimLoading(true);
    setOptimError(null);
    setOptimData(null);
    try {
      const res = await onOptimise(tickers);
      setOptimData(res);
    } catch (e) {
      setOptimError(e.message || "Optimisation failed.");
    } finally {
      setOptimLoading(false);
    }
  }

  function handleApply(weights) {
    onApplyOptimal(weights);
    // Scroll the allocation inputs into view after a short delay
    setTimeout(() => {
      allocRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  if (tickers.length === 0) return (
    <div className="portfolio-builder empty">
      <div className="pb-empty-msg">
        <div className="pb-empty-icon">+</div>
        <p>Add stocks from the screener to build your portfolio</p>
      </div>
    </div>
  );

  const optStrategies = optimData ? [
    {
      key: "max_sharpe",
      label: "Max Sharpe",
      desc: "Best risk-adjusted return",
      color: "#00d4ff",
      data: optimData.max_sharpe,
    },
    {
      key: "min_volatility",
      label: "Min Volatility",
      desc: "Lowest possible risk",
      color: "#7fff6b",
      data: optimData.min_volatility,
    },
    {
      key: "equal_weight",
      label: "Equal Weight",
      desc: "Baseline 1/n split",
      color: "#ffd700",
      data: optimData.equal_weight,
    },
  ] : [];

  return (
    <div className="portfolio-builder">
      <div className="pb-header">
        <span className="pb-title">Portfolio Builder</span>
        <span className={`alloc-total ${allocValid ? "valid" : "invalid"}`}>
          {totalAlloc.toFixed(1)}% / 100%
        </span>
      </div>

      {/* Quick allocation buttons */}
      <div className="pb-alloc-btns">
        <button className="btn-equal-split" onClick={onEqualSplit}>
          Equal Split
        </button>
        <button
          className={`btn-optimise ${optimLoading ? "loading" : ""}`}
          onClick={handleOptimise}
          disabled={optimLoading || tickers.length < 2}
          title={tickers.length < 2 ? "Add at least 2 stocks to optimise" : "Find optimal allocations using Markowitz theory"}>
          {optimLoading ? <><span className="spinner-small" /> Optimising…</> : "Optimise"}
        </button>
      </div>

      {optimError && <div className="optim-error">{optimError}</div>}

      {/* Optimal portfolio cards */}
      {optimData && (
        <div className="optim-results">
          <div className="optim-header">
            <span className="optim-title">Optimal Portfolios</span>
            <button className="optim-frontier-toggle" onClick={() => setShowFrontier(v => !v)}>
              {showFrontier ? "Hide" : "Show"} frontier
            </button>
          </div>

          {showFrontier && optimData.frontier?.length > 0 && (
            <div className="optim-frontier-chart">
              <FrontierChart
                frontier={optimData.frontier}
                maxSharpe={optimData.max_sharpe}
                minVol={optimData.min_volatility}
              />
            </div>
          )}

          {optStrategies.map(({ key, label, desc, color, data }) => (
            <div key={key} className="optim-card" style={{ borderLeftColor: color }}>
              <div className="optim-card-header">
                <div>
                  <span className="optim-card-label" style={{ color }}>{label}</span>
                  <span className="optim-card-desc">{desc}</span>
                </div>
                <button className="btn-apply-optim" onClick={() => handleApply(data.weights)}>
                  Apply
                </button>
              </div>
              <div className="optim-card-stats">
                <span>Return <strong>{fmtPct(data.return)}</strong></span>
                <span>Vol <strong>{fmtN(data.volatility, 1)}%</strong></span>
                <span>Sharpe <strong>{data.sharpe}</strong></span>
              </div>
              <div className="optim-card-weights">
                {Object.entries(data.weights).map(([t, w], i) => (
                  <div key={t} className="optim-weight-bar-wrap">
                    <span className="optim-weight-ticker" style={{ color: COLORS[i % COLORS.length] }}>{t}</span>
                    <div className="optim-weight-bar-bg">
                      <div className="optim-weight-bar-fill"
                        style={{ width: `${w}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                    <span className="optim-weight-pct">{w}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stock rows */}
      <div className="pb-stocks" ref={allocRef}>
        {tickers.map((t, i) => (
          <div key={t} className="pb-stock">
            <span className="pb-ticker" style={{ color: COLORS[i % COLORS.length] }}>{t}</span>
            <input
              type="number"
              value={portfolio[t].alloc}
              onChange={e => onUpdateAlloc(t, e.target.value)}
              placeholder="0"
              className="pb-alloc-input"
            />
            <span className="pb-pct">%</span>
            <button className="pb-remove" onClick={() => { onRemove(t); setOptimData(null); setOptimError(null); }}>✕</button>
          </div>
        ))}
      </div>

      <div className="pb-settings">
        <div className="pb-setting">
          <label>Capital ($)</label>
          <input type="number" value={cash} onChange={e => onCashChange(e.target.value)} />
        </div>
        <div className="pb-setting">
          <label>Horizon (trading days)
            <span className="pb-setting-hint"> — backtest &amp; simulation</span>
          </label>
          <input type="number" value={horizon} onChange={e => onHorizonChange(e.target.value)}
            min="63" max="1260" placeholder="252" />
        </div>
      </div>

      <button className={`run-btn ${!allocValid ? "disabled" : ""}`} disabled={!allocValid} onClick={onRun}>
        Run Full Analysis
      </button>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : {}}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, tag }) {
  return (
    <div className="section-header">
      <span className="section-tag">{tag}</span>
      <h2>{title}</h2>
    </div>
  );
}

// ─── Results Charts ───────────────────────────────────────────────────────────

function AssetCard({ asset, color }) {
  return (
    <div className="asset-card" style={{ borderTopColor: color }}>
      <div className="asset-header">
        <span className="asset-ticker" style={{ color }}>{asset.ticker}</span>
        <span className={`asset-return ${asset.strategy_return >= 0 ? "pos" : "neg"}`}>{fmtPct(asset.strategy_return)}</span>
      </div>
      <div className="asset-stats">
        {[
          ["Sharpe",       asset.sharpe ?? "—"],
          ["Sortino",      asset.sortino ?? "—"],
          ["Win Rate",     asset.win_rate != null ? asset.win_rate.toFixed(1) + "%" : "—"],
          ["B&H Return",   fmtPct(asset.benchmark_return)],
          ["Alpha",        fmtPct(asset.alpha)],
          ["Volatility",   fmtN(asset.volatility, 1) + "%"],
          ["Max Drawdown", fmtN(asset.max_drawdown, 1) + "%"],
          ["Trades",       asset.completed_trades],
        ].map(([l, v]) => (
          <div key={l} className="asset-stat">
            <span>{l}</span><strong>{v}</strong>
          </div>
        ))}
      </div>
      <div className="asset-footer">
        <span>{fmt$(asset.allocated)}</span>
        <span className="arrow">→</span>
        <span className={asset.final_balance >= asset.allocated ? "pos" : "neg"}>{fmt$(asset.final_balance)}</span>
      </div>
    </div>
  );
}

function PriceChart({ assets }) {
  const dateSet = new Set();
  assets.forEach(a => Object.keys(a.price_series).forEach(d => dateSet.add(d)));
  const data = [...dateSet].sort().map(date => {
    const row = { date: date.slice(5) };
    assets.forEach(a => { if (a.price_series[date]) row[a.ticker] = a.price_series[date]; });
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
        <XAxis dataKey="date" tick={{ fill: "#5a7090", fontSize: 10 }} interval={30} />
        <YAxis tick={{ fill: "#5a7090", fontSize: 10 }} />
        <Tooltip contentStyle={{ background: "#0d1421", border: "1px solid #1e2d45", borderRadius: 8 }} />
        {assets.map((a, i) => (
          <Line key={a.ticker} type="monotone" dataKey={a.ticker}
            stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} name={a.ticker} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function FanChart({ fanChart, startingCapital }) {
  const data = fanChart.days.map((d, i) => ({
    day: d, p5: fanChart.p5[i], p25: fanChart.p25[i],
    p50: fanChart.p50[i], p75: fanChart.p75[i], p95: fanChart.p95[i],
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
        <XAxis dataKey="day" tick={{ fill: "#5a7090", fontSize: 10 }} />
        <YAxis tick={{ fill: "#5a7090", fontSize: 10 }} tickFormatter={v => "$" + (v / 1000).toFixed(1) + "k"} />
        <Tooltip contentStyle={{ background: "#0d1421", border: "1px solid #1e2d45", borderRadius: 8 }}
          formatter={(v, name) => {
            const labels = { p5: "5th %ile", p25: "25th", p50: "Median", p75: "75th", p95: "95th %ile" };
            return [fmt$(v), labels[name] || name];
          }} />
        <ReferenceLine y={startingCapital} stroke="#ffffff" strokeDasharray="4 2" strokeOpacity={0.3} />
        <Area type="monotone" dataKey="p95" stroke="#2a9d6e" fill="#2a9d6e" fillOpacity={0.08} strokeWidth={1.5} strokeDasharray="4 2" />
        <Area type="monotone" dataKey="p75" stroke="#2a9d6e" fill="#2a9d6e" fillOpacity={0.12} strokeWidth={0} />
        <Area type="monotone" dataKey="p50" stroke="#00d4ff" fill="#00d4ff" fillOpacity={0}  strokeWidth={2.5} />
        <Area type="monotone" dataKey="p25" stroke="#2a9d6e" fill="#0d1421" fillOpacity={1}  strokeWidth={0} />
        <Area type="monotone" dataKey="p5"  stroke="#e05252" fill="#0d1421" fillOpacity={1}  strokeWidth={1.5} strokeDasharray="4 2" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function HistogramChart({ histogram, startingCapital }) {
  const data = histogram.counts.map((count, i) => ({
    bucket: fmt$(histogram.edges[i]), count,
    isLoss: histogram.edges[i] < startingCapital,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fill: "#5a7090", fontSize: 9 }} interval={4} angle={-35} textAnchor="end" />
        <YAxis tick={{ fill: "#5a7090", fontSize: 10 }} />
        <Tooltip contentStyle={{ background: "#0d1421", border: "1px solid #1e2d45", borderRadius: 8 }}
          formatter={v => [v + " simulations", "Count"]} />
        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.isLoss ? "#7a2a2a" : "#1a4d7a"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CorrelationMatrix({ correlation }) {
  const tickers = Object.keys(correlation);
  const vals = tickers.map(r => tickers.map(c => correlation[r][c]));
  function cellColor(v) {
    if (v >= 0.9) return "#0a3d2e";
    if (v >= 0.7) return "#0d5c3c";
    if (v >= 0.4) return "#1a7a50";
    if (v >= 0.0) return "#2a9d6e";
    return "#7a2a2a";
  }
  return (
    <div className="corr-grid" style={{ gridTemplateColumns: `repeat(${tickers.length + 1}, 1fr)` }}>
      <div className="corr-cell header" />
      {tickers.map(t => <div key={t} className="corr-cell header">{t}</div>)}
      {tickers.map((row, i) => (
        <>
          <div key={row} className="corr-cell header">{row}</div>
          {tickers.map((col, j) => (
            <div key={col} className="corr-cell value" style={{ background: cellColor(vals[i][j]) }}>
              {vals[i][j].toFixed(2)}
            </div>
          ))}
        </>
      ))}
    </div>
  );
}

// ─── Results Dashboard ────────────────────────────────────────────────────────

function ResultsDashboard({ results, onBack }) {
  return (
    <div className="results-dashboard">
      <div className="results-back">
        <button onClick={onBack} className="back-btn">Back to Screener</button>
      </div>

      <section className="results-section">
        <SectionHeader title="Portfolio Summary" tag="01" />
        <div className="stats-row">
          <StatCard label="Final Value"      value={fmt$(results.meta.final_balance)}
            sub={`From ${fmt$(results.meta.allocated_total)}`}
            accent={results.meta.profit_dollars >= 0 ? "#2a9d6e" : "#e05252"} />
          <StatCard label="Total Return"     value={fmtPct(results.meta.profit_pct)}
            sub={fmt$(results.meta.profit_dollars)}
            accent={results.meta.profit_dollars >= 0 ? "#2a9d6e" : "#e05252"} />
          <StatCard label="Portfolio Sharpe" value={fmtN(results.portfolio.sharpe)} sub="Risk-adjusted" />
          <StatCard label="Volatility"       value={fmtN(results.portfolio.volatility, 1) + "%"} sub="Annual" />
          <StatCard label="Max Drawdown"     value={fmtN(results.portfolio.max_drawdown, 1) + "%"} accent="#e05252" />
          <StatCard label="Avg Correlation"  value={fmtN(results.portfolio.avg_correlation, 2)}
            sub={results.portfolio.diversification} />
        </div>
      </section>

      <section className="results-section">
        <SectionHeader title="Price History" tag="02" />
        <div className="chart-card"><PriceChart assets={results.assets} /></div>
      </section>

      <section className="results-section">
        <SectionHeader title="Per-Asset Metrics" tag="03" />
        <div className="asset-grid">
          {results.assets.map((a, i) => <AssetCard key={a.ticker} asset={a} color={COLORS[i % COLORS.length]} />)}
        </div>
      </section>

      {results.portfolio.correlation && (
        <section className="results-section two-col">
          <div>
            <SectionHeader title="Portfolio Drawdown" tag="04" />
            <div className="chart-card">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={Object.entries(results.portfolio.drawdown_series).map(([d, v]) => ({ date: d.slice(5), drawdown: v }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
                  <XAxis dataKey="date" tick={{ fill: "#5a7090", fontSize: 10 }} interval={30} />
                  <YAxis tick={{ fill: "#5a7090", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#0d1421", border: "1px solid #1e2d45", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="drawdown" stroke="#e05252" fill="#e05252" fillOpacity={0.25} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <SectionHeader title="Correlation Matrix" tag="05" />
            <div className="chart-card">
              <CorrelationMatrix correlation={results.portfolio.correlation} />
              <p className="corr-note">
                Avg: <strong>{results.portfolio.avg_correlation}</strong>
                &nbsp;·&nbsp; {results.portfolio.diversification}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="results-section">
        <SectionHeader title="Monte Carlo Simulation" tag="06" />
        <div className="stats-row">
          <StatCard label="Worst (5th %ile)"  value={fmt$(results.monte_carlo.worst)}  sub={fmtPct(results.monte_carlo.worst_return)}  accent="#e05252" />
          <StatCard label="Median"            value={fmt$(results.monte_carlo.median)} sub={fmtPct(results.monte_carlo.median_return)} />
          <StatCard label="Best (95th %ile)"  value={fmt$(results.monte_carlo.best)}   sub={fmtPct(results.monte_carlo.best_return)}   accent="#2a9d6e" />
          <StatCard label="Prob. of Loss"     value={results.monte_carlo.prob_of_loss   + "%"} accent="#e05252" />
          <StatCard label="Prob. of 2x"       value={results.monte_carlo.prob_of_double + "%"} accent="#2a9d6e" />
        </div>
        <p className="mc-plain">{results.monte_carlo.summary}</p>
        <div className="chart-row">
          <div className="chart-card flex-1">
            <div className="chart-title">Fan Chart — {results.monte_carlo.n_simulations.toLocaleString()} paths</div>
            <FanChart fanChart={results.monte_carlo.fan_chart} startingCapital={results.monte_carlo.starting_capital} />
          </div>
          <div className="chart-card flex-1">
            <div className="chart-title">Distribution of Final Values</div>
            <HistogramChart histogram={results.monte_carlo.histogram} startingCapital={results.monte_carlo.starting_capital} />
          </div>
        </div>
      </section>
    </div>
  );
}


// ─── About / Education Section ────────────────────────────────────────────────

function AboutSection() {
  const [open, setOpen] = React.useState(false);

  const metrics = [
    { icon: "📈", color: "#00d4ff", term: "Buy & Hold Return", plain: "What you would have made doing nothing", detail: "If you bought on day 1 and held the entire year without trading, this is your return. Every strategy is compared against it. If your strategy return is lower, the strategy added no value.", example: "GOOG B&H +80% means $1,000 became $1,800 just by holding." },
    { icon: "⚡", color: "#ffd700", term: "Strategy Return", plain: "What the MA crossover strategy actually made", detail: "The return from following moving average crossover signals — buying when the short MA crosses above the long MA, selling when it crosses below. Can be higher or lower than buy & hold.", example: "Strategy +68% vs B&H +80% means the strategy underperformed passive holding by 12%." },
    { icon: "🎯", color: "#7fff6b", term: "Alpha vs B&H", plain: "Did the strategy beat doing nothing?", detail: "The difference between strategy return and buy & hold. Positive alpha means the strategy added value. Negative alpha means you would have been better off not trading at all.", example: "+13% alpha = strategy won. -15% alpha = buy & hold won." },
    { icon: "⚖️", color: "#00d4ff", term: "Sharpe Ratio", plain: "Return per unit of risk taken", detail: "Divides return by volatility. Higher means more return for the same risk. Above 1.0 is good. Above 2.0 is excellent. Negative means the strategy lost money relative to its risk.", example: "Sharpe 2.6 = very efficient. Sharpe -0.2 = risky and unprofitable." },
    { icon: "🛡️", color: "#ff6b35", term: "Sortino Ratio", plain: "Return per unit of downside risk only", detail: "Like Sharpe but only penalises downside volatility. Ignores upward swings because going up is not bad risk. Sortino much higher than Sharpe means most volatility was positive.", example: "Sharpe 2.6, Sortino 4.3 means most volatility was the price going UP." },
    { icon: "🏆", color: "#7fff6b", term: "Win Rate", plain: "How often individual trades were profitable", detail: "Percentage of completed buy-sell pairs that ended in profit. A high win rate can be misleading — a few large losses can still make a high win-rate strategy unprofitable overall.", example: "Win rate 75% with 4 trades = 3 winning, 1 losing." },
    { icon: "🌊", color: "#e05252", term: "Volatility", plain: "How much the price bounces around", detail: "Annualised standard deviation of daily returns. Higher volatility means bigger swings in both directions — more potential gain but also more potential loss.", example: "NVDA at 42% vol swings far more than GOOG at 30% vol." },
    { icon: "📉", color: "#e05252", term: "Max Drawdown", plain: "The worst drop from a recent peak", detail: "The largest peak-to-trough decline during the period. This is how much you would have lost if you bought at the peak and held through the worst point.", example: "Max drawdown -22% means at its worst the portfolio was down 22% from its peak." },
    { icon: "🔗", color: "#ffd700", term: "Correlation", plain: "How similarly two assets move", detail: "A value between -1 and +1. Near +1 means they move together (no diversification benefit). Near 0 means independent movement (good diversification). Most assets in the same market will be mildly positive.", example: "GOOG/AAPL at 0.51 = moderate correlation, some diversification benefit." },
    { icon: "🎲", color: "#ff4fd8", term: "Monte Carlo", plain: "1,000 possible futures based on past behaviour", detail: "Samples random daily returns from the historical distribution and runs 1,000 simulated paths forward. The result is a range of outcomes — not a prediction, but a realistic spread of what could happen.", example: "Worst (5th %ile) $1,030. Median $1,660. Best (95th %ile) $2,670." },
  ];

  const steps = [
    { num: "01", color: "#00d4ff", icon: "🔍", title: "Browse the Screener", desc: "The main table shows all stocks ranked by 1-year return. Sort by any column — Sharpe ratio, volatility, momentum. The sparkline shows the price trend at a glance. Filter by sector using the buttons above." },
    { num: "02", color: "#ffd700", icon: "📊", title: "Open a Stock Profile", desc: "Click any row or the Profile button to open the full stock detail. You'll see the price chart with MA signals, a drawdown chart, and all risk metrics for that stock over the past year." },
    { num: "03", color: "#7fff6b", icon: "⚡", title: "Compare Stocks Side by Side", desc: "Click Compare on up to 3 stocks. A comparison panel appears above the table showing all metrics side by side. The best value in each row is highlighted so you can see which stock wins on each dimension." },
    { num: "04", color: "#ff6b35", icon: "➕", title: "Build Your Portfolio", desc: "Click + Add on any stock to add it to the Portfolio Builder in the right sidebar. You can also search for any ticker not in the list using the search bar." },
    { num: "05", color: "#ff4fd8", icon: "🎯", title: "Set or Optimise Allocations", desc: "Type allocation percentages manually, click Equal Split for an even split, or click Optimise to let the Markowitz algorithm find the best weights. Three options are shown: Max Sharpe, Min Volatility, and Equal Weight." },
    { num: "06", color: "#00d4ff", icon: "▶", title: "Run the Full Analysis", desc: "Once allocations sum to 100%, click Run Full Analysis. The backtest runs across all phases — strategy simulation, risk metrics, portfolio aggregation, and Monte Carlo simulation. Results load in 10-20 seconds." },
    { num: "07", color: "#7fff6b", icon: "📈", title: "Read the Results", desc: "The results dashboard shows portfolio summary, price charts with buy/sell signals, per-asset metric cards, correlation matrix, portfolio drawdown, and the Monte Carlo fan chart with distribution histogram." },
  ];

  const charts = [
    { icon: "📊", color: "#00d4ff", title: "Price & Moving Averages", desc: "The solid line is the closing price. The dashed line is the 7-day moving average (MA7) and the dotted line is the 30-day (MA30). A BUY signal fires when MA7 crosses above MA30 — momentum is turning positive. A SELL signal fires when MA7 crosses below MA30 — momentum is turning negative. The strategy only holds the stock between a buy and a sell signal." },
    { icon: "📉", color: "#e05252", title: "Drawdown Chart", desc: "Shows how far below its recent peak the portfolio was on any given day. A value of -10% means the portfolio was 10% below its highest point at that time. 0% means the portfolio is at an all-time high. The deeper and longer the red area, the harder the portfolio was hit and the longer it took to recover." },
    { icon: "🔲", color: "#ffd700", title: "Correlation Matrix", desc: "A grid showing how similarly each pair of assets moves. Green cells mean high positive correlation — they tend to move together, reducing diversification. The diagonal is always 1.0 (each asset is perfectly correlated with itself). Ideally you want a portfolio where the off-diagonal cells are low, meaning your assets move somewhat independently." },
    { icon: "🌊", color: "#ff4fd8", title: "Monte Carlo Fan Chart", desc: "Each faint line is one simulated future portfolio path. The shaded bands show the 25th-75th percentile (darker) and 5th-95th percentile (lighter) ranges. The solid blue line is the median outcome. The red dashed line is the worst realistic scenario (5th percentile). The black dotted horizontal line is your starting capital — anything above it is profit." },
    { icon: "📊", color: "#7fff6b", title: "Distribution Histogram", desc: "Shows where all 1,000 Monte Carlo simulations ended up after the horizon period. The x-axis is final portfolio value, the y-axis is how many simulations landed in each range. Red bars are outcomes below your starting capital (losses). The taller the bars in the middle, the more consistent the outcome. A wide spread means high uncertainty." },
  ];

  return (
    <div className="about-section">
      <button className="about-toggle" onClick={() => setOpen(v => !v)}>
        <span className="about-toggle-left">
          <span className="about-toggle-icon">?</span>
          <span>
            <strong>How to use Risk-Aware Strategy Lab</strong>
            <span className="about-toggle-sub">Strategy guide · Metric glossary · Chart explanations</span>
          </span>
        </span>
        <span className="about-toggle-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="about-body">

          {/* Disclaimer */}
          <div className="about-disclaimer">
            <span className="about-disclaimer-icon">⚠</span>
            <div>
              <strong>Not financial advice.</strong> Risk-Aware Strategy Lab is an educational tool for understanding portfolio risk and backtesting trading strategies using historical data. Past performance does not predict future results. The MA crossover strategy shown is for illustrative purposes only. Always conduct your own research and consult a qualified financial advisor before making investment decisions.
            </div>
          </div>

          {/* What is RASL */}
          <div className="about-block">
            <h3 className="about-block-title">What is Risk-Aware Strategy Lab?</h3>
            <p className="about-block-text">
              Most retail trading tools show you returns and hide the risk. RASL does the opposite — it puts risk front and centre so you can make better-informed decisions about which assets to hold and how to allocate your capital.
            </p>
            <p className="about-block-text">
              You can browse and compare stocks, view their full risk profile over the past year, backtest a moving average crossover strategy against a passive buy-and-hold benchmark, optimise your portfolio allocation using Markowitz mean-variance theory, and simulate 1,000 possible future outcomes using Monte Carlo methods.
            </p>
            <div className="about-strategy-box">
              <div className="about-strategy-title">The Strategy: MA Crossover</div>
              <p>A moving average crossover strategy generates a <strong>buy signal</strong> when the short-term average (7 days) crosses above the long-term average (30 days) — suggesting upward momentum. It generates a <strong>sell signal</strong> when the 7-day crosses below the 30-day — suggesting the trend is reversing. Between a buy and a sell, the strategy holds the asset. Between a sell and a buy, it sits in cash.</p>
              <div className="about-ma-visual">
                <div className="ma-visual-row">
                  <span className="ma-dot buy" />
                  <span>MA7 crosses <strong>above</strong> MA30 → <span style={{color:"#2a9d6e"}}>BUY signal</span> — enter position</span>
                </div>
                <div className="ma-visual-row">
                  <span className="ma-dot sell" />
                  <span>MA7 crosses <strong>below</strong> MA30 → <span style={{color:"#e05252"}}>SELL signal</span> — exit position, hold cash</span>
                </div>
                <div className="ma-visual-row">
                  <span className="ma-dot neutral" />
                  <span>Between signals → <span style={{color:"#8899aa"}}>No action</span> — maintain current position</span>
                </div>
              </div>
            </div>
          </div>

          {/* How to use */}
          <div className="about-block">
            <h3 className="about-block-title">How to Use This Tool</h3>
            <div className="about-steps">
              {steps.map(s => (
                <div key={s.num} className="about-step" style={{borderLeftColor: s.color}}>
                  <div className="about-step-header">
                    <span className="about-step-num" style={{color: s.color}}>{s.num}</span>
                    <span className="about-step-icon">{s.icon}</span>
                    <span className="about-step-title">{s.title}</span>
                  </div>
                  <p className="about-step-desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Metric glossary */}
          <div className="about-block">
            <h3 className="about-block-title">Understanding the Numbers</h3>
            <p className="about-block-text">Every metric in the app is explained below in plain language, with an example.</p>
            <div className="about-metrics">
              {metrics.map(m => (
                <div key={m.term} className="about-metric-card" style={{borderTopColor: m.color}}>
                  <div className="about-metric-header">
                    <span className="about-metric-icon">{m.icon}</span>
                    <div>
                      <div className="about-metric-term" style={{color: m.color}}>{m.term}</div>
                      <div className="about-metric-plain">{m.plain}</div>
                    </div>
                  </div>
                  <p className="about-metric-detail">{m.detail}</p>
                  <div className="about-metric-example">
                    <span className="about-example-label">Example</span>
                    <span>{m.example}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chart explanations */}
          <div className="about-block">
            <h3 className="about-block-title">Understanding the Charts</h3>
            <div className="about-charts">
              {charts.map(c => (
                <div key={c.title} className="about-chart-card">
                  <div className="about-chart-icon" style={{background: c.color + "22", color: c.color}}>{c.icon}</div>
                  <div className="about-chart-content">
                    <div className="about-chart-title" style={{color: c.color}}>{c.title}</div>
                    <p className="about-chart-desc">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}


// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screenerData, setScreenerData]   = useState({ stocks: [], sectors: [] });
  const [screenerLoading, setScreenerLoading] = useState(true);
  const [extraStocks, setExtraStocks]     = useState([]);   // live-searched stocks

  const [modalTicker, setModalTicker]     = useState(null);
  const [compareList, setCompareList]     = useState([]);
  const [portfolio, setPortfolio]         = useState({});
  const [cash, setCash]                   = useState("10000");
  const [horizon, setHorizon]             = useState("252");

  const [optimiserData, setOptimiserData] = useState(null);
  const [results, setResults]             = useState(null);
  const [runLoading, setRunLoading]       = useState(false);
  const [runError, setRunError]           = useState(null);

  useEffect(() => {
    axios.get(`${API}/api/screener`)
      .then(r => setScreenerData({ stocks: r.data.stocks, sectors: r.data.sectors }))
      .catch(() => {})
      .finally(() => setScreenerLoading(false));
  }, []);

  // Fetch a ticker that isn't in our curated list and add it to extraStocks
  async function handleSearchFetch(ticker) {
    const res = await axios.get(`${API}/api/stock/${ticker}`);
    const s   = res.data.stock;
    // Build a screener-compatible object from the profile response
    const entry = {
      ticker:        s.ticker,
      name:          ticker,
      sector:        "Custom",
      current_price: s.price_series ? Object.values(s.price_series).at(-1) : 0,
      start_price:   s.price_series ? Object.values(s.price_series)[0] : 0,
      bnh_return:    s.benchmark_return,
      momentum_30d:  null,
      volatility:    s.volatility,
      max_drawdown:  s.max_drawdown,
      sharpe:        s.sharpe,
      price_series:  s.price_series,
    };
    setExtraStocks(prev => {
      if (prev.find(x => x.ticker === ticker)) return prev;
      return [...prev, entry];
    });
  }

  const allStocks = [...screenerData.stocks, ...extraStocks.filter(
    e => !screenerData.stocks.find(s => s.ticker === e.ticker)
  )];

  function openModal(ticker, autoAdd = false) {
    setModalTicker(ticker);
    if (autoAdd) addToPortfolio(ticker);
  }

  function addToPortfolio(ticker) {
    if (ticker in portfolio) return;
    setPortfolio(prev => ({ ...prev, [ticker]: { alloc: "" } }));
    setOptimiserData(null);  // portfolio changed — old optimiser results are stale
  }

  function removeFromPortfolio(ticker) {
    setPortfolio(prev => { const n = { ...prev }; delete n[ticker]; return n; });
    // Optimiser results are now stale — clear them
    setOptimiserData(null);
  }

  function updateAlloc(ticker, val) {
    setPortfolio(prev => ({ ...prev, [ticker]: { alloc: val } }));
  }

  function equalSplit() {
    const tickers = Object.keys(portfolio);
    if (tickers.length === 0) return;
    const each = (100 / tickers.length).toFixed(2);
    const next = {};
    tickers.forEach((t, i) => {
      // Give any rounding remainder to the last ticker
      next[t] = { alloc: i === tickers.length - 1
        ? (100 - parseFloat(each) * (tickers.length - 1)).toFixed(2)
        : each };
    });
    setPortfolio(next);
  }

  function toggleCompare(ticker) {
    setCompareList(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    );
  }

  async function handleOptimise(tickers) {
    const res = await axios.post(`${API}/api/optimise`, { tickers });
    return res.data;
  }

  function applyOptimal(weights) {
    // weights is { AAPL: 60.5, GOOG: 39.5, ... }
    const next = {};
    Object.keys(portfolio).forEach(t => {
      next[t] = { alloc: String(weights[t] ?? "0") };
    });
    setPortfolio(next);
  }

  async function handleRun() {
    setRunError(null);
    setRunLoading(true);
    const tickers  = Object.keys(portfolio);
    const allocObj = {};
    tickers.forEach(t => { allocObj[t] = parseFloat(portfolio[t].alloc) || 0; });
    try {
      const res = await axios.post(`${API}/api/run`, {
        tickers,
        total_cash:   parseFloat(cash),
        allocations:  allocObj,
        horizon_days: parseInt(horizon),
      });
      setResults(res.data);
    } catch (e) {
      setRunError(e.response?.data?.detail || "Something went wrong. Is the backend running?");
    } finally {
      setRunLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-bracket">[</span>RASL<span className="logo-bracket">]</span>
          </div>
          <div className="header-title">
            <h1>Risk-Aware Strategy Lab</h1>
            <p>Discover · Analyse · Compare · Backtest</p>
          </div>
          {Object.keys(portfolio).length > 0 && !results && (
            <div className="header-portfolio-peek">
              {Object.keys(portfolio).map((t, i) => (
                <span key={t} className="peek-ticker" style={{ color: COLORS[i % COLORS.length] }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </header>

      {results ? (
        <>
          {runLoading && <div className="run-overlay"><div className="loading-spinner large" /></div>}
          <ResultsDashboard results={results} onBack={() => setResults(null)} />
        </>
      ) : (
        <div className="main-layout">
          <div className="main-content">
            <AboutSection />
            {compareList.length >= 2 && (
              <ComparePanel
                compareList={compareList}
                allStocks={allStocks}
                onClear={() => setCompareList([])}
              />
            )}
            <Screener
              stocks={screenerData.stocks}
              sectors={screenerData.sectors}
              extraStocks={extraStocks}
              onSelectStock={openModal}
              compareList={compareList}
              onToggleCompare={toggleCompare}
              portfolio={portfolio}
              loading={screenerLoading}
              onSearchFetch={handleSearchFetch}
            />
            {runError && <div className="error-msg" style={{ marginTop: 16 }}>{runError}</div>}
          </div>

          <div className="sidebar">
            <PortfolioBuilder
              portfolio={portfolio}
              onUpdateAlloc={updateAlloc}
              onRemove={removeFromPortfolio}
              onEqualSplit={equalSplit}
              onOptimise={handleOptimise}
              onApplyOptimal={applyOptimal}
              optimiserData={optimiserData}
              onSetOptimiserData={setOptimiserData}
              onRun={handleRun}
              cash={cash}
              onCashChange={setCash}
              horizon={horizon}
              onHorizonChange={setHorizon}
            />
            {runLoading && (
              <div className="run-loading">
                <div className="loading-spinner" /><span>Running analysis…</span>
              </div>
            )}
          </div>
        </div>
      )}

      {modalTicker && (() => {
        const stock = allStocks.find(s => s.ticker === modalTicker);
        return (
          <StockModal
            ticker={modalTicker}
            name={stock?.name ?? ""}
            sector={stock?.sector ?? ""}
            onClose={() => setModalTicker(null)}
            onAdd={t => { addToPortfolio(t); setModalTicker(null); }}
            inPortfolio={modalTicker in portfolio}
          />
        );
      })()}
    </div>
  );
}