import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
function fileStore(file) {
  return { read: () => readJson(file, { mode: false, entries: {}, sequence: 0 }), write(value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), "utf8"); fs.renameSync(`${file}.tmp`, file);
  } };
}

export function parseRelayControl(text) {
  const compact = String(text || "").trim().replace(/[。.!！?？]+$/, "").replace(/\s+/g, "").toLowerCase()
    .replace(/(?:扣子叉儿?|扣德克斯|助手)/g, "codex");
  if (/^(进入|开启|打开)codex(?:聊天(?:模式)?)?$/.test(compact)) return { action: "enter" };
  if (/^(退出|关闭)codex(?:聊天(?:模式)?)?$/.test(compact)) return { action: "exit" };
  if (["codex", "codex状态", "codex进度"].includes(compact)) return { action: "status" };
  if (["codex帮助", "codex指令", "codexhelp"].includes(compact)) return { action: "help" };
  if (["中断codex", "停止codex"].includes(compact)) return { action: "stop" };
  const prefix = String(text || "").trim().match(/^(?:codex|扣德克斯|扣子叉儿?|助手)[\s：:,，]*([\s\S]+)$/i);
  return prefix?.[1].trim() ? { action: "message", text: prefix[1].trim() } : null;
}

export function createCodexRelay(config, client, { env = process.env, fetchImpl = fetch,
  store = fileStore(`${config.stateFile}.codex-relay.json`), now = Date.now, logger = console,
  getBoundTarget = () => config.target || readJson(config.stateFile, {}).userId || "" } = {}) {
  let endpoint = env.WECHAT_CODEX_COMMAND_URL || "";
  if (!endpoint && env.CREATOR_UPDATES_QUERY_URL) {
    try { endpoint = new URL("/api/wechat-codex/command", env.CREATOR_UPDATES_QUERY_URL).href; } catch { /* Keep disabled. */ }
  }
  const enabled = Boolean(endpoint) && env.WECHAT_CODEX_ENABLED !== "0"
    && config.user === (env.WECHAT_CODEX_USER || env.CREATOR_UPDATES_USER || "me");
  let flushing = null;
  function enqueue(msg, text, explicit) {
    const target = getBoundTarget();
    if (!enabled || !target || msg.from_user_id !== target || !String(text).trim()) return false;
    const state = store.read(); state.entries ||= {};
    const control = explicit ? parseRelayControl(text) : null;
    const voice = (msg.item_list || []).some(item => item?.voice_item);
    if (explicit && !control) return false;
    const hint = !explicit && (!state.mode || state.modeOwner !== target);
    if (hint && !voice) return false;
    const id = String(msg.message_id || msg.msg_id || msg.client_id || crypto.createHash("sha256").update(JSON.stringify(msg)).digest("hex"));
    if (state.entries[id]) return true;
    if (control?.action === "enter") { state.mode = true; state.modeOwner = target; }
    if (control?.action === "exit") state.mode = false;
    state.sequence = (state.sequence || 0) + 1;
    state.entries[id] = { from: target, action: hint ? "hint" : control?.action || "message", text: control?.text || (control ? "" : String(text).trim()),
      source: voice ? "voice" : "text", receivedAt: new Date(now()).toISOString(), sequence: state.sequence, nextAt: 0,
      reply: hint ? "收到语音转写，但还没进入助手聊天模式。\n请发“进入助手”，之后直接说你的要求；也可以单条说“助手，你的要求”。\n查状态可以说“助手状态”，查看指令可以说“助手帮助”。" : null, sentAt: null };
    store.write(state);
    logger.info?.(`[codex-relay:${config.user}] queued id=${id} action=${state.entries[id].action} source=${state.entries[id].source} mode=${state.mode ? "on" : "off"}`);
    return true;
  }
  async function flush() {
    if (!enabled || flushing) return flushing;
    flushing = (async () => {
      const pending = Object.entries(store.read().entries || {}).filter(([, entry]) => !entry.sentAt && entry.from === getBoundTarget())
        .sort((a, b) => a[1].sequence - b[1].sequence).slice(0, 5);
      for (const [id] of pending) {
        const entry = store.read().entries[id];
        if (entry.from !== getBoundTarget()) continue;
        if (entry.nextAt > now()) {
          if (!entry.reply) break;
          continue;
        }
        if (!entry.reply) {
          const secret = env.WECHAT_CODEX_SECRET || env.CREATOR_UPDATES_QUERY_SECRET || env.FORWARDER_SECRET;
          if (!secret) entry.reply = "微信直连密钥尚未配置，请在电脑上检查。";
          else {
            try {
              const response = await fetchImpl(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
                headers: { "content-type": "application/json", Authorization: `Bearer ${secret}` },
                body: JSON.stringify({ user: config.user, messageId: id, action: entry.action, text: entry.text }) });
              if (response.status === 401 || response.status === 403) entry.reply = "微信直连认证失败，请检查本机配置。";
              else {
                if (!response.ok) throw new Error("Service unavailable");
                const data = await response.json();
                if (data.ok !== true || typeof data.reply !== "string" || !data.reply.trim()) throw new Error("Invalid reply");
                entry.reply = data.reply.slice(0, 4000);
              }
            } catch {
              entry.nextAt = now() + 60000;
              const latest = store.read(); latest.entries[id] = entry; store.write(latest);
              logger.error?.(`[codex-relay:${config.user}] dispatch pending id=${id}`);
              break; // Preserve conversation order when the first request is uncertain.
            }
          }
          const latest = store.read(); latest.entries[id] = entry; store.write(latest);
        }
        try { await client.sendMessage(entry.from, entry.reply); entry.sentAt = now(); }
        catch { entry.nextAt = now() + 60000; logger.error?.(`[codex-relay:${config.user}] reply pending id=${id}`); }
        const latest = store.read(); latest.entries[id] = entry; store.write(latest);
      }
    })();
    try { await flushing; } finally { flushing = null; }
  }
  function safeEnqueue(msg, text, explicit) {
    try { return enqueue(msg, text, explicit); }
    catch { logger.error?.(`[codex-relay:${config.user}] local journal unavailable`); return false; }
  }
  function enqueueVideoChat(msg, text) {
    try {
      const state = store.read();
      if (!state.mode || state.modeOwner !== getBoundTarget()) return false;
      if (!/https?:\/\/(?:www\.|m\.)?instagram\.com\//i.test(text) && !/^(?:翻译|字幕|水印|下载)/.test(String(text).trim())) return false;
      return safeEnqueue(msg, text, false);
    } catch { logger.error?.(`[codex-relay:${config.user}] video routing unavailable`); return false; }
  }
  return { enqueueExplicit: (msg, text) => safeEnqueue(msg, text, true), enqueueVideoChat,
    enqueueChat: (msg, text) => safeEnqueue(msg, text, false), flush };
}
