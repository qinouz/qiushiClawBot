import {
  createClawBotClient,
  extractClawBotText,
  loadClawBotConfig,
} from "./client.js";
import { configuredUsers, listKnownUsers, loadUserConfig } from "./users.js";

export function createClawBotPoller(config = loadClawBotConfig()) {
  const client = createClawBotClient(config);

  return {
    config,
    pollOnce: () => pollOnce(client, config),
    start: () => startPolling(client, config),
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

async function startPolling(client, config) {
  console.log(`[clawbot:${config.user}] listening every ${config.pollIntervalMs}ms`);

  for (;;) {
    try {
      const count = await pollOnce(client, config);

      if (count > 0) {
        console.log(`[clawbot:${config.user}] processed ${count} message(s)`);
      }
    } catch (error) {
      console.error(`[clawbot:${config.user}] ${error.stack || error.message}`);
    }

    await sleep(config.pollIntervalMs);
  }
}

async function pollOnce(client, config) {
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

    console.log(`[clawbot:${config.user}] received from ${msg.from_user_id || "unknown"}: ${text}`);

    handled += 1;
  }

  return handled;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
