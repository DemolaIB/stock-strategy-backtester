import yfinance as yf
import numpy as np
import pandas as pd
import math


#  PHASE 1 — FETCH DATA


def _days_to_period(days: int) -> str:
    """Map a number of trading days to the nearest yfinance period string."""
    if days <= 63:   return "3mo"
    if days <= 126:  return "6mo"
    if days <= 252:  return "1y"
    if days <= 504:  return "2y"
    return "5y"


def fetch_ticker_data(tickers: list[str], horizon_days: int = 252) -> dict:
    """
    Takes a list of ticker strings and an optional horizon in trading days.
    Fetches enough historical data to cover the backtest period.
    Returns a dict of { ticker: DataFrame } for every ticker
    that returned valid data, and a list of any that failed.
    """
    period    = _days_to_period(horizon_days)
    risk_info = {}
    failed    = []

    for ticker in tickers:
        stock = yf.Ticker(ticker)
        data  = stock.history(period=period)

        if data.empty:
            failed.append(ticker)
            continue

        data['Daily Return'] = data['Close'].pct_change()
        risk_info[ticker]    = data

    return risk_info, failed


#  PHASE 1 & 2 — BACKTEST A SINGLE TICKER


def backtest_ticker(ticker: str, data: pd.DataFrame, allocated_cash: float) -> dict:
    """
    Runs the MA crossover backtest on one ticker.
    Returns a dict of all per-asset metrics.
    """
    data = data.copy()

    # ── Moving averages ───────────────────────────────────────────────────────
    data['MA7']  = data['Close'].rolling(window=7).mean()
    data['MA30'] = data['Close'].rolling(window=30).mean()

    # ── Crossover signals ─────────────────────────────────────────────────────
    data['Signal'] = 0
    data.loc[
        (data['MA7'] > data['MA30']) & (data['MA7'].shift(1) <= data['MA30'].shift(1)),
        'Signal'
    ] = 1
    data.loc[
        (data['MA7'] < data['MA30']) & (data['MA7'].shift(1) >= data['MA30'].shift(1)),
        'Signal'
    ] = -1
    data['Signal'] = data['Signal'].shift(1).fillna(0)

    # ── Build position history ────────────────────────────────────────────────
    data['Position'] = 0
    position = 0
    for i, row in data.iterrows():
        if row['Signal'] == 1:
            position = 1
        elif row['Signal'] == -1:
            position = 0
        data.at[i, 'Position'] = position

    # ── Strategy daily returns ────────────────────────────────────────────────
    data['Strategy Return'] = data['Daily Return'] * data['Position'].shift(1)
    strategy_returns        = data['Strategy Return'].dropna()

    # ── Sharpe Ratio ──────────────────────────────────────────────────────────
    sharpe = (float(strategy_returns.mean() / strategy_returns.std() * (252 ** 0.5))
              if strategy_returns.std() != 0 else None)

    # ── Sortino Ratio ─────────────────────────────────────────────────────────
    downside     = strategy_returns[strategy_returns < 0]
    downside_std = downside.std(ddof=0)
    sortino      = (float(strategy_returns.mean() / downside_std * (252 ** 0.5))
                    if downside_std != 0 and len(downside) > 0 else None)

    # ── Trade simulation ──────────────────────────────────────────────────────
    cash         = allocated_cash
    position     = 0
    shares       = 0
    trade_returns = []
    entry_price  = None

    for i, row in data.iterrows():
        if row['Signal'] == 1 and position == 0:
            entry_price = row['Close']
            shares      = cash / row['Close']
            cash        = 0
            position    = 1
        elif row['Signal'] == -1 and position == 1:
            exit_price  = row['Close']
            cash        = shares * exit_price
            trade_returns.append((exit_price - entry_price) / entry_price)
            position    = 0
            shares      = 0
            entry_price = None

    win_rate = (sum(1 for r in trade_returns if r > 0) / len(trade_returns) * 100
                if trade_returns else None)

    final_balance = cash + (shares * data['Close'].iloc[-1])

    # Guard against zero allocated_cash (e.g. when optimiser sets a weight to 0%)
    if allocated_cash > 0:
        profit_pct           = (final_balance - allocated_cash) / allocated_cash * 100
        benchmark_final      = (allocated_cash / data['Close'].iloc[0]) * data['Close'].iloc[-1]
        benchmark_return_pct = (benchmark_final - allocated_cash) / allocated_cash * 100
        alpha_pct            = profit_pct - benchmark_return_pct
    else:
        profit_pct           = 0.0
        benchmark_return_pct = 0.0
        alpha_pct            = 0.0

    # ── Per-asset volatility and drawdown ─────────────────────────────────────
    close    = data['Close'].dropna()
    peak     = close.cummax()
    drawdown = (close - peak) / peak
    max_drop = float(drawdown.min() * 100)
    volatility = float(data['Daily Return'].std() * (252 ** 0.5) * 100)

    # ── Drawdown series for chart (dates as strings, values as floats) ────────
    drawdown_series = {
        str(date.date()): round(float(val * 100), 4)
        for date, val in drawdown.items()
    }

    # ── Price series for chart ────────────────────────────────────────────────
    price_series = {
        str(date.date()): round(float(val), 4)
        for date, val in data['Close'].items()
    }
    ma7_series = {
        str(date.date()): round(float(val), 4)
        for date, val in data['MA7'].dropna().items()
    }
    ma30_series = {
        str(date.date()): round(float(val), 4)
        for date, val in data['MA30'].dropna().items()
    }

    def safe(v, digits=3):
        """Convert NaN/Inf to None so JSON serialisation never fails."""
        if v is None:
            return None
        try:
            f = float(v)
            return None if (math.isnan(f) or math.isinf(f)) else round(f, digits)
        except (TypeError, ValueError):
            return None

    return {
        "ticker":            ticker,
        "sharpe":            safe(sharpe),
        "sortino":           safe(sortino),
        "win_rate":          safe(win_rate, 2),
        "strategy_return":   safe(profit_pct, 3),
        "benchmark_return":  safe(benchmark_return_pct, 3),
        "alpha":             safe(alpha_pct, 3),
        "volatility":        safe(volatility, 3),
        "max_drawdown":      safe(max_drop, 3),
        "allocated":         safe(allocated_cash, 2),
        "final_balance":     safe(final_balance, 2),
        "num_signals":       int((data['Signal'] != 0).sum()),
        "completed_trades":  len(trade_returns),
        "invested_days":     int(data['Position'].sum()),
        "price_series":      price_series,
        "ma7_series":        ma7_series,
        "ma30_series":       ma30_series,
        "drawdown_series":   drawdown_series,
        "enriched_data":     data,   # kept in memory for Phase 3, not sent to React
    }


#  PHASE 3 — PORTFOLIO RISK ENGINE


def run_portfolio_risk(backtest_results: list[dict], weights: dict) -> dict:
    """
    Takes the list of per-asset backtest result dicts and the weights dict.
    Returns portfolio-level metrics and the correlation matrix.
    """
    # Build aligned daily-returns DataFrame
    returns_list = []
    for result in backtest_results:
        ticker = result['ticker']
        temp   = result['enriched_data'][['Daily Return']].copy()
        temp   = temp.rename(columns={'Daily Return': ticker})
        returns_list.append(temp)

    portfolio_df = returns_list[0]
    for df in returns_list[1:]:
        portfolio_df = portfolio_df.join(df, how='inner')
    portfolio_df = portfolio_df.dropna()

    tickers_in_order = [r['ticker'] for r in backtest_results]

    # ── Weighted portfolio daily return ───────────────────────────────────────
    weight_array  = np.array([weights[t] for t in tickers_in_order])
    asset_returns = portfolio_df[tickers_in_order].values
    portfolio_df['Portfolio Return'] = asset_returns @ weight_array

    portfolio_daily = portfolio_df['Portfolio Return']

    # ── Volatility ────────────────────────────────────────────────────────────
    portfolio_volatility = float(portfolio_daily.std() * (252 ** 0.5) * 100)

    # ── Cumulative return ─────────────────────────────────────────────────────
    portfolio_cumulative  = (1 + portfolio_daily).cumprod()
    portfolio_total_return = float((portfolio_cumulative.iloc[-1] - 1) * 100)

    # ── Maximum drawdown ──────────────────────────────────────────────────────
    rolling_peak       = portfolio_cumulative.cummax()
    portfolio_drawdown = (portfolio_cumulative - rolling_peak) / rolling_peak
    portfolio_max_dd   = float(portfolio_drawdown.min() * 100)

    # Sharpe 
    portfolio_sharpe = (float(portfolio_daily.mean() / portfolio_daily.std() * (252 ** 0.5))
                        if portfolio_daily.std() != 0 else None)

    # Correlation matrix 
    corr_data = None
    avg_corr  = None
    div_note  = None

    if len(tickers_in_order) > 1:
        corr_matrix = portfolio_df[tickers_in_order].corr()

        # Convert to a plain dict for JSON serialisation
        corr_data = {
            ticker: {
                other: round(float(corr_matrix.loc[ticker, other]), 3)
                for other in tickers_in_order
            }
            for ticker in tickers_in_order
        }

        _avg_raw = corr_matrix.where(~np.eye(len(corr_matrix), dtype=bool)).stack().mean()
        avg_corr = float(_avg_raw) if not (math.isnan(float(_avg_raw))) else 0.0

        if avg_corr > 0.7:
            div_note = "High correlation — limited diversification benefit."
        elif avg_corr > 0.4:
            div_note = "Moderate correlation — some diversification benefit."
        else:
            div_note = "Low correlation — good diversification across assets."

    # Portfolio drawdown series for chart 
    drawdown_series = {
        str(date.date()): round(float(val * 100), 4)
        for date, val in portfolio_drawdown.items()
    }

    def safe_float(v, d=3):
        try:
            f = float(v)
            return None if (math.isnan(f) or math.isinf(f)) else round(f, d)
        except Exception:
            return None

    return {
        "volatility":        safe_float(portfolio_volatility, 3),
        "total_return":      safe_float(portfolio_total_return, 3),
        "max_drawdown":      safe_float(portfolio_max_dd, 3),
        "sharpe":            safe_float(portfolio_sharpe, 3),
        "correlation":       corr_data,
        "avg_correlation":   round(avg_corr, 3) if avg_corr is not None else None,
        "diversification":   div_note,
        "drawdown_series":   drawdown_series,
        "portfolio_daily":   portfolio_daily,  # kept in memory for Phase 4
    }


#  PHASE 4 — MONTE CARLO SIMULATION

def run_monte_carlo(portfolio_daily: pd.Series, allocated_total: float,
                    horizon_days: int = 252, n_simulations: int = 1000) -> dict:
    """
    Runs Monte Carlo simulation on the portfolio's daily return series.
    Returns outcome statistics and the percentile paths for charting.
    """
    mc_mean = float(portfolio_daily.mean())
    mc_std  = float(portfolio_daily.std())

    np.random.seed(42)

    random_returns = np.random.normal(
        loc=mc_mean, scale=mc_std,
        size=(horizon_days, n_simulations)
    )

    # Build price paths — shape: (horizon_days + 1, n_simulations)
    price_paths    = np.ones((horizon_days + 1, n_simulations))
    for t in range(1, horizon_days + 1):
        price_paths[t] = price_paths[t - 1] * (1 + random_returns[t - 1])

    final_values = price_paths[-1] * allocated_total

    worst_value  = float(np.percentile(final_values, 5))
    median_value = float(np.percentile(final_values, 50))
    best_value   = float(np.percentile(final_values, 95))

    prob_of_loss   = float((final_values < allocated_total).mean() * 100)
    prob_of_double = float((final_values >= allocated_total * 2).mean() * 100)

    worst_return  = (worst_value  / allocated_total - 1) * 100
    median_return = (median_value / allocated_total - 1) * 100
    best_return   = (best_value   / allocated_total - 1) * 100

    if prob_of_loss < 20:
        risk_label = "relatively low risk"
    elif prob_of_loss < 40:
        risk_label = "moderate risk"
    else:
        risk_label = "high risk"

    summary = (
        f"Based on {n_simulations:,} simulated scenarios, this portfolio carries {risk_label}. "
        f"In {100 - prob_of_loss:.0f}% of simulations it ended in profit after {horizon_days} trading days. "
        f"The middle outcome projects a portfolio value of ${median_value:,.0f}."
    )

    # Percentile paths for the fan chart (sampled every day) 
    days = list(range(horizon_days + 1))
    fan_chart = {
        "days": days,
        "p5":   [round(float(v * allocated_total), 2) for v in np.percentile(price_paths, 5,  axis=1)],
        "p25":  [round(float(v * allocated_total), 2) for v in np.percentile(price_paths, 25, axis=1)],
        "p50":  [round(float(v * allocated_total), 2) for v in np.percentile(price_paths, 50, axis=1)],
        "p75":  [round(float(v * allocated_total), 2) for v in np.percentile(price_paths, 75, axis=1)],
        "p95":  [round(float(v * allocated_total), 2) for v in np.percentile(price_paths, 95, axis=1)],
    }

    # Histogram data for the distribution chart 
    hist_counts, hist_edges = np.histogram(final_values, bins=40)
    histogram = {
        "counts": hist_counts.tolist(),
        "edges":  [round(float(e), 2) for e in hist_edges.tolist()],
    }

    return {
        "n_simulations":   n_simulations,
        "horizon_days":    horizon_days,
        "starting_capital": round(allocated_total, 2),
        "worst":           round(worst_value,  2),
        "median":          round(median_value, 2),
        "best":            round(best_value,   2),
        "worst_return":    round(worst_return,  1),
        "median_return":   round(median_return, 1),
        "best_return":     round(best_return,   1),
        "prob_of_loss":    round(prob_of_loss,   1),
        "prob_of_double":  round(prob_of_double, 1),
        "risk_label":      risk_label,
        "summary":         summary,
        "fan_chart":       fan_chart,
        "histogram":       histogram,
    }


#  PHASE 6 — PORTFOLIO OPTIMISER


def run_optimiser(risk_info: dict, tickers: list) -> dict:
    """
    Mean-Variance Optimisation (Markowitz).
    Returns Max Sharpe, Min Volatility, Equal Weight portfolios
    plus efficient frontier points for charting.
    """
    from scipy.optimize import minimize

    # Build aligned daily returns matrix
    returns_list  = []
    valid_tickers = []
    for t in tickers:
        if t not in risk_info:
            continue
        daily = risk_info[t]['Daily Return'].dropna()
        returns_list.append(daily.rename(t))
        valid_tickers.append(t)

    if len(valid_tickers) < 2:
        raise ValueError("Need at least 2 valid tickers to optimise.")

    returns_df   = pd.concat(returns_list, axis=1).dropna()
    n            = len(valid_tickers)
    mean_returns = returns_df.mean() * 252          # annualised
    cov_matrix   = returns_df.cov()  * 252          # annualised

    def portfolio_performance(w):
        ret    = float(np.dot(w, mean_returns))
        vol    = float(np.sqrt(w @ cov_matrix.values @ w))
        sharpe = ret / vol if vol != 0 else 0.0
        return ret, vol, sharpe

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    bounds      = tuple((0.0, 1.0) for _ in range(n))
    w0          = np.array([1 / n] * n)

    # Maximum Sharpe
    res_s  = minimize(lambda w: -portfolio_performance(w)[2],
                      w0, method="SLSQP", bounds=bounds,
                      constraints=constraints,
                      options={"maxiter": 1000, "ftol": 1e-9})
    w_s    = res_s.x
    ret_s, vol_s, sr_s = portfolio_performance(w_s)

    # Minimum Volatility
    res_v  = minimize(lambda w: portfolio_performance(w)[1],
                      w0, method="SLSQP", bounds=bounds,
                      constraints=constraints,
                      options={"maxiter": 1000, "ftol": 1e-9})
    w_v    = res_v.x
    ret_v, vol_v, sr_v = portfolio_performance(w_v)

    # Equal Weight
    w_e           = np.array([1 / n] * n)
    ret_e, vol_e, sr_e = portfolio_performance(w_e)

    # Efficient frontier — 50 points sweeping from min-vol return to max return
    frontier = []
    for target in np.linspace(ret_v, float(mean_returns.max()), 50):
        ef_constraints = [
            {"type": "eq", "fun": lambda w: np.sum(w) - 1},
            {"type": "eq", "fun": lambda w, t=target: np.dot(w, mean_returns) - t},
        ]
        res_ef = minimize(lambda w: portfolio_performance(w)[1],
                          w0, method="SLSQP", bounds=bounds,
                          constraints=ef_constraints,
                          options={"maxiter": 500, "ftol": 1e-8})
        if res_ef.success:
            r, v, s = portfolio_performance(res_ef.x)
            frontier.append({"vol": round(v*100,3), "ret": round(r*100,3), "sharpe": round(s,3)})

    def weights_to_pct(w):
        raw   = {valid_tickers[i]: round(float(w[i]) * 100, 2) for i in range(n)}
        diff  = round(100 - sum(raw.values()), 2)
        if diff != 0:
            raw[max(raw, key=raw.get)] = round(raw[max(raw, key=raw.get)] + diff, 2)
        return raw

    def build(w, r, v, s):
        return {"weights": weights_to_pct(w), "return": round(r*100,2),
                "volatility": round(v*100,2), "sharpe": round(s,3)}

    return {
        "tickers":        valid_tickers,
        "max_sharpe":     build(w_s, ret_s, vol_s, sr_s),
        "min_volatility": build(w_v, ret_v, vol_v, sr_v),
        "equal_weight":   build(w_e, ret_e, vol_e, sr_e),
        "frontier":       frontier,
    }