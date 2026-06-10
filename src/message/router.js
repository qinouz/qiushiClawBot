import { handleAccountingMessage } from "../modules/accounting.js";

export async function routeMessage(incoming) {
  const text = incoming.text;

  if (!text) {
    return "我收到了空消息，先发一段文字给我吧。";
  }

  if (isAccountingIntent(text)) {
    return handleAccountingMessage(incoming);
  }

  if (text === "/ping" || text.toLowerCase() === "ping") {
    return "pong";
  }

  return `收到：${text}`;
}

function isAccountingIntent(text) {
  return /^(记账|账单|消费|收入)(?:\s|:|：|$)/.test(text.trim());
}
