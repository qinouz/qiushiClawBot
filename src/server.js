import { loadEnvFile } from "./config/load-env.js";
import { createClawBotServer } from "./app.js";
import { startConfiguredPollers } from "./clawbot/poller.js";

loadEnvFile();

const DEFAULT_PORT = 8711;
const port = Number(process.env.PORT || DEFAULT_PORT);
const host = process.env.HOST || "127.0.0.1";
const server = createClawBotServer();

server.listen(port, host, () => {
  console.log(`qiushi-clawbot listening on http://${host}:${port}`);
});

if (process.env.CLAWBOT_AUTO_LISTEN !== "false") {
  startConfiguredPollers();
}
