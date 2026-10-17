import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export function isVideoCommand(text) {
  const value = String(text || "").trim();
  return /^(视频帮助|视频指令|帮助|视频任务|查视频任务|查视频号|视频号列表)$/.test(value)
    || /^(?:查进度|取消|重试|发布)\s*W\d+/i.test(value)
    || /^(?:翻译|字幕|水印)(?:\s|https?:|并发布|后发布|发布|水印|字幕|$)/.test(value)
    || /https?:\/\/(?:www\.|m\.)?instagram\.com\//i.test(value);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}
function fileStore(file) {
  return { read: () => readJson(file), write(state) {
    // Keep command ids across restarts; trimming ids could re-execute an old message.
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(`${file}.tmp`, file);
  } };
}

export function createVideoCommands(config, client, { env = process.env, fetchImpl = fetch,
  store = fileStore(`${config.stateFile}.video-commands.json`),
  getBoundTarget = () => config.target || readJson(config.stateFile).userId || "",
  now = Date.now, logger = console } = {}) {
  let endpoint = env.WECHAT_VIDEO_COMMAND_URL || "";
  if (!endpoint && env.CREATOR_UPDATES_QUERY_URL) {
    try { endpoint = new URL("/api/wechat-video/command", env.CREATOR_UPDATES_QUERY_URL).href; } catch { /* Disabled until configured. */ }
  }
  const enabled = env.WECHAT_VIDEO_ENABLED !== "0" && Boolean(endpoint)
    && config.user === (env.WECHAT_VIDEO_USER || env.CREATOR_UPDATES_USER || "me");
  let flushing = null;

  function enqueue(msg, text) {
    const target = getBoundTarget();
    if (!enabled || !target || msg.from_user_id !== target || !isVideoCommand(text)) return false;
    const id = String(msg.message_id || msg.msg_id || msg.client_id || crypto.createHash("sha256").update(JSON.stringify(msg)).digest("hex"));
    const state = store.read();
    if (state[id]) return true;
    state[id] = { from: target, text: String(text).trim(), queuedAt: now(), nextAt: 0, reply: null, sentAt: null };
    store.write(state);
    return true;
  }
  async function dispatch(id, entry) {
    const secret = env.WECHAT_VIDEO_SECRET || env.CREATOR_UPDATES_QUERY_SECRET || env.FORWARDER_SECRET;
    if (!secret) return { reply: "微信视频密钥尚未配置，请在电脑上检查网关。" };
    try {
      const result = await fetchImpl(endpoint, { method: "POST", redirect: "error",
        headers: { "content-type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ user: config.user, messageId: id, text: entry.text }), signal: AbortSignal.timeout(15000) });
      if (result.status === 401 || result.status === 403) return { reply: "微信视频认证失败，请检查本机账号和密钥配置。" };
      if (!result.ok) throw new Error("Service unavailable");
      const data = await result.json();
      if (data.ok !== true || typeof data.reply !== "string" || !data.reply.trim()) throw new Error("Invalid reply");
      return { reply: data.reply.slice(0, 4000) };
    } catch {
      // The server might already have accepted the command: retry the same id.
      return { retry: true };
    }
  }
  async function flush() {
    if (!enabled || flushing) return flushing;
    flushing = (async () => {
      for (const id of Object.keys(store.read()).filter(key => !store.read()[key].sentAt && store.read()[key].nextAt <= now()).slice(0, 5)) {
        const entry = store.read()[id];
        if (entry.sentAt || entry.nextAt > now() || entry.from !== getBoundTarget()) continue;
        if (!entry.reply) {
          const result = await dispatch(id, entry);
          if (result.retry) {
            entry.nextAt = now() + 60000;
            const latest = store.read(); latest[id] = entry; store.write(latest);
            logger.error?.(`[video-command:${config.user}] service pending id=${id}`);
            continue;
          }
          entry.reply = result.reply;
          const latest = store.read(); latest[id] = entry; store.write(latest);
        }
        try { await client.sendMessage(entry.from, entry.reply); entry.sentAt = now(); }
        catch { entry.nextAt = now() + 60000; logger.error?.(`[video-command:${config.user}] reply pending id=${id}`); }
        const latest = store.read(); latest[id] = entry; store.write(latest);
      }
    })();
    try { await flushing; } finally { flushing = null; }
  }
  return { enqueue, flush };
}
