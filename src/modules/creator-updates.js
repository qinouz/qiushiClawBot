import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function isCreatorUpdateCommand(text) {
  const value = String(text || "").trim().replace(/[?？!！。]+$/, "").trim();
  return /^(查更新|查询更新|检查更新|查一下更新|有更新吗|更新了吗|更新了没|有没有更新|更没更新|更新情况)$/.test(value)
    || /^(查更新|查询更新|检查更新)[\s：:]+.{1,80}$/.test(value)
    || /^.{1,80}?(更新了吗|有更新吗|有没有更新|更新了没|更没更新|更新情况)$/.test(value);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

function fileStore(file) {
  return {
    read: () => readJson(file, {}),
    write: (state) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const entries = Object.entries(state);
      const pending = entries.filter(([, value]) => !value.sentAt);
      const sent = entries.filter(([, value]) => value.sentAt).slice(-200);
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(Object.fromEntries([...sent, ...pending]), null, 2), "utf8");
      fs.renameSync(temp, file);
    },
  };
}

export function createCreatorUpdateCommands(config, client, {
  env = process.env,
  fetchImpl = fetch,
  store = fileStore(`${config.stateFile}.creator-queries.json`),
  getBoundTarget = () => config.target || readJson(config.stateFile, {}).userId || "",
  now = Date.now,
  logger = console,
} = {}) {
  const enabled = Boolean(env.CREATOR_UPDATES_QUERY_URL) && config.user === (env.CREATOR_UPDATES_USER || "me");
  let flushing = null;

  function enqueue(msg, text) {
    if (!enabled || !isCreatorUpdateCommand(text)) return false;
    const target = getBoundTarget();
    if (!target || msg.from_user_id !== target) return false;
    const id = String(msg.message_id || msg.msg_id || msg.client_id
      || crypto.createHash("sha256").update(JSON.stringify(msg)).digest("hex"));
    const state = store.read();
    if (state[id]) return true;
    state[id] = { from: target, text: text.trim(), queuedAt: now(), nextAttemptAt: 0, reply: null, sentAt: null };
    store.write(state);
    return true;
  }

  async function getReply(text) {
    try {
      const secret = env.CREATOR_UPDATES_QUERY_SECRET || env.FORWARDER_SECRET;
      if (!secret) return "微信查询密钥尚未配置，请检查本机网关设置。";
      const response = await fetchImpl(env.CREATOR_UPDATES_QUERY_URL, {
        method: "POST", redirect: "error",
        headers: { "content-type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ text }), signal: AbortSignal.timeout(180000),
      });
      if (response.status === 401) return "微信查询认证失败，请检查项目与网关的密钥配置。";
      if (!response.ok) return "作者查询服务暂时不可用，请确认本事项目正在运行，稍后再试。";
      const data = await response.json();
      if (data.ok !== true || typeof data.reply !== "string" || !data.reply.trim()) throw new Error("Invalid query response");
      return data.reply.slice(0, 4000);
    } catch (error) {
      return error.name === "TimeoutError" || error.name === "AbortError"
        ? "查询耗时较长，后台可能仍在检查。请稍后再发“查更新”，有新作品也会按提醒设置推送。"
        : "暂时连接不上本事项目，请确认项目正在运行，稍后再发“查更新”。";
    }
  }

  async function flush() {
    if (!enabled) return;
    if (flushing) return flushing;
    flushing = (async () => {
      const state = store.read();
      for (const [id, entry] of Object.entries(state).filter(([, value]) => !value.sentAt).slice(0, 5)) {
        if (entry.nextAttemptAt > now() || entry.from !== getBoundTarget()) continue;
        if (!entry.reply) {
          entry.reply = await getReply(entry.text);
          store.write(state);
        }
        try {
          // Use the client's freshest saved context, including messages received after this query.
          await client.sendMessage(entry.from, entry.reply);
          entry.sentAt = now();
          logger.info?.(`[creator-query:${config.user}] replied id=${id}`);
        } catch {
          entry.nextAttemptAt = now() + 60000;
          logger.error?.(`[creator-query:${config.user}] reply pending id=${id}`);
        }
        store.write(state);
      }
    })();
    try { await flushing; } finally { flushing = null; }
  }

  return { enqueue, flush };
}
