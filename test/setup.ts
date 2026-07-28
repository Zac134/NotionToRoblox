import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSyncConfig, setConfig } from "../src/config.js";

process.env.NOTION_TOKEN ??= "test-notion-token";
process.env.ROBLOX_API_KEY ??= "test-roblox-api-key";

const fixtureToml = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/ntn-roblox.toml",
);
const targetToml = resolve(process.cwd(), "ntn-roblox.toml");

if (!existsSync(targetToml)) {
  copyFileSync(fixtureToml, targetToml);
}

setConfig(loadSyncConfig());
