import yfinance as yf
import matplotlib.pyplot as plt


# Getting input from user
tickers = input("Enter stock ticker(s) (comma-separated, e.g., AAPL,TSLA): ").upper().split(',')

risk_info = {}

for ticker in tickers:
    stock = yf.Ticker(ticker)
    data = stock.history(period = '1y')
    if data.empty:
        print({f"\n{ticker}: No data available. Skipping."})
        continue

    # Risks
    data['Daily Return'] = data['Close'].pct_change() # % change
    volatility = data['Daily Return'].std() * (252 ** 0.5)
    close = data['Close'].dropna()
    peak = close.cummax()
    drawdown = (close - peak) / peak
    max_drop = drawdown.min() * 100

    print(f"\n{ticker}: Annual Volatility: {volatility:.3%}")
    print(f"\n{ticker}: Maximum Drop in Price: {max_drop:.3f}%")

    risk_info[ticker] = data


# Capital split
total_cash = float(input("\nEnter total cash available: "))
allocation = {}

print(f"\nEnter allocation percentage for each stock (must add up to 100): ")
for ticker in tickers:
    pct = float(input(f"\n{ticker} %: "))
    allocation[ticker] = total_cash * (pct / 100)


# Backtests and plots
total_final_balance = 0
for ticker, cash in allocation.items():
    data = risk_info[ticker]

    # The moving averages
    data['MA7'] = data['Close'].rolling(window = 7).mean()
    data['MA30'] = data['Close'].rolling(window = 30).mean()


    # Crossover signals
    data['Signal'] = 0
    data.loc[
        (data['MA7'] > data['MA30']) &
        (data['MA7'].shift(1) <= data['MA30'].shift(1)),
        'Signal'
    ] = 1
    data.loc[
        (data['MA7'] < data['MA30']) &
        (data['MA7'].shift(1) >= data['MA30'].shift(1)),
        'Signal'
    ] = -1

    # Trade
    position = 0
    shares = 0

    for i, row in data.iterrows():
        if row['Signal'] == 1 and position == 0:
            shares = cash / row['Close']
            cash = 0
            position = 1
        elif row['Signal'] == -1 and position == 1:
            cash = shares * row['Close']
            position = 0
            shares = 0

    final_balance = cash + (shares * data['Close'].iloc[-1])
    total_final_balance += final_balance
    profit_pct = (final_balance - allocation[ticker]) / allocation[ticker] * 100

    print(f"\n{ticker} Profit: {profit_pct:.3f}% | Used Amount: {allocation[ticker]}| Final Balance: {final_balance:.3f}$")
    data.to_csv(f"{ticker}_data.csv")

print(f"\n${total_cash} was traded, and ${total_final_balance:.3f} was made.")


# Plot the graphs
plt.figure(figsize = (12,6))
for ticker, data in risk_info.items():
    data['Close'].plot(label=f'{ticker}Close Price')
    data['MA7'].plot(label=f'{ticker}MA7')
    data['MA30'].plot(label=f'{ticker}MA30')

plt.title('Stocks Comparison')
plt.xlabel('Date')
plt.ylabel('Price')
plt.legend()
plt.show()