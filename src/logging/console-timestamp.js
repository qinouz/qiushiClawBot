// 给 console 输出统一加本地时间前缀，便于和 supervisor 的启动标记对齐。
let installed = false;

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}

export function stamp(now = new Date()) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
  return `${date} ${time}`;
}

export function installConsoleTimestamps() {
  if (installed) return;
  installed = true;
  for (const method of ["log", "info", "warn", "error", "debug"]) {
    const original = console[method];
    if (typeof original !== "function") continue;
    console[method] = (...args) => original.call(console, `[${stamp()}]`, ...args);
  }
}
