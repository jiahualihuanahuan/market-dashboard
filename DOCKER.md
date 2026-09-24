# 用 Docker 跑 Market Desk

容器里的服务监听 `0.0.0.0:8080`。同一局域网里的电脑、手机都可以打开。

## 启动

在项目目录：

```bash
docker compose up -d --build
```

浏览器打开 `http://<这台机器的 IP>:8080`。

改对外端口（例如改成 80）时，先停再起：

```bash
HOST_PORT=80 docker compose up -d
```

常用命令：

```bash
docker compose ps          # 状态，healthy 表示正常
docker compose logs -f     # 日志
docker compose restart     # 马上重启
docker compose down        # 停掉，数据卷还在
docker compose down -v     # 停掉并删掉日志和自动生成的令牌
```

可选配置见 [docker/env.example](docker/env.example)。想改时区或每天几点刷新，在项目目录建一个 `.env`：

```bash
TZ=America/Toronto
CARE_AT=06:30
HOST_PORT=8080
```

## 自动照顾

- `restart: unless-stopped`：进程崩了会拉起。宿主机重启后，只要 Docker 自己会开机启动，这个容器也会起来。
  - Linux：`sudo systemctl enable --now docker`
- 每 30 秒做一次健康检查（`/api/health`）。连续失败会重启容器里的服务。
- 每天 `CARE_AT`（默认多伦多时间 06:30）会再检查一次，并刷新行情缓存。容器刚启动时也会刷新一次。记录在日志里，也在 `market-desk-logs` 卷的 `care.log`。
- Docker 自己的日志只保留 5 个 10MB 文件，不会把磁盘写满。

行情刷新接口是 `/api/care`，必须带启动时的令牌。没自己设 `CARE_TOKEN` 时，令牌写在数据卷里：

```bash
docker compose exec market-desk cat /data/care.token
```

## 从别的地方访问

- 同一 Wi-Fi / 局域网：用宿主机的局域网 IP，确认防火墙放行 `HOST_PORT`。
- 公网：在路由器上把该端口转到这台机器，或前面加一层 Nginx / Caddy 做 HTTPS。不要把带默认令牌的机器直接暴露到公网；公网请自己设一个长的 `CARE_TOKEN`。

这个 Compose 文件只发布行情台。预览用的开发服务器不是这个容器。
