# Docker 部署

## 1. 准备环境变量

先确认两个项目的 `.env` 都存在：

```powershell
Copy-Item D:\myProject\qiushiClawBot\.env.example D:\myProject\qiushiClawBot\.env
Copy-Item D:\myProject\gold\.env.example D:\myProject\gold\.env
```

`qiushiClawBot` 使用 `FORWARDER_SECRET` 保护 `/send` 接口；`gold` 使用 `WECHAT_FORWARDER_SECRET` 调用这个接口。两个值需要保持一致。

`gold` 当前发给：

```env
WECHAT_FORWARDER_USER=me
```

所以 `qiushiClawBot` 里 `me` 用户需要有有效的 ClawBot token 和 accountId。

## 2. 单容器启动

推荐使用单容器脚本，同时启动 `qiushiClawBot` 和 `gold`：

```powershell
powershell -ExecutionPolicy Bypass -File D:\myProject\qiushiClawBot\start-all-in-one.ps1
```

启动后访问：

```text
qiushiClawBot: http://127.0.0.1:8711/health
gold dashboard: http://127.0.0.1:8787
```

单容器名称：

```text
qiushi-gold
```

## 3. 查看日志

实时查看两个程序的合并日志：

```powershell
powershell -ExecutionPolicy Bypass -File D:\myProject\qiushiClawBot\logs-all.ps1
```

这个日志里会同时看到：

```text
qiushiClawBot 日志
gold-price-watch 日志
```

也可以直接使用 Docker Compose：

```powershell
docker compose --project-directory D:\myProject\qiushiClawBot -f D:\myProject\qiushiClawBot\docker-compose.all.yml logs -f
```

## 4. 状态文件

微信绑定状态保存在宿主机目录：

```text
D:\myProject\qiushiClawBot\.clawbot\users
```

容器内路径：

```text
/app/.clawbot/users
```

重建镜像或重启容器不会丢失已绑定用户。

## 5. 停止服务

停止单容器：

```powershell
docker compose --project-directory D:\myProject\qiushiClawBot -f D:\myProject\qiushiClawBot\docker-compose.all.yml down
```

## 6. 旧的分开启动方式

如果只想单独启动 `qiushiClawBot`：

```powershell
docker compose up -d --build
```

如果想使用早先的两个容器启动脚本：

```powershell
powershell -ExecutionPolicy Bypass -File D:\myProject\qiushiClawBot\start-qiushi-and-gold.ps1
```
