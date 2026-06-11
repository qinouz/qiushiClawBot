# Docker 部署

## 一键启动三件套

启动 Hermes gateway、Hermes dashboard、qiushiClawBot 和 gold：

```powershell
powershell -ExecutionPolicy Bypass -File D:\myProject\qiushiClawBot\start-stack.ps1
```

脚本会自动检查 Docker Desktop 是否启动；如果 Docker daemon 还没起来，会尝试启动 Docker Desktop 并等待。

启动后访问：

```text
Hermes dashboard:   http://127.0.0.1:9119
qiushiClawBot API:  http://127.0.0.1:8711/health
gold dashboard:     http://127.0.0.1:8787
```

对应容器：

```text
hermes             Hermes gateway
hermes-dashboard   Hermes dashboard
qiushi-gold        qiushiClawBot + gold
```

## 当前消息分工

Hermes gateway 使用 Hermes 自己的 Weixin 配置。

`qiushi-gold` 容器里同时运行：

```text
qiushiClawBot
gold-price-watch
```

当前 `qiushiClawBot` 只轮询 `.env` 里 `CLAWBOT_USERS` 明确配置的用户，避免和 Hermes 抢同一个 ClawBot token 的 `get_updates_buf`。

`gold` 通过 qiushiClawBot 的 `/send` 发报警。当前目标由 `D:\myProject\gold\.env` 里的 `WECHAT_FORWARDER_USER` 决定。

## 查看日志

Hermes gateway：

```powershell
docker logs -f hermes
```

Hermes dashboard：

```powershell
docker logs -f hermes-dashboard
```

qiushiClawBot 和 gold 合并日志：

```powershell
powershell -ExecutionPolicy Bypass -File D:\myProject\qiushiClawBot\logs-all.ps1
```

也可以直接用 compose：

```powershell
docker compose --project-directory D:\myProject\qiushiClawBot -f D:\myProject\qiushiClawBot\docker-compose.all.yml logs -f
```

## 手动启动

Hermes：

```powershell
docker compose -p hermes-agent -f \\wsl.localhost\Ubuntu-22.04\home\qinshiwei\hermes-agent\docker-compose.yml up -d gateway dashboard
```

qiushiClawBot + gold：

```powershell
docker compose --project-directory D:\myProject\qiushiClawBot -f D:\myProject\qiushiClawBot\docker-compose.all.yml up -d
```

## 停止服务

停止 Hermes：

```powershell
docker compose -p hermes-agent -f \\wsl.localhost\Ubuntu-22.04\home\qinshiwei\hermes-agent\docker-compose.yml down
```

停止 qiushiClawBot + gold：

```powershell
docker compose --project-directory D:\myProject\qiushiClawBot -f D:\myProject\qiushiClawBot\docker-compose.all.yml down
```

## 状态文件

qiushiClawBot 的微信绑定状态在：

```text
D:\myProject\qiushiClawBot\.clawbot\users
```

Hermes 的状态在：

```text
C:\Users\qinshiwei\.hermes
```

这些目录都是持久化目录，重建容器不会自动丢失绑定。
