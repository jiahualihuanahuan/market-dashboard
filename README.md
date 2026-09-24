# Market Dashboard

Personal web app for monitoring global markets, commodities, macro data, valuations, and smart-money signals.

## Stack
- Frontend: React + TypeScript (or Next.js)
- Backend: Python (FastAPI) + Postgres
- Data: yfinance (daily), Polygon (optional later), SEC EDGAR (13F / Form 4)
- Deploy: Docker Compose (Postgres volume + updater job)

## Core Tabs
1. Market Overview (global indices, breadth, liquidity, fear & greed, commodities)
2. US Treasury Yield Curve
3. Commodity Chains (gold/silver/oil/uranium + equities + ETFs)
4. Valuation Models (DCF, SOTP, relative valuation)
5. Daily Opportunity Radar (personal buy zones)
6. Panic Buy Rules (VIX + breadth triggers)
7. Smart Money Radar (13F + insider trades)
8. Sector Rotation (banks, REITs, utilities vs yield curve)
9. Macro Calendar (US + Canada economic data)

See `docs/PROJECT_REQUIREMENTS.md` for full spec.
