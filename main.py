from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
import os
from analysis import fetch_ticker_data, backtest_ticker, run_portfolio_risk, run_monte_carlo, run_optimiser


#  APP SETUP


app = FastAPI(title="Risk-Aware Strategy Lab API")

ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"]
if os.environ.get("FRONTEND_URL"):
    ALLOWED_ORIGINS.append(os.environ["FRONTEND_URL"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


#  CURATED STOCK UNIVERSE


STOCK_UNIVERSE = {
    "Tech": [
        {"ticker": "AAPL",  "name": "Apple"},
        {"ticker": "MSFT",  "name": "Microsoft"},
        {"ticker": "NVDA",  "name": "NVIDIA"},
        {"ticker": "GOOG",  "name": "Alphabet"},
        {"ticker": "META",  "name": "Meta"},
        {"ticker": "AMZN",  "name": "Amazon"},
        {"ticker": "TSM",   "name": "TSMC"},
        {"ticker": "AVGO",  "name": "Broadcom"},
    ],
    "Finance": [
        {"ticker": "JPM",   "name": "JPMorgan Chase"},
        {"ticker": "BAC",   "name": "Bank of America"},
        {"ticker": "GS",    "name": "Goldman Sachs"},
        {"ticker": "V",     "name": "Visa"},
        {"ticker": "MA",    "name": "Mastercard"},
        {"ticker": "BRK-B", "name": "Berkshire Hathaway"},
    ],
    "Healthcare": [
        {"ticker": "JNJ",   "name": "Johnson & Johnson"},
        {"ticker": "LLY",   "name": "Eli Lilly"},
        {"ticker": "UNH",   "name": "UnitedHealth"},
        {"ticker": "ABBV",  "name": "AbbVie"},
        {"ticker": "PFE",   "name": "Pfizer"},
    ],
    "Energy": [
        {"ticker": "XOM",   "name": "ExxonMobil"},
        {"ticker": "CVX",   "name": "Chevron"},
        {"ticker": "COP",   "name": "ConocoPhillips"},
        {"ticker": "SLB",   "name": "SLB"},
    ],
    "Consumer": [
        {"ticker": "TSLA",  "name": "Tesla"},
        {"ticker": "WMT",   "name": "Walmart"},
        {"ticker": "MCD",   "name": "McDonald's"},
        {"ticker": "NKE",   "name": "Nike"},
        {"ticker": "COST",  "name": "Costco"},
    ],
    "ETF": [
        {"ticker": "SPY",   "name": "S&P 500 ETF"},
        {"ticker": "QQQ",   "name": "Nasdaq 100 ETF"},
        {"ticker": "IWM",   "name": "Russell 2000 ETF"},
        {"ticker": "GLD",   "name": "Gold ETF"},
    ],
}


#  SHARED HELPER


def _quick_metrics(ticker: str, data) -> dict:
    """Lightweight stats for screener table rows."""
    import numpy as np

    daily = data["Daily Return"].dropna()
    close = data["Close"].dropna()

    volatility   = float(daily.std() * (252 ** 0.5) * 100)
    bnh_return   = float((close.iloc[-1] - close.iloc[0]) / close.iloc[0] * 100)
    peak         = close.cummax()
    drawdown     = (close - peak) / peak
    max_drawdown = float(drawdown.min() * 100)
    sharpe       = (float(daily.mean() / daily.std() * (252 ** 0.5))
                    if daily.std() != 0 else None)
    momentum_30d = (float((close.iloc[-1] - close.iloc[-30]) / close.iloc[-30] * 100)
                    if len(close) >= 30 else None)

    price_series = {
        str(date.date()): round(float(val), 2)
        for date, val in close.iloc[::5].items()
    }

    return {
        "ticker":        ticker,
        "volatility":    round(volatility, 2),
        "bnh_return":    round(bnh_return, 2),
        "max_drawdown":  round(max_drawdown, 2),
        "sharpe":        round(sharpe, 3) if sharpe is not None else None,
        "momentum_30d":  round(momentum_30d, 2) if momentum_30d is not None else None,
        "price_series":  price_series,
        "current_price": round(float(close.iloc[-1]), 2),
        "start_price":   round(float(close.iloc[0]), 2),
    }



#  REQUEST MODEL


class RunRequest(BaseModel):
    tickers:      list[str]
    total_cash:   float
    allocations:  dict[str, float]
    horizon_days: int = 252


#  HEALTH CHECK


@app.get("/")
def health_check():
    return {"status": "ok", "message": "Risk-Aware Strategy Lab API is running"}



#  SCREENER ENDPOINT


@app.get("/api/screener")
def get_screener():
    all_tickers = [s["ticker"] for stocks in STOCK_UNIVERSE.values() for s in stocks]
    name_map    = {s["ticker"]: s["name"]
                   for stocks in STOCK_UNIVERSE.values() for s in stocks}

    risk_info, failed = fetch_ticker_data(all_tickers)

    results = []
    for sector, stocks in STOCK_UNIVERSE.items():
        for stock in stocks:
            t = stock["ticker"]
            if t not in risk_info:
                continue
            metrics           = _quick_metrics(t, risk_info[t])
            metrics["name"]   = name_map[t]
            metrics["sector"] = sector
            results.append(metrics)

    results.sort(key=lambda x: x["bnh_return"], reverse=True)

    return {
        "status":  "ok",
        "stocks":  results,
        "failed":  failed,
        "sectors": list(STOCK_UNIVERSE.keys()),
    }


#  COMPANY SEARCH ENDPOINT


@app.get("/api/search")
def search_companies(q: str):
    """
    Searches Yahoo Finance for companies matching a name or partial ticker.
    Falls back to empty list if yf.Search is unavailable.
    """
    q = q.strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    try:
        search = yf.Search(q, max_results=8, news_count=0)
        quotes = search.quotes
    except AttributeError:
        raise HTTPException(status_code=500,
            detail="Search unavailable. Run: pip install --upgrade yfinance")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    results = []
    seen    = set()
    for q_item in quotes:
        ticker   = q_item.get("symbol", "")
        name     = q_item.get("longname") or q_item.get("shortname") or ticker
        exchange = q_item.get("exchange", "")
        q_type   = q_item.get("quoteType", "")

        if not ticker or ticker in seen:
            continue

        if q_type in ("OPTION", "FUTURE", "CURRENCY", "INDEX", "CRYPTOCURRENCY"):
            continue

        is_private = (
            q_type not in ("EQUITY", "ETF", "MUTUALFUND") or
            ".PVT" in ticker or
            exchange in ("PNK", "GREY", "OTC", "OTCMKTS")
        )

        seen.add(ticker)
        results.append({
            "ticker":   ticker,
            "name":     name,
            "exchange": exchange,
            "type":     q_type,
            "private":  is_private,
        })

    return {"status": "ok", "results": results, "query": q}


#  STOCK PROFILE ENDPOINT


@app.get("/api/stock/{ticker}")
def get_stock_profile(ticker: str):
    ticker = ticker.upper()
    risk_info, failed = fetch_ticker_data([ticker])

    if ticker in failed or ticker not in risk_info:
        raise HTTPException(status_code=404, detail=f"No data found for {ticker}")

    data   = risk_info[ticker]
    result = backtest_ticker(ticker, data, allocated_cash=1000.0)
    output = {k: v for k, v in result.items() if k != "enriched_data"}

    return {"status": "ok", "stock": output}



#  MAIN ANALYSIS ENDPOINT


@app.post("/api/run")
def run_analysis(req: RunRequest):
    total_pct = sum(req.allocations.values())
    if abs(total_pct - 100) > 0.01:
        raise HTTPException(status_code=400,
            detail=f"Allocations sum to {total_pct:.2f}%, must equal 100%.")

    for ticker in req.tickers:
        if ticker.upper() not in [t.upper() for t in req.allocations]:
            raise HTTPException(status_code=400,
                detail=f"Ticker {ticker} has no allocation provided.")

    for ticker, pct in req.allocations.items():
        if pct <= 0:
            raise HTTPException(status_code=400,
                detail=f"{ticker.upper()} has 0% allocation. Every stock must have a positive allocation.")

    tickers     = [t.upper() for t in req.tickers]
    allocations = {k.upper(): v for k, v in req.allocations.items()}

    risk_info, failed = fetch_ticker_data(tickers, horizon_days=req.horizon_days)
    if not risk_info:
        raise HTTPException(status_code=400,
            detail=f"No valid data returned for any ticker. Failed: {failed}")

    valid_tickers   = list(risk_info.keys())
    allocated_total = sum(req.total_cash * (allocations[t] / 100) for t in valid_tickers)
    weights         = {t: (req.total_cash * (allocations[t] / 100)) / allocated_total
                       for t in valid_tickers}

    backtest_results = []
    for ticker in valid_tickers:
        result = backtest_ticker(ticker, risk_info[ticker],
                                 req.total_cash * (allocations[ticker] / 100))
        backtest_results.append(result)

    total_final_balance = sum(r["final_balance"] or 0 for r in backtest_results)
    portfolio           = run_portfolio_risk(backtest_results, weights)
    monte_carlo         = run_monte_carlo(
        portfolio_daily=portfolio["portfolio_daily"],
        allocated_total=allocated_total,
        horizon_days=req.horizon_days,
    )

    assets_output    = [{k: v for k, v in r.items() if k != "enriched_data"}
                        for r in backtest_results]
    portfolio_output = {k: v for k, v in portfolio.items() if k != "portfolio_daily"}

    return {
        "status": "ok",
        "meta": {
            "tickers":         valid_tickers,
            "failed_tickers":  failed,
            "total_cash":      req.total_cash,
            "allocated_total": round(allocated_total, 2),
            "final_balance":   round(total_final_balance, 2),
            "profit_dollars":  round(total_final_balance - allocated_total, 2),
            "profit_pct":      round((total_final_balance - allocated_total)
                                     / allocated_total * 100, 3),
        },
        "assets":      assets_output,
        "portfolio":   portfolio_output,
        "monte_carlo": monte_carlo,
    }



#  OPTIMISER ENDPOINT


class OptimiseRequest(BaseModel):
    tickers: list[str]

@app.post("/api/optimise")
def optimise_portfolio(req: OptimiseRequest):
    tickers = [t.upper() for t in req.tickers]

    if len(tickers) < 2:
        raise HTTPException(status_code=400,
            detail="Need at least 2 tickers to optimise.")

    risk_info, failed = fetch_ticker_data(tickers)
    valid = [t for t in tickers if t in risk_info]

    if len(valid) < 2:
        raise HTTPException(status_code=400,
            detail=f"Not enough valid data. Failed: {failed}")

    try:
        result = run_optimiser(risk_info, valid)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "ok", "failed": failed, **result}