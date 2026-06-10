# Docker 部署

## 1. 准备环境变量

先确认 `.env` 存在，并按需配置 ClawBot 用户、密钥和端口。

```powershell
Copy-Item .env.example .env
```

Docker Compose 会读取 `.env`，并把服务监听地址改成 `0.0.0.0`，这样宿主机才能通过端口访问容器。

## 2. 启动

```powershell
docker compose up -d --build
```

默认访问：

```text
http://127.0.0.1:8711/health
```

查看日志：

```powershell
docker compose logs -f
```

停止：

```powershell
docker compose down
```

## 3. 状态文件

微信绑定状态会持久化在宿主机目录：

```text
.clawbot/users
```

这个目录会挂载到容器内：

```text
/app/.clawbot/users
```

所以重建镜像或重启容器不会丢失已绑定用户。

## 4. 常用命令

重新扫码绑定：

```powershell
docker compose run --rm qiushi-clawbot npm run clawbot:qrcode -- --user wife
docker compose run --rm qiushi-clawbot npm run clawbot:confirm -- --user wife
```

临时关闭自动轮询启动服务：

```powershell
docker compose run --rm -e CLAWBOT_AUTO_LISTEN=false -p 8711:8711 qiushi-clawbot
```
