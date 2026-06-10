import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadEnvFile, parseEnvLine } from "../src/config/load-env.js";

test("parses env lines", () => {
  assert.deepEqual(parseEnvLine("PORT=8787"), { key: "PORT", value: "8787" });
  assert.deepEqual(parseEnvLine("BOT_NAME=\"Qiu Shi\""), { key: "BOT_NAME", value: "Qiu Shi" });
  assert.equal(parseEnvLine("# comment"), null);
});

test("loads .env without overriding existing environment values", () => {
  const dir = mkdtempSync(join(tmpdir(), "qiushi-env-"));
  const file = join(dir, ".env");
  const originalPort = process.env.PORT;
  const originalBotName = process.env.BOT_NAME;

  process.env.PORT = "9999";
  delete process.env.BOT_NAME;
  writeFileSync(file, "PORT=8787\nBOT_NAME=QiuShi\n", "utf8");

  try {
    loadEnvFile(file);

    assert.equal(process.env.PORT, "9999");
    assert.equal(process.env.BOT_NAME, "QiuShi");
  } finally {
    restoreEnv("PORT", originalPort);
    restoreEnv("BOT_NAME", originalBotName);
    rmSync(dir, { recursive: true, force: true });
  }
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
