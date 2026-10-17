import {
  createClawBotClient,
  extractClawBotText,
  loadClawBotConfig,
} from "./client.js";
import { configuredUsers, listKnownUsers, loadUserConfig } from "./users.js";
import { createCreatorUpdateCommands } from "../modules/creator-updates.js";
import { createVideoCommands } from "../modules/video-commands.js";
import { createCodexRelay } from "../modules/codex-relay.js";

export function createClawBotPoller(config = loadClawBotConfig()) {
  const client = createClawBotClient(config);
  const commands = createCreatorUpdateCommands(config, client);
  const videoCommands = createVideoCommands(config, client);
  const codexRelay = createCodexRelay(config, client);
  const handlers = {
    enqueue: (msg, text) => codexRelay.enqueueExplicit(msg, text) || codexRelay.enqueueVideoChat(msg, text) || videoCommands.enqueue(msg, text) || commands.enqueue(msg, text) || codexRelay.enqueueChat(msg, text),
    flush: async () => { await videoCommands.flush(); await commands.flush(); await codexRelay.flush(); },
  };

  return {
    config,
    pollOnce: () => pollOnce(client, config, handlers),
    start: () => startPolling(client, config, handlers),
  };
}

export function startConfiguredPollers() {
  const configured = new Set(configuredUsers());

  for (const entry of listKnownUsers().filter((user) => configured.has(user.user))) {
    if (!entry.bound) {
      console.log(`[clawbot:${entry.user}] skip polling because user is not bound`);
      continue;
    }

    createClawBotPoller(loadUserConfig(entry.user)).start();
  }
}

async function startPolling(client, config, commands) {
  console.log(`[clawbot:${config.user}] listening every ${config.pollIntervalMs}ms`);

  for (;;) {
    try {
      const count = await pollOnce(client, config, commands);

      if (count > 0) {
        console.log(`[clawbot:${config.user}] processed ${count} message(s)`);
      }
    } catch (error) {
      console.error(`[clawbot:${config.user}] ${error.stack || error.message}`);
    }

    await sleep(config.pollIntervalMs);
  }
}

async function pollOnce(client, config, commands) {
  const msgs = await client.getUpdates();
  let handled = 0;

  for (const msg of msgs) {
    if (msg.from_user_id === config.accountId) {
      continue;
    }

    const text = extractClawBotText(msg);

    if (!text) {
      continue;
    }

    if (commands.enqueue(msg, text)) {
      handled += 1;
      continue;
    }

    console.log(`[clawbot:${config.user}] received from ${msg.from_user_id || "unknown"}: ${text}`);

    handled += 1;
  }

  await commands.flush();
  return handled;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
