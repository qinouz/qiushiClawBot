import http from "node:http";
import { URL } from "node:url";
import { createClawBotManager } from "./clawbot/manager.js";
import { normalizeIncomingMessage } from "./message/normalize.js";
import { routeMessage } from "./message/router.js";

export function createClawBotServer(options = {}) {
  const webhookSecret = options.webhookSecret ?? process.env.WEBHOOK_SECRET ?? "";
  const forwarderSecret = options.forwarderSecret ?? process.env.FORWARDER_SECRET ?? "";
  const manager = options.manager ?? createClawBotManager();
  const sender = options.sender ?? null;

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

      if (req.method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, {
          ok: true,
          service: "qiushi-clawbot",
          time: new Date().toISOString(),
        });
      }

      if (req.method === "GET" && url.pathname === "/users") {
        return sendJson(res, 200, {
          ok: true,
          users: manager.users(),
        });
      }

      if (req.method === "POST" && (url.pathname === "/send" || url.pathname === "/api/send")) {
        if (!isAuthorized(req, forwarderSecret)) {
          return sendJson(res, 401, { ok: false, error: "Unauthorized send request." });
        }

        const body = await readJson(req);
        const messages = normalizeSendPayload(body);
        const results = [];

        for (const message of messages) {
          const result = sender
            ? await sender.sendMessage(message.to, message.text, message.contextToken, message.user)
            : await manager.sendMessage(message.user, message.to, message.text, message.contextToken);
          results.push({
            ok: true,
            user: message.user,
            to: message.to || "",
            result,
          });
        }

        return sendJson(res, 200, {
          ok: true,
          count: results.length,
          results,
        });
      }

      if (req.method === "POST" && (url.pathname === "/chat" || url.pathname === "/webhook/clawbot")) {
        if (url.pathname === "/webhook/clawbot" && !isAuthorized(req, webhookSecret)) {
          return sendJson(res, 401, { ok: false, error: "Unauthorized webhook request." });
        }

        const body = await readJson(req);
        const incoming = normalizeIncomingMessage(body);
        const reply = await routeMessage(incoming);

        return sendJson(res, 200, {
          reply,
          ok: true,
        });
      }

      return sendJson(res, 404, { ok: false, error: "Not found." });
    } catch (error) {
      const statusCode = error instanceof RequestError ? error.statusCode : 500;

      return sendJson(res, statusCode, {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  });
}

function normalizeSendPayload(body) {
  const rawMessages = Array.isArray(body.messages) ? body.messages : [body];
  const messages = rawMessages.map((item) => ({
    user: pickString(item, ["user", "profile", "account"]),
    text: pickString(item, ["text", "message", "content"]),
    to: pickString(item, ["to", "target", "userId", "toUserId", "openId"]),
    contextToken: pickString(item, ["contextToken", "context_token"]),
  }));

  for (const message of messages) {
    if (!message.text) {
      throw new RequestError(400, "Send payload requires text, message, or content.");
    }
  }

  return messages;
}

function isAuthorized(req, webhookSecret) {
  if (!webhookSecret || webhookSecret === "change-me") {
    return true;
  }

  const auth = req.headers.authorization || "";
  const headerSecret = req.headers["x-webhook-secret"] || "";
  const apiSecret = req.headers["x-api-secret"] || "";

  return auth === `Bearer ${webhookSecret}` || headerSecret === webhookSecret || apiSecret === webhookSecret;
}

function pickString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function sendJson(res, statusCode, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

async function readJson(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestError(400, "Request body must be valid JSON.");
  }
}

class RequestError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
