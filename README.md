# Stock Strategy Backtester

A Python-based multi-asset backtesting engine designed to simulate trading strategies while emphasizing risk analysis and capital allocation.

This project focuses on understanding how simple strategies behave under volatility, drawdowns, and different portfolio allocations — not just raw returns.

---

## 🚀 Features (v1)

- Multi-ticker support  
- Historical data retrieval via yfinance  
- Annualized volatility calculation  
- Maximum drawdown computation  
- Moving Average (7/30) crossover strategy  
- Capital allocation across multiple assets  
- Buy & Hold comparison  
- CSV export of processed data  
- Price + Moving Average visualization  

---

## 🧠 Strategy Logic

The current implementation uses a simple Moving Average crossover:

- **BUY** when MA(7) crosses above MA(30)  
- **SELL** when MA(7) crosses below MA(30)  

Trades are executed using allocated capital per asset.

The engine then calculates:

- Final portfolio value  
- Percentage return  
- Risk metrics  

---

## 📈 Risk Metrics Implemented

- Annualized volatility  
- Maximum drawdown  
- Strategy return vs Buy & Hold  

Risk is treated as a first-class component, not an afterthought.

---

## 🛠 Tech Stack

- Python  
- pandas  
- numpy  
- yfinance  
- matplotlib  

---

## ▶️ How to Run

```bash
pip install pandas numpy yfinance matplotlib
python stock_tracker.py
