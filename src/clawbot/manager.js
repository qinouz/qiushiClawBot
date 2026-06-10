import { createClawBotClient } from "./client.js";
import { configuredUsers, listKnownUsers, loadUserConfig } from "./users.js";

export function createClawBotManager() {
  const clients = new Map();

  return {
    getClient: (user) => getClient(clients, user),
    sendMessage: async (user, target, text, contextToken = "") => {
      const client = getClient(clients, user);
      return client.sendMessage(target, text, contextToken);
    },
    users: () => listKnownUsers(),
    configuredUsers,
  };
}

function getClient(clients, user) {
  const config = loadUserConfig(user);

  if (!clients.has(config.user)) {
    clients.set(config.user, createClawBotClient(config));
  }

  return clients.get(config.user);
}
