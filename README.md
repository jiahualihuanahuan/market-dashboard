# Market Desk

个人行情台：一屏只看重要的信号。克隆下来一条命令就能跑。

```bash
git clone https://github.com/jiahualihuanahuan/market-dashboard.git
cd market-dashboard
docker compose up -d --build
```

浏览器打开 `http://<这台机器的IP>:8080`。改端口：`HOST_PORT=80 docker compose up -d`。细节见 [DOCKER.md](DOCKER.md)。

## 看什么（两页）

**Desk**

| 区块 | 来源思路 | 内容 |
|---|---|---|
| 判断 + 警报 | Shepherd「崩还是调」+ Shanghao 阈值 | 一句话结论；只列出正在触发的规则 |
| Market map | Shepherd 复盘台 / 牛熊线 | SPY、QQQ、RSP、IWM、SMH、TLT、GLD、USO：1 日、1 月、离一年高点、200 日线上/下、20 日线坡度 |
| Crash or correction? | Shepherd 信用代理 + Shanghao | 垃圾债 ETF 回撤、HY / CCC 利差 4 周变化、VIX 和 VIX/VIX3M、10 年期、失业率和 Sahm |
| Relative strength | Shepherd | 纳指 vs 半导体、权重 vs 等权、大盘 vs 小盘、垃圾债 vs 投资级；金银 120 日对冲 Z |
| What happened next | Shepherd 相似暴跌 + 牛熊线 | 纳指 100 类似单日下跌、踩 200 日线、跌破 200 日线之后的中位回报 |

**Income**（Passive Income Investing）：备兑 / 收益 ETF 的 TTM 收益率、含分红总回报、价格回报、波动率（18–20% 上限标色）、最大回撤、最近一次派息和减派标记。列表用 `INCOME_TICKERS` 改。

每个数字只出现一次。

## 数据和刷新

全部是免费公开数据（Yahoo 非官方接口、FRED CSV），不需要任何 key。

| 数据 | 频率（可用环境变量改） |
|---|---|
| 实时价格（批量，20 个一组） | 美股开盘时每 15 分钟（`PRICE_REFRESH_MIN`），收盘后补一次 |
| 日线 + 分红（只拉最近 1 个月并合并） | 每天，收盘后一次（`BARS_REFRESH_HOURS`） |
| 5 年完整日线 | 每周一次（`BARS_FULL_DAYS`），发现拆股立即重拉 |
| FRED（利差、10 年期、曲线、就业） | 每 12 小时，只拉尾部（`FRED_REFRESH_HOURS`） |

页面永远先用缓存回答（内存 → `/data/cache` 磁盘卷），需要时在后台刷新，所以打开页面不用等网络。每天 06:30（多伦多时间）和容器启动时强制刷新一次。

ETF 穿透（Lookthru）已拆成独立应用：[lookthrough](https://github.com/jiahualihuanahuan/lookthrough)。

不是投资建议。
