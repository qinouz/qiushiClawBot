export function normalizeIncomingMessage(payload = {}) {
  const message = pickString(payload, [
    "message",
    "text",
    "content",
    "msg.text",
    "msg.content",
    "event.text",
    "event.content",
    "data.text",
    "data.content",
  ]);

  const from = pickString(payload, [
    "from",
    "fromUser",
    "from_user_id",
    "sender",
    "sender.id",
    "user.id",
    "msg.from",
    "event.from",
  ]);

  const room = pickString(payload, [
    "room",
    "roomId",
    "room_id",
    "conversationId",
    "chat.id",
    "msg.room",
    "event.room",
  ]);

  return {
    text: message.trim(),
    from: from.trim(),
    room: room.trim(),
    raw: payload.raw ?? payload,
  };
}

function pickString(source, paths) {
  for (const path of paths) {
    const value = getByPath(source, path);

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

function getByPath(source, path) {
  return path.split(".").reduce((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return current[key];
  }, source);
}
