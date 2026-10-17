import assert from "node:assert/strict";
import test from "node:test";
import { createCreatorUpdateCommands, isCreatorUpdateCommand } from "../src/modules/creator-updates.js";

test("creator command recognition", () => {
  for (const text of ["查更新", "查更新 dreamfallart", "dreamfallart 更新了吗？", "有更新吗", "dreamfallart更没更新"]) assert.equal(isCreatorUpdateCommand(text), true, text);
  for (const text of ["测试", "ping", "记账 午饭 28", "今天更新了系统"]) assert.equal(isCreatorUpdateCommand(text), false, text);
});

test("only bound me can query; restart dedupe and failed reply retry", async () => {
  let state = {};
  let clock = 1000;
  let queryCount = 0;
  let shouldFail = true;
  const sent = [];
  const options = {
    env: { CREATOR_UPDATES_QUERY_URL: "http://localhost/query", FORWARDER_SECRET: "test-secret" },
    getBoundTarget: () => "bound-me", now: () => clock,
    store: { read: () => structuredClone(state), write: value => { state = structuredClone(value); } },
    logger: { info() {}, error() {} },
    fetchImpl: async (_url, request) => {
      queryCount += 1;
      assert.equal(request.headers.Authorization, "Bearer test-secret");
      assert.equal(JSON.parse(request.body).text, "查更新");
      return { ok: true, json: async () => ({ ok: true, reply: "本次检查没有发现新更新。" }) };
    },
  };
  const config = { user: "me", stateFile: "unused" };
  const client = { sendMessage: async (to, reply) => { if (shouldFail) throw Error("send failed"); sent.push({ to, reply }); } };
  const commands = createCreatorUpdateCommands(config, client, options);
  assert.equal(commands.enqueue({ message_id: "wrong", from_user_id: "someone-else" }, "查更新"), false);
  assert.equal(commands.enqueue({ message_id: "ordinary", from_user_id: "bound-me" }, "测试"), false);
  const msg = { message_id: "q1", from_user_id: "bound-me" };
  assert.equal(commands.enqueue(msg, "查更新"), true);
  await Promise.all([commands.flush(), commands.flush()]);
  assert.equal(queryCount, 1);
  assert.equal(state.q1.sentAt, null);
  const restarted = createCreatorUpdateCommands(config, client, options);
  restarted.enqueue(msg, "查更新");
  await restarted.flush();
  assert.equal(sent.length, 0);
  clock += 60001; shouldFail = false;
  await restarted.flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "bound-me");
  assert.equal(queryCount, 1, "retry reuses answer, does not re-run collection");
  restarted.enqueue(msg, "查更新"); await restarted.flush();
  assert.equal(sent.length, 1);
  const wife = createCreatorUpdateCommands({ ...config, user: "wife" }, client, options);
  assert.equal(wife.enqueue({ ...msg, message_id: "q2" }, "查更新"), false);
});

test("unavailable project returns a clear reply without secrets", async () => {
  let state = {};
  let reply = "";
  const commands = createCreatorUpdateCommands({ user: "me", stateFile: "unused" }, { sendMessage: async (_to, text) => { reply = text; } }, {
    env: { CREATOR_UPDATES_QUERY_URL: "http://localhost/query", FORWARDER_SECRET: "test-secret" },
    getBoundTarget: () => "me-id", logger: { info() {} },
    store: { read: () => state, write: value => { state = value; } },
    fetchImpl: async () => { throw Error("test-secret"); },
  });
  commands.enqueue({ message_id: "q1", from_user_id: "me-id" }, "查更新");
  await commands.flush();
  assert.match(reply, /连接不上/);
  assert.ok(!reply.includes("test-secret"));
});
