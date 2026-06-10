# qiushiClawBot

一个很薄的微信 ClawBot/iLink 本地消息网关：

```text
微信消息 -> ClawBot/iLink getupdates -> 本地消息路由 -> ClawBot/iLink sendmessage -> 微信回复
其他程序 -> POST /send -> ClawBot/iLink sendmessage -> 微信消息
```

先把入口跑通，后面可以把 `src/message/router.js` 里的 handler 换成记账、RAG、Tool Calling 或完整 Agent。

## 启动

```bash
copy .env.example .env
npm start
```

启动时会自动读取项目根目录的 `.env` 文件；如果同名环境变量已经在 shell 里设置过，会优先使用 shell 里的值。

默认监听：

```text
http://127.0.0.1:8711
```

## 接口

### GET /health

健康检查。

### GET /users

查看已配置或已绑定的微信用户。

返回：

```json
{
  "ok": true,
  "users": [
    {
      "user": "wife",
      "default": true,
      "bound": true
    }
  ]
}
```

### POST /send

给其他程序调用的统一微信发送入口。

请求：

```json
{
  "user": "wife",
  "to": "可选，目标微信用户 ID；不填则使用绑定账号默认目标",
  "message": "要发送的内容"
}
```

`user` 可选；不填时使用 `CLAWBOT_DEFAULT_USER`。

也可以批量发送：

```json
{
  "messages": [
    { "user": "wife", "message": "第一条" },
    { "user": "me", "message": "第二条" }
  ]
}
```

返回：

```json
{
  "ok": true,
  "count": 1,
  "results": [
    {
      "ok": true,
      "to": "",
      "result": { "ret": 0 }
    }
  ]
}
```

如果设置了 `FORWARDER_SECRET`，请求需要带其中一种：

```text
Authorization: Bearer <FORWARDER_SECRET>
X-Api-Secret: <FORWARDER_SECRET>
```

### POST /chat

推荐给 ClawBot bridge 调用的入口。

请求：

```json
{
  "message": "你好",
  "from": "user-id",
  "room": "room-id",
  "raw": {}
}
```

返回：

```json
{
  "reply": "你好，我在。"
}
```

### POST /webhook/clawbot

兼容更宽松的 webhook payload，会尝试从 `message`、`text`、`content`、`msg.text`、`event.text` 等字段里提取文本。

如果设置了 `WEBHOOK_SECRET`，请求需要带其中一种：

```text
Authorization: Bearer <WEBHOOK_SECRET>
X-Webhook-Secret: <WEBHOOK_SECRET>
```

## 微信直连接入

这个项目使用自己的 ClawBot/iLink 直连配置，不需要安装 OpenClaw CLI。

当前支持多个微信用户，每个用户一个独立状态文件：

```text
.clawbot/users/wife.json
.clawbot/users/me.json
```

配置：

```env
CLAWBOT_DEFAULT_USER=wife
CLAWBOT_USERS=wife,me
CLAWBOT_STATE_DIR=.clawbot/users
```

持续监听微信消息：

```bash
npm run clawbot:listen
```

只拉取一次消息：

```bash
npm run clawbot:listen-once
```

重新扫码绑定：

```bash
node src/clawbot-listener.js --user wife --clawbot-qrcode
node src/clawbot-listener.js --user wife --clawbot-confirm-setup
```

测试主动发送微信消息：

```bash
npm run clawbot:test
```

监听日志会写到：

```text
clawbot-listener.log
```

## Webhook bridge 侧示例

在 bridge 插件收到文本后调用：

```ts
const resp = await fetch("http://127.0.0.1:8711/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: text,
    from: userId,
    room: roomId,
    raw: message,
  }),
});

const data = await resp.json();
await reply(data.reply || "我收到了，但暂时没有可返回的内容。");
```

## 本地测试

```bash
curl -X POST http://127.0.0.1:8711/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"记账 午饭 28\"}"
```

测试发送微信：

```bash
curl -X POST http://127.0.0.1:8711/send ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"来自其他程序的测试消息\"}"
```

或者：

```bash
npm test
```
