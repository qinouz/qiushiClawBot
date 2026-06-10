import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvFile(filePath = resolve(process.cwd(), ".env")) {
  let content;

  try {
    content = readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (!parsed || process.env[parsed.key] !== undefined) {
      continue;
    }

    process.env[parsed.key] = parsed.value;
  }
}

export function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  const rawValue = trimmed.slice(separatorIndex + 1).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  return {
    key,
    value: unwrapValue(rawValue),
  };
}

function unwrapValue(value) {
  if (value.length < 2) {
    return value;
  }

  const quote = value[0];
  const isQuoted = (quote === "\"" || quote === "'") && value[value.length - 1] === quote;

  if (!isQuoted) {
    return value;
  }

  const inner = value.slice(1, -1);

  if (quote === "'") {
    return inner;
  }

  return inner
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
    .replaceAll('\\"', "\"")
    .replaceAll("\\\\", "\\");
}
