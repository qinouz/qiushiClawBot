import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { loadUserConfig } from "./users.js";

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const ILINK_APP_ID = "bot";
const ILINK_APP_CLIENT_VERSION = "131840";
const CHANNEL_VERSION = "2.2.0";

export function createClawBotClient(config) {
  return {
    setup: () => setupClawBot(config),
    createSetupQrCode: () => createSetupQrCode(config),
    confirmSetup: () => confirmSetup(config),
    getUpdates: () => getUpdates(config),
    sendMessage: (target, message, contextToken = "") => sendClawBot(config, target, message, contextToken),
  };
}

export function loadClawBotConfig() {
  return loadUserConfig();
}

export function extractClawBotText(msg) {
  const parts = [];

  for (const item of msg.item_list || []) {
    for (const text of [item?.text_item?.text, item?.voice_item?.text]) {
      if (typeof text === "string" && text.trim()) {
        parts.push(text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

export function rememberContextToken(saved, msg) {
  if (!msg.from_user_id || !msg.context_token) {
    return;
  }

  saved.contextTokens = saved.contextTokens || {};
  saved.contextTokens[msg.from_user_id] = msg.context_token;
}

async function setupClawBot(config) {
  const qrcode = await createSetupQrCode(config);
  console.log("[clawbot] scan this URL with WeChat, then confirm on your phone:");
  console.log(qrcode.qrcode_img_content);

  for (;;) {
    await sleep(3000);
    const status = await getClawBotQrStatus(config, qrcode.qrcode);

    if (status.status === "wait" || status.status === "scaned") {
      console.log(`[clawbot] ${status.status}`);
      continue;
    }

    if (status.status === "expired") {
      throw new Error("ClawBot QR code expired. Run setup again.");
    }

    if (status.status === "confirmed") {
      const saved = loadClawBotState(config);
      saved.baseUrl = status.baseurl || config.baseUrl;
      saved.token = status.bot_token;
      saved.accountId = status.ilink_bot_id;
      saved.userId = status.ilink_user_id;
      saved.contextTokens = saved.contextTokens || {};
      saved.savedAt = new Date().toISOString();
      saveClawBotState(config, saved);

      console.log("[clawbot] login confirmed");
      console.log(`[clawbot] account_id=${saved.accountId}`);
      console.log(`[clawbot] user_id=${saved.userId}`);
      return;
    }

    throw new Error(`unexpected QR status: ${JSON.stringify(status)}`);
  }
}

async function createSetupQrCode(config) {
  const qrcode = await getClawBotQrCode(config);
  const saved = loadClawBotState(config);
  saved.pendingQrCode = qrcode.qrcode;
  saved.pendingQrCodeUrl = qrcode.qrcode_img_content;
  saved.pendingQrCodeAt = new Date().toISOString();
  saveClawBotState(config, saved);
  return qrcode;
}

async function confirmSetup(config) {
  const saved = loadClawBotState(config);

  if (!saved.pendingQrCode) {
    throw new Error("No pending ClawBot QR code. Run qrcode first.");
  }

  const status = await getClawBotQrStatus(config, saved.pendingQrCode);

  if (status.status !== "confirmed") {
    return status;
  }

  saved.baseUrl = status.baseurl || config.baseUrl;
  saved.token = status.bot_token;
  saved.accountId = status.ilink_bot_id;
  saved.userId = status.ilink_user_id;
  saved.contextTokens = saved.contextTokens || {};
  saved.savedAt = new Date().toISOString();
  delete saved.pendingQrCode;
  delete saved.pendingQrCodeUrl;
  delete saved.pendingQrCodeAt;
  saveClawBotState(config, saved);

  return status;
}

async function getUpdates(config) {
  const saved = loadClawBotState(config);
  const token = config.token || saved.token;
  const accountId = config.accountId || saved.accountId;

  if (!token || !accountId) {
    throw new Error("Missing ClawBot token/account. Set CLAWBOT_TOKEN and CLAWBOT_ACCOUNT_ID.");
  }

  const result = await clawBotPost(
    config,
    "/ilink/bot/getupdates",
    {
      get_updates_buf: saved.getUpdatesBuf || "",
      base_info: baseInfo(),
    },
    token,
    saved.baseUrl || config.baseUrl
  );

  saved.getUpdatesBuf = result.get_updates_buf || saved.getUpdatesBuf || "";

  for (const msg of result.msgs || []) {
    rememberContextToken(saved, msg);
  }

  saveClawBotState(config, saved);

  return result.msgs || [];
}

async function sendClawBot(config, target, message, contextToken = "") {
  const saved = loadClawBotState(config);
  const token = config.token || saved.token;
  const baseUrl = config.baseUrl || saved.baseUrl;
  const toUserId = target || config.target || saved.userId;
  let tokenForContext = contextToken || config.contextToken || saved.contextTokens?.[toUserId] || "";

  if (!token) {
    throw new Error("Missing CLAWBOT_TOKEN.");
  }

  if (!toUserId) {
    throw new Error("Missing ClawBot message target.");
  }

  let lastResult = null;

  for (let attempt = 0; attempt < config.sendMaxRetries; attempt += 1) {
    const msg = {
      from_user_id: "",
      to_user_id: toUserId,
      client_id: crypto.randomUUID(),
      message_type: 2,
      message_state: 2,
      item_list: [
        {
          type: 1,
          text_item: {
            text: message,
          },
        },
      ],
    };

    if (tokenForContext) {
      msg.context_token = tokenForContext;
    }

    const result = await clawBotPost(
      config,
      "/ilink/bot/sendmessage",
      {
        msg,
        base_info: baseInfo(),
      },
      token,
      baseUrl
    );

    if (isSuccess(result)) {
      return result;
    }

    lastResult = result;

    if (isSessionExpired(result) && tokenForContext) {
      tokenForContext = "";
      if (saved.contextTokens?.[toUserId]) {
        delete saved.contextTokens[toUserId];
        saveClawBotState(config, saved);
      }
      continue;
    }

    if (isRateLimited(result) && attempt < config.sendMaxRetries - 1) {
      await sleep(6000 * (attempt + 1));
      continue;
    }

    break;
  }

  throw new Error(`ClawBot send failed: ${JSON.stringify(lastResult)}`);
}

async function getClawBotQrCode(config) {
  const response = await request(`${config.baseUrl}/ilink/bot/get_bot_qrcode?bot_type=3`, {
    headers: {
      SKRouteTag: "1001",
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`ClawBot QR request failed: HTTP ${response.status} ${body}`);
  }

  return JSON.parse(body);
}

async function getClawBotQrStatus(config, qrcode) {
  const response = await request(
    `${config.baseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
    {
      headers: {
        "iLink-App-ClientVersion": "1",
        SKRouteTag: "1001",
      },
    }
  );
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`ClawBot QR status failed: HTTP ${response.status} ${body}`);
  }

  return JSON.parse(body);
}

async function clawBotPost(config, pathname, body, token, baseUrl = config.baseUrl) {
  const payload = JSON.stringify(body);
  const response = await request(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      AuthorizationType: "ilink_bot_token",
      Authorization: `Bearer ${token}`,
      "iLink-App-Id": ILINK_APP_ID,
      "iLink-App-ClientVersion": ILINK_APP_CLIENT_VERSION,
      "X-WECHAT-UIN": randomWechatUin(),
      SKRouteTag: "1001",
      "content-length": String(Buffer.byteLength(payload)),
    },
    body: payload,
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`ClawBot request failed: HTTP ${response.status} ${text}`);
  }

  return JSON.parse(text);
}

function loadClawBotState(config) {
  if (!fs.existsSync(config.stateFile)) {
    return {};
  }

  try {
    const state = JSON.parse(fs.readFileSync(config.stateFile, "utf8").replace(/^\uFEFF/, ""));

    return state && typeof state === "object" && !Array.isArray(state) ? state : {};
  } catch (error) {
    console.warn(`[clawbot:${config.user}] ignoring invalid state file ${config.stateFile}: ${error.message}`);
    return {};
  }
}

function saveClawBotState(config, saved) {
  fs.mkdirSync(path.dirname(config.stateFile), { recursive: true });
  fs.writeFileSync(config.stateFile, `${JSON.stringify(saved, null, 2)}\n`);
}

function baseInfo() {
  return {
    channel_version: CHANNEL_VERSION,
  };
}

function isSuccess(result) {
  return result.ret === 0 || result.errcode === 0 || (result.ret === undefined && result.errcode === undefined);
}

export function isClawBotSuccessResult(result) {
  return isSuccess(result);
}

function isSessionExpired(result) {
  return result.errcode === -14 || (result.ret === -2 && String(result.errmsg || "").toLowerCase() === "unknown error");
}

function isRateLimited(result) {
  return result.ret === -2 && !isSessionExpired(result);
}

function randomWechatUin() {
  const value = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(value), "utf8").toString("base64");
}

function numberEnv(name, defaultValue) {
  const raw = env(name, "");

  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return value;
}

function env(name, defaultValue) {
  return process.env[name] ?? defaultValue;
}

function request(url, options = {}) {
  if (typeof fetch === "function") {
    return fetch(url, options);
  }

  const parsed = new URL(url);
  const transport = parsed.protocol === "https:" ? https : http;
  const method = options.method || "GET";
  const headers = options.headers || {};
  const body = options.body?.toString();

  return new Promise((resolve, reject) => {
    const req = transport.request(parsed, { method, headers }, (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: async () => text,
        });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
