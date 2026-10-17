import fs from "node:fs";
import path from "node:path";

export function loadUserConfig(userName = defaultUserName()) {
  const rootDir = process.cwd();
  const stateDir = path.resolve(rootDir, env("CLAWBOT_STATE_DIR", ".clawbot/users"));
  const user = sanitizeUserName(userName || defaultUserName());

  return {
    user,
    baseUrl: env("CLAWBOT_BASE_URL", env("WEIXIN_BASE_URL", "https://ilinkai.weixin.qq.com")),
    token: env(`CLAWBOT_${envKey(user)}_TOKEN`, ""),
    accountId: env(`CLAWBOT_${envKey(user)}_ACCOUNT_ID`, ""),
    target: env(`CLAWBOT_${envKey(user)}_TARGET`, ""),
    contextToken: env(`CLAWBOT_${envKey(user)}_CONTEXT_TOKEN`, ""),
    stateFile: path.join(stateDir, `${user}.json`),
    pollIntervalMs: numberEnv("CLAWBOT_POLL_INTERVAL_MS", 3000),
    sendMaxRetries: numberEnv("CLAWBOT_SEND_MAX_RETRIES", 3),
  };
}

export function configuredUsers() {
  const names = env("CLAWBOT_USERS", defaultUserName())
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  return [...new Set(names.map(sanitizeUserName))];
}

export function defaultUserName() {
  return sanitizeUserName(env("CLAWBOT_DEFAULT_USER", "wife"));
}

export function listKnownUsers() {
  const stateDir = path.resolve(process.cwd(), env("CLAWBOT_STATE_DIR", ".clawbot/users"));
  const fromConfig = configuredUsers();
  const fromFiles = fs.existsSync(stateDir)
    ? fs
        .readdirSync(stateDir, { withFileTypes: true })
        // Query journals and backups share this directory but are not user profiles.
        .filter((entry) => entry.isFile() && /^[a-z0-9_-]+\.json$/i.test(entry.name))
        .map((entry) => sanitizeUserName(entry.name.slice(0, -5)))
    : [];

  return [...new Set([...fromConfig, ...fromFiles])].map((user) => {
    const config = loadUserConfig(user);
    const state = readState(config.stateFile);

    return {
      user,
      default: user === defaultUserName(),
      bound: Boolean(state.token || config.token),
      accountId: state.accountId || config.accountId || "",
      userId: state.userId || "",
      stateFile: config.stateFile,
    };
  });
}

export function sanitizeUserName(user) {
  const normalized = String(user || "").trim().toLowerCase();

  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    throw new Error("User name must contain only letters, numbers, underscores, or hyphens.");
  }

  return normalized;
}

function readState(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const state = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));

    return state && typeof state === "object" && !Array.isArray(state) ? state : {};
  } catch (error) {
    console.warn(`[clawbot] ignoring invalid state file ${filePath}: ${error.message}`);
    return {};
  }
}

function envKey(user) {
  return user.replace(/[^a-z0-9]/gi, "_").toUpperCase();
}

function numberEnv(name, defaultValue) {
  const raw = env(name, "");

  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return value;
}

function env(name, defaultValue) {
  return process.env[name] ?? defaultValue;
}
