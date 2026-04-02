# CLAUDE.md — Risk-Aware Strategy Lab (RASL)
## Complete Technical Context for Claude Code Continuation

---

## 1. Project Overview

**Risk-Aware Strategy Lab (RASL)** is a full-stack portfolio backtesting and risk analysis web application.

**Positioning:** A risk transparency and portfolio simulation tool for retail investors who want to understand their exposure before committing real money. It is explicitly NOT a financial advisor or signal-following service — this framing is intentional and matters for how features are described.

**Primary audiences:** Retail investors, finance/business students, active traders, quant developers (secondary), and recruiters reviewing the portfolio project.

**Current status:** Feature-complete locally. Next step is deployment (Railway for backend, Vercel for frontend).

---

## 2. Repository Structure

```
StockTracker/                        ← project root
├── .venv/                           ← Python virtual environment (activated)
├── analysis.py                      ← all Python analysis logic (phases 1–4 + optimiser)
├── main.py                          ← FastAPI server with all endpoints
├── stock_tracker.py                 ← original monolithic script (kept for reference, not used)
└── frontend/                        ← Vite + React app
    ├── src/
    │   ├── App.jsx                  ← entire frontend (single-file, ~1336 lines)
    │   ├── App.css                  ← all styles (~1000+ lines)
    │   └── index.css                ← minimal reset only
    ├── package.json
    └── vite.config.js
```

---

## 3. Technology Stack

### Backend
- **Python 3.14.2**
- **FastAPI** — web framework
- **uvicorn** — ASGI server (`uvicorn main:app --reload`)
- **yfinance** — Yahoo Finance data fetching
- **pandas, numpy** — data processing
- **scipy** — portfolio optimisation (Markowitz MVO)
- **math** — NaN/Inf guard in JSON serialisation

### Frontend
- **Node 24.8.0**
- **Vite** (not Create React App — CRA is incompatible with Node 24)
- **React 18** with hooks
- **recharts** — all charts (LineChart, AreaChart, BarChart, ScatterChart)
- **axios** — HTTP requests to FastAPI
- **react-is** — required peer dependency for recharts (install separately)

### Dev URLs
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173` (Vite default, NOT 3000)
- CORS is configured for `http://localhost:5173` only

---

## 4. How to Run Locally

**Terminal 1 — Backend:**
```bash
cd C:\Users\RYZEN\Music\StockTracker
.venv\Scripts\activate        # Windows
uvicorn main:app --reload
```

**Terminal 2 — Frontend:**
```bash
cd C:\Users\RYZEN\Music\StockTracker\frontend
npm run dev
```

**Test backend is alive:** `GET http://localhost:8000/` → `{"status":"ok"}`
**Full API docs:** `http://localhost:8000/docs`

---

## 5. Backend — `analysis.py`

All analysis logic lives here as pure functions. FastAPI imports and calls them.

### Functions

#### `_days_to_period(days: int) -> str`
Maps user's horizon in trading days to nearest yfinance period string.
- ≤63 → `"3mo"`, ≤126 → `"6mo"`, ≤252 → `"1y"`, ≤504 → `"2y"`, else `"5y"`

#### `fetch_ticker_data(tickers: list[str], horizon_days: int = 252) -> tuple[dict, list]`
Fetches OHLCV history from Yahoo Finance. Returns `(risk_info_dict, failed_list)`.
- `risk_info` dict: `{ "AAPL": DataFrame, ... }`
- Each DataFrame has a `Daily Return` column added (pct_change of Close)
- Period is derived from `horizon_days` via `_days_to_period()`

#### `backtest_ticker(ticker, data, allocated_cash) -> dict`
Runs MA7/MA30 crossover backtest on a single ticker.

**Strategy logic:**
- Signal = 1 (buy) when MA7 crosses above MA30
- Signal = -1 (sell) when MA7 crosses below MA30
- Signal shifted by 1 day to prevent lookahead bias
- Position built day-by-day: 1 = invested, 0 = cash

**Returns dict with:**
- `sharpe`, `sortino`, `win_rate`, `strategy_return`, `benchmark_return`, `alpha`
- `volatility`, `max_drawdown`, `allocated`, `final_balance`
- `num_signals`, `completed_trades`, `invested_days`
- `price_series`, `ma7_series`, `ma30_series`, `drawdown_series` (all date→value dicts)
- `enriched_data` (DataFrame — stripped before JSON, kept for Phase 3)

**Important:** All numeric return values go through `safe(v, digits)` helper which converts NaN/Inf → None. This prevents JSON serialisation errors.

**Zero allocation guard:** If `allocated_cash <= 0`, returns 0.0 for return metrics instead of dividing by zero.

#### `run_portfolio_risk(backtest_results, weights) -> dict`
Combines per-asset daily returns into a weighted portfolio. Called after all tickers are backtested.

**Returns:**
- `volatility`, `total_return`, `max_drawdown`, `sharpe` (all portfolio-level, annualised)
- `correlation` — nested dict `{ "AAPL": { "GOOG": 0.51, ... }, ... }`
- `avg_correlation` — mean of off-diagonal correlation values
- `diversification` — plain-language string based on avg_corr thresholds (>0.7 high, >0.4 moderate, else low)
- `drawdown_series` — date→value dict for chart
- `portfolio_daily` — pandas Series (stripped before JSON, passed to Monte Carlo)

**NaN guards:** `safe_float()` applied to all numeric outputs. `avg_corr` guarded against NaN for single-ticker edge case.

#### `run_monte_carlo(portfolio_daily, allocated_total, horizon_days=252, n_simulations=1000) -> dict`
Samples 1000 random return paths from a normal distribution fitted to historical portfolio daily returns.

**Returns:**
- `worst` (5th %ile), `median` (50th), `best` (95th) — dollar values
- `worst_return`, `median_return`, `best_return` — percentages
- `prob_of_loss`, `prob_of_double` — percentages
- `risk_label` — "relatively low risk" / "moderate risk" / "high risk"
- `summary` — plain-language string
- `fan_chart` — `{ days: [...], p5: [...], p25: [...], p50: [...], p75: [...], p95: [...] }`
- `histogram` — `{ counts: [...], edges: [...] }` (40 bins)

**Seed:** `np.random.seed(42)` for reproducibility.

#### `run_optimiser(risk_info, tickers) -> dict`
Markowitz Mean-Variance Optimisation using `scipy.optimize.minimize` with SLSQP method.

**Three portfolios returned:**
1. **Max Sharpe** — maximises return/volatility ratio
2. **Min Volatility** — minimises portfolio standard deviation
3. **Equal Weight** — 1/n baseline

Each portfolio dict: `{ weights: {"AAPL": 60.2, ...}, return: 12.3, volatility: 18.1, sharpe: 0.68 }`

**Also returns:** `frontier` — list of 50 `{vol, ret, sharpe}` dicts sweeping from min-vol return to max individual return (for scatter plot).

**Constraints:** Long-only (weights 0–100%), sum to 100%.
**Requires:** At least 2 valid tickers.

---

## 6. Backend — `main.py`

FastAPI application with 5 endpoints.

### Endpoints

#### `GET /`
Health check. Returns `{"status": "ok", "message": "..."}`.

#### `GET /api/screener`
Fetches 1-year data for all ~30 curated tickers and returns screener table data.
- Calls `fetch_ticker_data(all_tickers)` — takes ~20 seconds on first call
- Calls `_quick_metrics()` for each ticker (lightweight: vol, bnh_return, max_drawdown, sharpe, momentum_30d, weekly price_series)
- Returns stocks sorted by `bnh_return` descending
- Response: `{ stocks: [...], failed: [...], sectors: [...] }`

#### `GET /api/stock/{ticker}`
Full profile for a single ticker. Called when user opens the stock modal.
- Calls `fetch_ticker_data([ticker])` then `backtest_ticker(ticker, data, 1000.0)`
- Returns full backtest result dict (minus `enriched_data`)

#### `POST /api/run`
Main analysis endpoint. Runs full pipeline (Phases 1–4).

**Request body:**
```json
{
  "tickers": ["GOOG", "AAPL", "NVDA"],
  "total_cash": 1000,
  "allocations": {"GOOG": 60, "AAPL": 10, "NVDA": 30},
  "horizon_days": 252
}
```

**Validation:**
- Allocations must sum to 100% (±0.01 tolerance)
- Every ticker must have an allocation
- Every allocation must be > 0 (prevents NaN from zero division)

**Pipeline:**
1. `fetch_ticker_data(tickers, horizon_days=req.horizon_days)` — uses horizon to determine data period
2. `backtest_ticker()` for each valid ticker
3. `run_portfolio_risk(backtest_results, weights)`
4. `run_monte_carlo(portfolio_daily, allocated_total, horizon_days=req.horizon_days)`

**Response:**
```json
{
  "status": "ok",
  "meta": { "tickers", "failed_tickers", "total_cash", "allocated_total", "final_balance", "profit_dollars", "profit_pct" },
  "assets": [ per-asset result dicts ],
  "portfolio": { portfolio-level metrics },
  "monte_carlo": { simulation results }
}
```

#### `POST /api/optimise`
Markowitz optimisation for the given tickers.

**Request body:** `{ "tickers": ["GOOG", "AAPL"] }`

**Response:**
```json
{
  "status": "ok",
  "tickers": [...],
  "max_sharpe": { "weights": {...}, "return": 12.3, "volatility": 18.1, "sharpe": 0.68 },
  "min_volatility": { ... },
  "equal_weight": { ... },
  "frontier": [ { "vol": 18.1, "ret": 12.3, "sharpe": 0.68 }, ... ]
}
```

### Curated Stock Universe (STOCK_UNIVERSE dict)
```
Tech:       AAPL, MSFT, NVDA, GOOG, META, AMZN, TSM, AVGO
Finance:    JPM, BAC, GS, V, MA, BRK-B
Healthcare: JNJ, LLY, UNH, ABBV, PFE
Energy:     XOM, CVX, COP, SLB
Consumer:   TSLA, WMT, MCD, NKE, COST
ETF:        SPY, QQQ, IWM, GLD
```

---

## 7. Frontend — `App.jsx`

Single file (~1336 lines). All components defined in one file, no routing library (single-page app with state-based view switching).

### View States
The app has two top-level views controlled by the `results` state:
- `results === null` → Screener + Portfolio Builder layout
- `results !== null` → Results Dashboard

### Key State (root App component)
```javascript
screenerData        // { stocks: [], sectors: [] } — loaded once on mount
screenerLoading     // bool
extraStocks         // stocks fetched via live search, not in curated list
modalTicker         // string | null — which stock's modal is open
compareList         // string[] — up to 3 tickers selected for comparison
portfolio           // { AAPL: { alloc: "60" }, GOOG: { alloc: "40" } }
cash                // string — total capital input
horizon             // string — trading days (affects both backtest and Monte Carlo)
results             // null | API response object
runLoading          // bool
runError            // string | null
```

### Component Tree
```
App
├── Header
├── [if results] ResultsDashboard
│   ├── SectionHeader (×6)
│   ├── StatCard (×many)
│   ├── PriceChart (recharts LineChart)
│   ├── AssetCard (×n tickers)
│   ├── AreaChart (drawdown)
│   ├── CorrelationMatrix (CSS grid)
│   ├── FanChart (recharts AreaChart)
│   └── HistogramChart (recharts BarChart)
│
└── [if !results] main-layout (CSS grid: 1fr 280px)
    ├── main-content
    │   ├── AboutSection (collapsible)
    │   ├── ComparePanel (shows when compareList.length >= 2)
    │   └── Screener
    │       ├── Search bar (debounced auto-fetch)
    │       ├── Sector filter buttons
    │       └── Table rows (clickable → opens modal)
    │
    └── sidebar (position: sticky)
        └── PortfolioBuilder
            ├── Equal Split button
            ├── Optimise button → FrontierChart + 3 OptimCard
            ├── Stock allocation inputs
            ├── Capital + Horizon inputs
            └── Run Full Analysis button
```

### Search Behaviour (debounced auto-fetch)
- User types in search box
- `handleQueryChange()` fires on every keystroke
- Sets a 600ms debounce timer
- If query is not already in `allStocks` list, auto-fetches `GET /api/stock/{ticker}` after 600ms
- On success: adds to `extraStocks` state, visible immediately in table
- On failure: shows error message inline
- No manual "Search" button — fully automatic

### Stock Modal
- Opens when user clicks a table row OR the Profile button
- Action buttons (Profile, Compare, Add) have `e.stopPropagation()` to prevent double-firing
- Fetches `GET /api/stock/{ticker}` on open
- Shows: price+MA chart, drawdown chart, 8 metric cards, trade stats
- Has "Add to Portfolio" button or "✓ In Portfolio" indicator

### Portfolio Builder
- Shows empty state (placeholder) when no stocks added
- `onEqualSplit` — distributes 100% evenly, last ticker absorbs rounding remainder
- `onOptimise` — calls `POST /api/optimise`, shows 3 cards with weight bars
- `onApplyOptimal(weights)` — fills allocation inputs, scrolls to them via `allocRef`
- Optimiser panel clears automatically when ticker count changes (useEffect)
- Run button disabled unless allocations sum to exactly 100% (±0.01 tolerance)

### Color System
```javascript
COLORS = ["#00d4ff", "#ff6b35", "#7fff6b", "#ffd700", "#ff4fd8"]  // per-ticker
SECTOR_COLORS = { Tech: "#00d4ff", Finance: "#ffd700", Healthcare: "#7fff6b",
                  Energy: "#ff6b35", Consumer: "#ff4fd8", ETF: "#aabbcc" }
```

### CSS Variables (in App.css)
```css
--bg: #070d18       --bg-2: #0d1421      --bg-3: #111c2e
--border: #1a2a3d   --border-2: #243448
--text: #c8d8e8     --text-dim: #5a7090  --text-mid: #8899aa
--accent: #00d4ff   --accent-2: #0088aa
--green: #2a9d6e    --red: #e05252       --gold: #d4a017
--mono: 'Space Mono', monospace
--sans: 'DM Sans', sans-serif
```

### Fonts
Google Fonts: `Space Mono` (monospace, numbers/tickers) + `DM Sans` (body text)

---

## 8. About / Education Section

Collapsible section at top of screener page. Collapsed by default.

**Contents:**
1. **Disclaimer** — not financial advice, educational tool only
2. **What is RASL** — description + MA crossover strategy visual explanation
3. **How to Use** — 7 numbered steps
4. **Understanding the Numbers** — 10 metric cards (each with icon, plain-English description, technical detail, and example)
5. **Understanding the Charts** — 5 chart explanation cards

**Metrics documented:** Buy & Hold Return, Strategy Return, Alpha vs B&H, Sharpe Ratio, Sortino Ratio, Win Rate, Volatility, Max Drawdown, Correlation, Monte Carlo

**Charts documented:** Price & MA chart, Drawdown chart, Correlation Matrix, Monte Carlo Fan Chart, Distribution Histogram

---

## 9. Known Issues Fixed During Development

| Issue | Fix |
|-------|-----|
| `ValueError: Out of range float values are not JSON compliant: np.float64(nan)` | Added `safe()` and `safe_float()` helpers to convert NaN/Inf → None in all return dicts |
| 500 error when a stock has 0% allocation | Zero allocation guard in `backtest_ticker`, and validation in `/api/run` that rejects 0% allocations |
| Duplicate AboutSection rendering | Removed second `<AboutSection />` from JSX layout |
| Search cleared after live fetch making result disappear | Removed `setQuery("")` from success handler, kept query to maintain filter |
| Optimiser modal persisting after stock removal | Added `useEffect` in PortfolioBuilder watching `tickers.length`, clears optimData on change |
| CRA incompatible with Node 24 (`ajv/dist/compile/codegen` error) | Switched from Create React App to Vite |
| `react-is` missing peer dependency | `npm install react-is` separately |
| recharts installed in wrong directory | `cd frontend && npm install recharts axios` |
| NaN in `avg_corr` for single-ticker case | Explicit NaN check before use |

---

## 10. What's Next — Deployment Plan

The app is feature-complete. The only remaining task before putting on resume is deployment.

### Recommended Stack
- **Backend → Railway** (free tier, Python/FastAPI, deploys from GitHub)
- **Frontend → Vercel** (free tier, Vite/React, deploys from GitHub)

### Steps
1. Create GitHub repository, push all code
2. Add `requirements.txt` to project root:
   ```
   fastapi
   uvicorn
   yfinance
   pandas
   numpy
   scipy
   ```
3. Add `Procfile` to project root:
   ```
   web: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. Update CORS in `main.py` to allow the production Vercel URL
5. Update `API` constant in `App.jsx` to point to Railway URL (or use env variable)
6. Deploy backend to Railway from GitHub
7. Deploy frontend to Vercel from GitHub (set `VITE_API_URL` env var)
8. Test live URL end-to-end

### Environment Variable Pattern for Frontend
In `App.jsx`, change:
```javascript
const API = "http://localhost:8000";
```
To:
```javascript
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
```
Then set `VITE_API_URL=https://your-app.railway.app` in Vercel environment variables.

---

## 11. Potential Future Features (Discussed, Not Built)

| Feature | Notes |
|---------|-------|
| RSI strategy | Additional signal type alongside MA crossover |
| MACD strategy | Additional signal type |
| Save/share results | Requires database (Postgres on Railway). Do this before auth. |
| Authentication | Only valuable once save/share exists. Don't build before persistent data. |
| Result sharing via URL | `/result/abc123` read-only snapshot. Most compelling next feature. |
| Efficient frontier visualisation | Already partially built in optimiser — scatter chart with ScatterChart from recharts |

**Explicitly out of scope:** Live trading, broker integration, real-time prices, price prediction, machine learning on Monte Carlo output (noted why this doesn't work — MC paths are random by definition, no hidden "best track").

---

## 12. Product Decisions Made (Important Context)

**Why not target quant developers:** They have Bloomberg, QuantConnect, Zipline. Can't compete.

**Correct target audience:** Retail investors on Robinhood/Webull who make allocation decisions on gut feeling with no understanding of risk exposure.

**Why not "follow our signals to make money":** The MA crossover strategy underperforms buy-and-hold in most conditions. The backtests in the app confirmed this for NVDA (-33% alpha), AAPL (-14% alpha). Positioning as a signal-following tool makes an unsupportable promise.

**Correct positioning:** Risk transparency and simulation tool. The value is showing users what their actual risk exposure looks like, not telling them what to buy.

**Disclaimer:** Intentionally prominent in the About section. "Not financial advice. Educational tool for understanding portfolio risk." Makes the product more credible, not less.

---

## 13. Resume Description (Suggested)

**For software engineering roles:**
> Built a full-stack portfolio risk analysis platform (Python/FastAPI + React/Vite). Features include real-time stock data via yfinance, MA crossover backtesting engine, Markowitz mean-variance portfolio optimisation using scipy, Monte Carlo simulation (1,000 paths), and an interactive screener with live search. Backend serves JSON via REST API; frontend built with React hooks and recharts.

**For quant/finance roles:**
> Implemented a portfolio backtesting and risk platform featuring MA crossover signal generation, Sharpe/Sortino ratio calculation, maximum drawdown analysis, portfolio-level correlation matrix, efficient frontier construction, and probabilistic outcome simulation using geometric Brownian motion assumptions.

**For data science/ML roles:**
> Built end-to-end data pipeline pulling financial time series from Yahoo Finance, computing risk metrics (volatility, drawdown, Sharpe), running portfolio optimisation via scipy SLSQP, and generating probabilistic forecasts with Monte Carlo simulation. Delivered through a REST API consumed by an interactive React dashboard.

---

## 14. File Checksums / Line Counts (at time of writing)

| File | Lines | Notes |
|------|-------|-------|
| `analysis.py` | ~474 | All analysis logic |
| `main.py` | ~296 | FastAPI + all endpoints |
| `frontend/src/App.jsx` | ~1336 | Entire frontend, single file |
| `frontend/src/App.css` | ~1000+ | All styles |
| `frontend/src/index.css` | 2 | Minimal reset only |
