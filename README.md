# Market Dashboard

个人行情台。仓库里已经带好 Docker Compose，克隆下来一条命令就能跑，不用再自己写 compose 文件。

```bash
git clone https://github.com/jiahualihuanahuan/market-dashboard.git
cd market-dashboard
docker compose up -d --build
```

浏览器打开 `http://<这台机器的IP>:8080`。同一局域网里的手机、电脑都能访问。

改对外端口（例如 80）：

```bash
HOST_PORT=80 docker compose up -d
```

常用：

```bash
docker compose ps
docker compose logs -f
docker compose down
```

五个标签：**Markets**（概览、热力图、板块、商品）、**Risk**（恐慌、稳定性、收益率曲线和美联储、宏观）、**Money flow**（内部人、13F、ETF 资金流、暗池、期权）、**Portfolio**（Lookthru、有效前沿、估值）、**Settings**。每个标签里第一块默认展开，其他点开才加载；每个指标只在一个地方出现。

页面总是先用缓存回答，再在后台刷新：美股开盘时价格每 15 分钟（`PRICE_REFRESH_MIN`），收盘后补一次；周末每小时一次（`WEEKEND_REFRESH_MIN`）；FRED 每 12 小时（`FRED_REFRESH_HOURS`）。缓存在 `market-desk-data` 卷里，重建镜像也不丢。

容器挂了会自己拉起。每天 06:30（多伦多时间）自动检查并刷新行情。时区和端口见 `docker/env.example`，细节见 [DOCKER.md](DOCKER.md)。

侧栏里的 **Lookthru** 把 ETF 拆成底层股票（和单独的 [Lookthru](https://github.com/jiahualihuanahuan/Lookthru) 同一套穿透）。持仓记在这台浏览器里。

需求说明仍在 [docs/PROJECT_REQUIREMENTS.md](docs/PROJECT_REQUIREMENTS.md)。
