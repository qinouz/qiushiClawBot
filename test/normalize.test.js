import assert from "node:assert/strict";
import test from "node:test";
import { normalizeIncomingMessage } from "../src/message/normalize.js";
import { routeMessage } from "../src/message/router.js";

test("normalizes direct chat payload", () => {
  const incoming = normalizeIncomingMessage({
    message: "  你好  ",
    from: "user-1",
  });

  assert.equal(incoming.text, "你好");
  assert.equal(incoming.from, "user-1");
});

test("normalizes nested webhook payload", () => {
  const incoming = normalizeIncomingMessage({
    event: {
      text: "ping",
      from: "wx-user",
      room: "room-1",
    },
  });

  assert.equal(incoming.text, "ping");
  assert.equal(incoming.from, "wx-user");
  assert.equal(incoming.room, "room-1");
});

test("routes accounting intent", async () => {
  const reply = await routeMessage({
    text: "记账 午饭 28",
    from: "user-1",
    room: "",
    raw: {},
  });

  assert.equal(reply, "已记录：午饭 28 元");
});
