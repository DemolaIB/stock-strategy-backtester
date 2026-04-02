import yfinance as yf
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np


# ─────────────────────────────────────────────
#  INPUT
# ─────────────────────────────────────────────

tickers = input("Enter stock ticker(s) (comma-separated, e.g., AAPL,TSLA): ").upper().replace(' ', '').split(',')

risk_info = {}

for ticker in tickers:
    stock = yf.Ticker(ticker) # Creates a ticker object for each ticker
    data = stock.history(period='1y') # Gets the open, high, low, close and volume for each of the ticker
    if data.empty:
        print(f"\n{ticker}: No data available. Skipping.") # If ticker does not exist, skip
        continue

    data['Daily Return'] = data['Close'].pct_change() # Calculates the percentage change in closing price, the first row will have NaN as there is no previous day to compare it to.
    volatility = data['Daily Return'].std() * (252 ** 0.5) # Calculates the standard deviation of daily returns then mutiplies sqrt of 252 (252 trading days in a year)
    close = data['Close'].dropna() # Takes the closing price column and gets rid of any NaN values.
    peak = close.cummax() # The cumulative maximum price over the course of the year
    drawdown = (close - peak) / peak
    max_drop = drawdown.min() * 100

    print(f"\n{ticker}: Annual Volatility:    {volatility:.3%}")
    print(f"{ticker}: Maximum Price Drop:   {max_drop:.3f}%")

    risk_info[ticker] = data # Saves all tickers data inside the dictionary


# ─────────────────────────────────────────────
#  CAPITAL ALLOCATION
# ─────────────────────────────────────────────

total_cash = float(input("\nEnter total cash available: "))
allocation = {}
pct_list = []

print("\nEnter allocation percentage for each stock (must add up to 100):")
valid_tickers = list(risk_info.keys())
for ticker in valid_tickers:
    pct = float(input(f"  {ticker} %: "))
    pct_list.append(pct)
    allocation[ticker] = total_cash * (pct / 100)

if abs(sum(pct_list) - 100) > 1e-6:
    print(f"Allocations add up to {sum(pct_list):.2f}%, not 100%. Exiting...")
    exit()

allocated_total = sum(allocation.values())
weights = {ticker: allocation[ticker] / allocated_total for ticker in allocation} # loop through every ticker in allocation, the money allocated to that ticker is allocation[ticker], divide that amount by allocated_total, save as weight of that stock in the portfolio


#  BACKTESTING + PER-ASSET METRICS  (Phase 1 & 2)

total_final_balance = 0

for ticker, cash in allocation.items():
    data = risk_info[ticker]

    # Moving averages
    data['MA7']  = data['Close'].rolling(window=7).mean()
    data['MA30'] = data['Close'].rolling(window=30).mean()

    # Crossover signals
    data['Signal'] = 0
    data.loc[
        (data['MA7'] > data['MA30']) & (data['MA7'].shift(1) <= data['MA30'].shift(1)),
        'Signal'
    ] = 1
    data.loc[
        (data['MA7'] < data['MA30']) & (data['MA7'].shift(1) >= data['MA30'].shift(1)),
        'Signal'
    ] = -1

    data['Signal'] = data['Signal'].shift(1).fillna(0) # shifts the signal column by 1 day, so trades are made on yesterdays crossover signals

    # Build position
    data['Position'] = 0
    position = 0
    for i, row in data.iterrows(): # iterrows produces pairs of index and rows
        if row['Signal'] == 1:
            position = 1 # code for invested
        elif row['Signal'] == -1:
            position = 0 # code for sell
        data.at[i, 'Position'] = position # updates the next position cell

    # Strategy daily returns
    data['Strategy Return'] = data['Daily Return'] * data['Position'].shift(1) # calculates the return made per day using the signal, returning 0 (from Position) if you were in cash. The shift(1) allows us to compare the position to the one from yesterday
    strategy_returns = data['Strategy Return'].dropna() # drops all the NaN

    # Sharpe Ratio
    sharpe = (strategy_returns.mean() / strategy_returns.std() * (252 ** 0.5) # mean return divided by its standard deviation then annualized with sqrt(252)
              if strategy_returns.std() != 0 else float('nan')) # returns Nan if divided by 0, to prevent errors

    # Sortino Ratio
    downside = strategy_returns[strategy_returns < 0] # this filters to only negative return days
    downside_std = downside.std(ddof=0)
    sortino = (strategy_returns.mean() / downside_std * (252 ** 0.5)
               if downside_std != 0 and len(downside) > 0 else float('nan')) # same formula as the sharpe ratio

    # Trade simulation
    # position is used to track whether in a trade or not, shares tracks how many shares you hold, trade_returns collects the return % completed after a trade cycle, entry_price remembers what price you bought it at.
    position = 0
    shares = 0
    trade_returns = []
    entry_price = None

    for i, row in data.iterrows(): # Used to iterate over the DataFrame rows as (index, series)
        # On a buy signal if you don't have shares, store the entry price in entry_price list, calculate and store how many shares you can buy with the cash allocated for it, then finally mark yourself as invested (1)
        if row['Signal'] == 1 and position == 0:
            entry_price = row['Close']
            shares = cash / row['Close']
            cash = 0
            position = 1
        elif row['Signal'] == -1 and position == 1:
            # On a sell signal, and you are invested, record the exit price, convert the shares back to cash, calculate the return for the trade as a decimal and added to the list, reset everything after
            exit_price = row['Close']
            cash = shares * exit_price
            trade_returns.append((exit_price - entry_price) / entry_price)
            position = 0
            shares = 0
            entry_price = None

    # Count how many completed trades had a positive return divided by the total trades then changes to percentage
    win_rate = (sum(1 for r in trade_returns if r > 0) / len(trade_returns) * 100
                if trade_returns else float('nan')) # this handles any division be zero error

    # After the loop ends, if you are still holding shares, calculate the value of the shares: shares and the last price hence [-1], then the product is added to cash which is 0 right now
    # if you exited cleanly then cash holds everything, either way the calculates the total final balance is calculated accurately
    final_balance  = cash + (shares * data['Close'].iloc[-1])
    total_final_balance += final_balance

    # Calculates the final balance - allocated amount for the ticker and converts into pct.
    profit_pct = (final_balance - allocation[ticker]) / allocation[ticker] * 100

    # Buy & Hold benchmark
    # Calculates benchmark by calculating how many shares that could be bought on day 1 then calculates the worth of the shares on the last day
    benchmark_final = (allocation[ticker] / data['Close'].iloc[0]) * data['Close'].iloc[-1]
    # Compute its return percentage and find the difference between the return percentage using my signal compared to the benchmark, positive difference means the strategy beats passive holding (
    benchmark_return_pct = (benchmark_final - allocation[ticker]) / allocation[ticker] * 100
    alpha_pct = profit_pct - benchmark_return_pct

    invested_days = data['Position'].sum() # this sums up all the days the position was 1 (invested)
    num_signals = (data['Signal'] != 0).sum() # this sums up when the signal was either buy (1) or sell (-1)
    completed_trades = len(trade_returns) # counts completed buy + sell pairs

    # prints values
    print(f"\n{'─'*50}")
    print(f"  {ticker}")
    print(f"{'─'*50}")
    print(f"  Sharpe Ratio:        {sharpe:.3f}")
    print(f"  Sortino Ratio:       {sortino:.3f}")
    print(f"  Win Rate:            {win_rate:.2f}%")
    print(f"  Strategy Return:     {profit_pct:.3f}%")
    print(f"  Buy & Hold Return:   {benchmark_return_pct:.3f}%")
    print(f"  Alpha vs B&H:        {alpha_pct:+.3f}%")
    print(f"  Signals:             {num_signals}  |  Trades: {completed_trades}  |  Invested Days: {int(invested_days)}")
    print(f"  Allocated:           ${allocation[ticker]:,.2f}  →  Final: ${final_balance:,.2f}")

    # saves the new data in columns and saves the in a csv file and updates the version back into risk_info
    data.to_csv(f"{ticker}_data.csv")
    risk_info[ticker] = data   # save enriched data back


#  OVERALL PORTFOLIO SUMMARY

profit_dollars  = total_final_balance - allocated_total
profit_pct_ovr  = profit_dollars / allocated_total * 100

print(f"\n{'═'*50}")
print(f"  PORTFOLIO SUMMARY")
print(f"{'═'*50}")
print(f"  Allocated Total:     ${allocated_total:,.2f}")
print(f"  Final Value:         ${total_final_balance:,.2f}")
print(f"  Profit / Loss:       ${profit_dollars:,.2f}  ({profit_pct_ovr:+.3f}%)")


# ─────────────────────────────────────────────
#  PHASE 3 — PORTFOLIO RISK ENGINE
# ─────────────────────────────────────────────

print(f"\n{'═'*50}")
print(f"  PORTFOLIO RISK ENGINE  (Phase 3)")
print(f"{'═'*50}")

# Build aligned daily-returns dataframe
returns_list = []
# For each ticker, it grabs the Daily Return and makes a copy so it does not affect the original, each result goes into the list
for ticker in allocation.keys():
    temp = risk_info[ticker][['Daily Return']].copy().rename(columns={'Daily Return': ticker})
    returns_list.append(temp)

# saves the very first daily return in portfolio_returns_df, then joins all the other daily return values, that exist (how = inner)
portfolio_returns_df = returns_list[0]
for df in returns_list[1:]:
    portfolio_returns_df = portfolio_returns_df.join(df, how='inner')
# cleans up ask remaining gaps
portfolio_returns_df = portfolio_returns_df.dropna()

# ── Portfolio Daily Return (weighted blend) ──────────────────────────────────
weight_array = np.array([weights[t] for t in allocation.keys()]) # Creates a numpy array of weights of the tickets in order
asset_returns = portfolio_returns_df[list(allocation.keys())].values # Grabs the column with stock returns and converts them into a numpy matrix, .values strips away the dates and column name only leaving the raw numbers for numpy
portfolio_returns_df['Portfolio Return'] = asset_returns @ weight_array # Matrix multiplication between the weights and the asset_returns

portfolio_daily = portfolio_returns_df['Portfolio Return'] # extracts the portfolio daily return as a series (which is a one-dimensional labeled array in pandas)

# ── Portfolio Annual Volatility ───────────────────────────────────────────────
portfolio_volatility = portfolio_daily.std() * (252 ** 0.5) # annualizes the daily portfolio return

# ── Portfolio Cumulative Return ───────────── ──────────────────────────────────
# Converts the 0.xxx portfolio daily return to 1.xxx, compounds then multiplies them, building a running portfolio value index starting at 1.0
# Then it finds the last portfolio value index subtracts 1, then changes to %
portfolio_cumulative = (1 + portfolio_daily).cumprod()
portfolio_total_return = (portfolio_cumulative.iloc[-1] - 1) * 100

# ── Portfolio Maximum Drawdown ────────────────────────────────────────────────
rolling_peak        = portfolio_cumulative.cummax() # peak of portfolio value index
portfolio_drawdown  = (portfolio_cumulative - rolling_peak) / rolling_peak # finds the maximum drawdown day by day
portfolio_max_dd    = portfolio_drawdown.min() * 100 # finds the minimum of the max drawdown and converts to %

# ── Portfolio Sharpe Ratio ────────────────────────────────────────────────────
portfolio_sharpe = (portfolio_daily.mean() / portfolio_daily.std() * (252 ** 0.5)
                    if portfolio_daily.std() != 0 else float('nan'))

print(f"  Annual Volatility:   {portfolio_volatility:.3%}")
print(f"  Total Return:        {portfolio_total_return:+.3f}%")
print(f"  Maximum Drawdown:    {portfolio_max_dd:.3f}%")
print(f"  Sharpe Ratio:        {portfolio_sharpe:.3f}")

# ── Correlation Matrix ────────────────────────────────────────────────────────
if len(allocation) > 1: # if there is more than 1 asset in the portfolio
    corr_matrix = portfolio_returns_df[list(allocation.keys())].corr() # get the ticker names, select their respective columns, then .corr, computes the pairwise Pearson correlations between columns. High correlation (0.92) means less diversification like goog and msft, and low correlation (0.1) means more diversification like goog and gold etf
    # The pairwise pearson correlation is a statistical measure which tells you how strongly 2 variables move together linearly.

    print(f"\n  Asset Correlation Matrix:")
    print(f"  (1.0 = move together, -1.0 = move opposite, ~0 = uncorrelated)\n")
    print(corr_matrix.round(3).to_string())

    # Diversification note
    avg_corr = corr_matrix.where(
        ~np.eye(len(corr_matrix), dtype=bool)
    ).stack().mean()

    if avg_corr > 0.7:
        div_note = "High correlation — limited diversification benefit."
    elif avg_corr > 0.4:
        div_note = "Moderate correlation — some diversification benefit."
    else:
        div_note = "Low correlation — good diversification across assets."

    print(f"\n  Avg Pairwise Correlation: {avg_corr:.3f}  →  {div_note}")
else:
    print("\n  (Correlation matrix requires 2+ assets)")


# ─────────────────────────────────────────────
#  PHASE 4 — MONTE CARLO SIMULATION ENGINE
# ─────────────────────────────────────────────

print(f"\n{'═'*50}")
print(f"  MONTE CARLO SIMULATION  (Phase 4)")
print(f"{'═'*50}")

N_SIMULATIONS = 1000
N_DAYS        = 252   # 1 trading year forward

# Derive drift and volatility from historical portfolio daily returns
mc_mean  = portfolio_daily.mean()
mc_std   = portfolio_daily.std()

# Ask user how much they want to project forward
try:
    horizon_input = input("\n  How many trading days to simulate forward? (press Enter for 252 / 1 year): ").strip()
    N_DAYS = int(horizon_input) if horizon_input else 252
except ValueError:
    N_DAYS = 252

print(f"\n  Running {N_SIMULATIONS:,} simulations over {N_DAYS} trading days...")

np.random.seed(42)  # reproducible results

# Each simulation: compound daily returns sampled from a normal distribution
# Shape: (N_DAYS, N_SIMULATIONS)
random_returns = np.random.normal(loc=mc_mean, scale=mc_std, size=(N_DAYS, N_SIMULATIONS))

# Build cumulative growth paths starting at 1.0
# Each column is one simulated portfolio value path
price_paths = np.ones((N_DAYS + 1, N_SIMULATIONS))
for t in range(1, N_DAYS + 1):
    price_paths[t] = price_paths[t - 1] * (1 + random_returns[t - 1])

# Final portfolio values across all simulations
final_values     = price_paths[-1] * allocated_total
final_returns    = (price_paths[-1] - 1) * 100   # as %

# ── Key outcome statistics ────────────────────────────────────────────────────
worst_value    = np.percentile(final_values, 5)     # 5th percentile (tail risk)
best_value     = np.percentile(final_values, 95)    # 95th percentile
median_value   = np.percentile(final_values, 50)
mean_value     = final_values.mean()

worst_return   = (worst_value  / allocated_total - 1) * 100
best_return    = (best_value   / allocated_total - 1) * 100
median_return  = (median_value / allocated_total - 1) * 100

prob_of_loss   = (final_values < allocated_total).mean() * 100
prob_of_double = (final_values >= allocated_total * 2).mean() * 100

print(f"\n  Starting Capital:    ${allocated_total:>12,.2f}")
print(f"  ─────────────────────────────────")
print(f"  Worst Case  (5th %): ${worst_value:>12,.2f}   ({worst_return:+.1f}%)")
print(f"  Median      (50th ): ${median_value:>12,.2f}   ({median_return:+.1f}%)")
print(f"  Best Case  (95th %): ${best_value:>12,.2f}   ({best_return:+.1f}%)")
print(f"  ─────────────────────────────────")
print(f"  Probability of Loss:    {prob_of_loss:.1f}%")
print(f"  Probability of 2x:      {prob_of_double:.1f}%")

# Plain-language risk summary
print(f"\n  Plain-Language Summary:")
if prob_of_loss < 20:
    risk_label = "relatively low risk"
elif prob_of_loss < 40:
    risk_label = "moderate risk"
else:
    risk_label = "high risk"

print(f"  Based on {N_SIMULATIONS:,} simulated scenarios, this portfolio carries {risk_label}.")
print(f"  In {100 - prob_of_loss:.0f}% of simulations it ended in profit after {N_DAYS} trading days.")
print(f"  The middle outcome (median) projects a portfolio value of ${median_value:,.0f}.")


# ─────────────────────────────────────────────
#  CHARTS  (2 figures)
# ─────────────────────────────────────────────

# ── Figure 1: Portfolio Overview (Phase 3 charts) ────────────────────────────
num_assets = len(risk_info)
has_corr   = num_assets > 1

fig_cols = 3 if has_corr else 2
fig1, axes = plt.subplots(1, fig_cols, figsize=(7 * fig_cols, 6))
if fig_cols == 1:
    axes = [axes]

# Chart 1: Price + MAs
ax1 = axes[0]
for ticker, data in risk_info.items():
    ax1.plot(data.index, data['Close'], label=f'{ticker}', linewidth=1.5)
    ax1.plot(data.index, data['MA7'],  linestyle='--', linewidth=0.8, alpha=0.6)
    ax1.plot(data.index, data['MA30'], linestyle=':',  linewidth=0.8, alpha=0.6)
ax1.set_title('Price & Moving Averages', fontweight='bold')
ax1.set_xlabel('Date')
ax1.set_ylabel('Price ($)')
ax1.legend(fontsize=8)
ax1.tick_params(axis='x', rotation=30)

# Chart 2: Portfolio Drawdown
ax2 = axes[1]
ax2.fill_between(portfolio_drawdown.index, portfolio_drawdown * 100, 0,
                 color='crimson', alpha=0.4, label='Drawdown')
ax2.plot(portfolio_drawdown.index, portfolio_drawdown * 100, color='crimson', linewidth=1)
ax2.axhline(portfolio_max_dd, color='darkred', linestyle='--', linewidth=1,
            label=f'Max DD: {portfolio_max_dd:.2f}%')
ax2.set_title('Portfolio Drawdown', fontweight='bold')
ax2.set_xlabel('Date')
ax2.set_ylabel('Drawdown (%)')
ax2.legend(fontsize=8)
ax2.tick_params(axis='x', rotation=30)

# Chart 3: Correlation Heatmap
if has_corr:
    ax3 = axes[2]
    corr_vals    = corr_matrix.values
    tickers_list = list(corr_matrix.columns)
    n            = len(tickers_list)

    im = ax3.imshow(corr_vals, cmap='RdYlGn', vmin=-1, vmax=1, aspect='auto')
    plt.colorbar(im, ax=ax3, shrink=0.8)
    ax3.set_xticks(range(n))
    ax3.set_yticks(range(n))
    ax3.set_xticklabels(tickers_list, rotation=45, ha='right', fontsize=9)
    ax3.set_yticklabels(tickers_list, fontsize=9)
    for i in range(n):
        for j in range(n):
            ax3.text(j, i, f"{corr_vals[i, j]:.2f}", ha='center', va='center',
                     fontsize=9, color='black' if abs(corr_vals[i, j]) < 0.7 else 'white')
    ax3.set_title('Asset Correlation Matrix', fontweight='bold')

fig1.suptitle('Risk-Aware Strategy Lab — Portfolio Overview', fontsize=13, fontweight='bold', y=1.01)
fig1.tight_layout()
fig1.savefig('portfolio_overview.png', dpi=150, bbox_inches='tight')

# ── Figure 2: Monte Carlo Fan Chart ──────────────────────────────────────────
fig2, (ax_mc, ax_dist) = plt.subplots(1, 2, figsize=(14, 6))

days_axis = np.arange(N_DAYS + 1)

# Fan chart — plot all paths faintly, then overlay percentile bands
ax_mc.plot(days_axis, price_paths[:, :200] * allocated_total,
           color='steelblue', alpha=0.04, linewidth=0.5)

p5  = np.percentile(price_paths, 5,  axis=1) * allocated_total
p25 = np.percentile(price_paths, 25, axis=1) * allocated_total
p50 = np.percentile(price_paths, 50, axis=1) * allocated_total
p75 = np.percentile(price_paths, 75, axis=1) * allocated_total
p95 = np.percentile(price_paths, 95, axis=1) * allocated_total

ax_mc.fill_between(days_axis, p5,  p95, alpha=0.15, color='steelblue', label='5th–95th %ile')
ax_mc.fill_between(days_axis, p25, p75, alpha=0.25, color='steelblue', label='25th–75th %ile')
ax_mc.plot(days_axis, p50, color='navy',   linewidth=2,   label='Median')
ax_mc.plot(days_axis, p5,  color='crimson', linewidth=1.2, linestyle='--', label='5th %ile (tail risk)')
ax_mc.plot(days_axis, p95, color='green',  linewidth=1.2, linestyle='--', label='95th %ile (best case)')
ax_mc.axhline(allocated_total, color='black', linewidth=1, linestyle=':', label='Starting Capital')

ax_mc.set_title(f'Monte Carlo Simulation\n{N_SIMULATIONS:,} paths over {N_DAYS} trading days', fontweight='bold')
ax_mc.set_xlabel('Trading Days Forward')
ax_mc.set_ylabel('Portfolio Value ($)')
ax_mc.legend(fontsize=8)
ax_mc.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'${x:,.0f}'))

# Distribution of final values
ax_dist.hist(final_values, bins=60, color='steelblue', edgecolor='white', alpha=0.8)
ax_dist.axvline(allocated_total, color='black',  linewidth=1.5, linestyle=':',  label='Starting Capital')
ax_dist.axvline(worst_value,     color='crimson', linewidth=1.5, linestyle='--', label=f'5th %ile  ${worst_value:,.0f}')
ax_dist.axvline(median_value,    color='navy',    linewidth=1.5, linestyle='-',  label=f'Median    ${median_value:,.0f}')
ax_dist.axvline(best_value,      color='green',   linewidth=1.5, linestyle='--', label=f'95th %ile ${best_value:,.0f}')

# Shade loss region
loss_threshold = allocated_total
ax_dist.axvspan(final_values.min(), loss_threshold, alpha=0.08, color='crimson', label=f'Loss zone ({prob_of_loss:.1f}%)')

ax_dist.set_title('Distribution of Final Portfolio Values', fontweight='bold')
ax_dist.set_xlabel('Final Portfolio Value ($)')
ax_dist.set_ylabel('Number of Simulations')
ax_dist.legend(fontsize=8)
ax_dist.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'${x:,.0f}'))

fig2.suptitle('Risk-Aware Strategy Lab — Monte Carlo Analysis', fontsize=13, fontweight='bold')
fig2.tight_layout()
fig2.savefig('monte_carlo.png', dpi=150, bbox_inches='tight')

plt.show()
print("\nCharts saved: portfolio_overview.png  |  monte_carlo.png")