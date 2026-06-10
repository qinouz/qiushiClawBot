import assert from "node:assert/strict";
import test from "node:test";
import { createClawBotServer } from "../src/app.js";

test("POST /chat returns bridge-compatible reply", async () => {
  const server = createClawBotServer();
  await listen(server);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "记账 午饭 28",
        from: "wx-user",
      }),
    });

    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.reply, "已记录：午饭 28 元");
  } finally {
    await close(server);
  }
});

test("POST /webhook/clawbot enforces secret when configured", async () => {
  const server = createClawBotServer({ webhookSecret: "secret" });
  await listen(server);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/webhook/clawbot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "ping" }),
    });

    assert.equal(response.status, 401);
  } finally {
    await close(server);
  }
});

test("POST /send forwards message through configured sender", async () => {
  const sent = [];
  const server = createClawBotServer({
    forwarderSecret: "secret",
    sender: {
      sendMessage: async (to, text, contextToken) => {
        sent.push({ to, text, contextToken });
        return { ret: 0, msg_id: "msg-1" };
      },
    },
  });
  await listen(server);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Secret": "secret",
      },
      body: JSON.stringify({
        to: "wx-user",
        message: "hello",
        contextToken: "ctx",
      }),
    });

    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.deepEqual(sent, [{ to: "wx-user", text: "hello", contextToken: "ctx" }]);
  } finally {
    await close(server);
  }
});

test("POST /send forwards selected user to sender test double", async () => {
  const sent = [];
  const server = createClawBotServer({
    sender: {
      sendMessage: async (to, text, contextToken, user) => {
        sent.push({ user, to, text, contextToken });
        return { ret: 0 };
      },
    },
  });
  await listen(server);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: "wife",
        message: "hello",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(sent, [{ user: "wife", to: "", text: "hello", contextToken: "" }]);
  } finally {
    await close(server);
  }
});

test("GET /users returns manager users", async () => {
  const server = createClawBotServer({
    manager: {
      users: () => [{ user: "wife", default: true, bound: true }],
      sendMessage: async () => ({ ret: 0 }),
    },
  });
  await listen(server);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/users`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(data.users, [{ user: "wife", default: true, bound: true }]);
  } finally {
    await close(server);
  }
});

test("POST /send rejects missing secret when configured", async () => {
  const server = createClawBotServer({
    forwarderSecret: "secret",
    sender: {
      sendMessage: async () => ({ ret: 0 }),
    },
  });
  await listen(server);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    assert.equal(response.status, 401);
  } finally {
    await close(server);
  }
});

test("POST /send returns 400 when message is missing", async () => {
  const server = createClawBotServer({
    sender: {
      sendMessage: async () => ({ ret: 0 }),
    },
  });
  await listen(server);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 400);
  } finally {
    await close(server);
  }
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
