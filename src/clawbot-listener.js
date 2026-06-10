import { appendFileSync } from "node:fs";
import path from "node:path";
import { createClawBotClient } from "./clawbot/client.js";
import { createClawBotPoller } from "./clawbot/poller.js";
import { loadUserConfig } from "./clawbot/users.js";
import { loadEnvFile } from "./config/load-env.js";

loadEnvFile();

const config = loadUserConfig(readCliValue("--user") || readCliValue("--profile"));
const client = createClawBotClient(config);
const poller = createClawBotPoller(config);
const logFile = process.env.CLAWBOT_LOG_FILE || path.resolve(process.cwd(), "clawbot-listener.log");

process.on("beforeExit", (code) => {
  logError(`[process] beforeExit code=${code}`);
});

process.on("exit", (code) => {
  writeLog(`[process] exit code=${code}`);
});

process.on("unhandledRejection", (error) => {
  logError(`[process] unhandledRejection ${error?.stack || error}`);
});

process.on("uncaughtException", (error) => {
  logError(`[process] uncaughtException ${error?.stack || error}`);
  process.exitCode = 1;
});

main().catch((error) => {
  logError(`[fatal] ${error.stack || error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (process.argv.includes("--clawbot-qrcode")) {
    const qrcode = await client.createSetupQrCode();
    logInfo(`[clawbot:${config.user}] scan this URL with WeChat, then confirm on your phone:`);
    logInfo(qrcode.qrcode_img_content);
    return;
  }

  if (process.argv.includes("--clawbot-confirm-setup")) {
    const status = await client.confirmSetup();

    if (status.status === "confirmed") {
      logInfo(`[clawbot:${config.user}] login confirmed`);
      logInfo(`[clawbot] account_id=${status.ilink_bot_id}`);
      logInfo(`[clawbot] user_id=${status.ilink_user_id}`);
      return;
    }

    logInfo(`[clawbot:${config.user}] ${status.status}`);
    return;
  }

  if (process.argv.includes("--clawbot-setup")) {
    await client.setup();
    return;
  }

  if (process.argv.includes("--clawbot-test")) {
    await client.sendMessage(config.target, `qiushiClawBot 测试消息 ${new Date().toLocaleString("zh-CN", { hour12: false })}`);
    logInfo("[ok] ClawBot test message sent");
    return;
  }

  if (process.argv.includes("--clawbot-listen-once")) {
    const count = await poller.pollOnce();
    logInfo(`[clawbot] processed ${count} message(s)`);
    return;
  }

  logInfo(`[clawbot:${config.user}] listening every ${config.pollIntervalMs}ms`);

  for (;;) {
    try {
      const count = await poller.pollOnce();

      if (count > 0) {
        logInfo(`[clawbot:${config.user}] processed ${count} message(s)`);
      }
    } catch (error) {
      logError(`[clawbot:${config.user}] ${error.stack || error.message}`);
    }

    await sleep(config.pollIntervalMs);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logInfo(message) {
  writeLog(message);
  console.log(message);
}

function logError(message) {
  writeLog(message);
  console.error(message);
}

function writeLog(message) {
  appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}

function readCliValue(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return "";
  }

  return process.argv[index + 1] || "";
}
