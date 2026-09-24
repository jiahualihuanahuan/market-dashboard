# Project Requirements — Market Dashboard

## 1. Goal
A browser-based web app (no app store) that shows a comprehensive investment dashboard. Daily data is fetched after market close and stored in our own Postgres DB. Users open the page and see data up to yesterday's close.

## 2. Data Pipeline (Backend)
- Primary source: **yfinance** (free daily OHLCV for indices, ETFs, futures, some rates).
- Optional later: Polygon for international indices / validation.
- Daily job: backfill history once, then incremental update each day after close.
- Store in Postgres (Docker volume `pgdata`), retry + rate limiting for yfinance.
- Cross-check key indices (S&P 500, Nasdaq, VIX) with a second source when possible.

### 2.1 Market Overview
- Indices: S&P 500, Nasdaq-100, Dow Jones, Stoxx 50, FTSE 100, DAX, Nikkei 225, ASX 200, S&P/TSX.
- Note: Dow is price-weighted, not cap-weighted.
- Market breadth: advancers/decliners, new highs/lows. Prefer SPY/QQQ breadth fields or compute from constituents (S&P 500 ~500, Nasdaq ~1000+). Batch + throttle.
- Liquidity: TED spread, HYG–LQD credit spread, MOVE index, NYSE average volume.
- Fear & Greed: crypto (alternative.me API), CNN (fear-greed lib).
- Commodities: GC=F gold, SI=F silver, CL=F WTI, BZ=F Brent, NG=F natgas, HG=F copper, PL=F platinum, PA=F palladium; ags ZC/ZS/KE/KC/CT/SB.
- Also: DX=F dollar index, ZN=F 10y, ^VIX.

### 2.2 US Treasury Yield Curve Tab
- Yields: Fed Funds, 1m, 3m, 6m, 1y, 2y, 5y, 7y, 10y, 20y, 30y.
- Plot curve; overlay 1w / 1m / 1y ago (selectable) + custom date.
- Preset anchors: 2000-03 top, 2007-06 top, 2019 inversion trough.
- Indicators: 10y–2y spread, 10y–3m spread (recession warning ~12–18m after inversion).
- Data: ^IRX ^FVX ^TNX ^TYX + SHY/IEF/TLT ETFs.

### 2.3 Commodity Tab + Heatmap
- Dropdown per commodity (e.g. gold) → spot + miners + mid/downstream + ETF benchmark.
- Divergence metric: Z-score of spread or rolling correlation; flag when miners diverge from spot.
- Chains:
  - Gold: NEM, GOLD, AEM, KGC + GDX/GDXJ
  - Silver: PAAS, HL + SIL
  - Copper: FCX, SCCO + COPX
  - Energy: XOM, CVX, COP + XLE/USO
  - Ag: DE, ADM, BG + DBA
  - Uranium: CCJ, NXE, UEC, DNN + URNM/URA; physical SRUUF
- Heatmap: rows = all tickers (futures/ETFs/stocks/indices), columns = 1d/1w/1m/1y returns, color = green→red. Click cell → detail. Divergence badges on cells.
- Optional: custom commodity basket index; inventory layer (COMEX gold/silver, EIA crude, weekly).

### 2.4 Valuation Models Tab
- DCF + P/E, P/B comparison; input ticker → auto data.
- SOTP (Sum of the Parts): semi-auto — code aggregates segment revenue/EBITDA/net debt × peer multiples; manual segment split from filings.

### 2.5 Daily Opportunity Radar
- Scan watchlist daily with valuation + technical filters (P/E vs history percentile, P/B, FCF yield, support levels).
- Personal buy zones: Costco ~900, Google ~300–330 (350+ = skip), Nvidia 170–200, plus ETFs with ranges.
- Rank by cheapness; weekly deploy idle cash.

### 2.6 Panic Buy Rules
- Safety cash (2y living expenses) stays in Treasuries — do not touch.
- Idle cash: VIX > 45 → deploy 30%; VIX > 50 → deploy rest. Trigger on VIX + breadth (e.g. >80% decliners) for systemic panic.
- Rationale: cash has opportunity cost; panic = mispriced expectations.

### 2.7 Smart Money Radar
- 13F (edgartools / SEC EDGAR) for Buffett, Ackman, Soros et al. — quarterly, 45–55d lag.
- Form 4 insider trades — near real-time.
- Aggregate: tickers bought by most institutions + insiders → highlight. Weekly review, not intraday.

### 2.8 Sector Rotation Tab
- Banks (US + Canada Big Five): steepening curve → wider NIM → higher valuation; flattening → pressure. Caveat: 2015–18 hiking flatten was NIM-positive (retail deposit model).
- REITs & Utilities: long-duration, hurt by rising long yields; mREITs like banks.
- Industrials & Discretionary: strong in steepening (credit + growth).
- Defensive (Health, Staples): lag but low vol.
- Watch: real yields, credit spreads, breakeven inflation, oil, USD.

### 2.9 Macro Calendar (US + Canada)
- US: NFP & unemployment, CPI + PPI, PCE (Fed's target), GDP, retail sales, Fed decision + dot plot.
- Canada: CPI + core (CPI-trim/median), unemployment/participation, GDP, retail, trade balance, BoC rate + MPR.
- Source: Statistics Canada The Daily + US BLS/BEA. Calendar + dashboard: expected / prior / actual, highlight beats.

## 3. Frontend UI
- Tabs as above; global heatmap + dropdown commodity drill-down.
- Charts: line (history), curve overlays, heatmap matrix, gauges for fear/greed and VIX.
- Personal settings: buy zones, panic thresholds, watchlist.
- Responsive; reads from Postgres API.

## 4. Docker Compose
- `db`: postgres:16, volume `pgdata`, env POSTGRES_DB/USER/PASSWORD=market.
- `updater`: depends_on db, runs `python update_daily.py`, retries on failure.
- Data persists in local Docker volume.

## 5. Out of Scope (v1)
- No live intraday; no options/Greeks; no auto-trading execution.
