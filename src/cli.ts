#!/usr/bin/env node

import { loadInitConfig, loadSyncConfig, setConfig } from "./config.js";
import { loadEnvFile } from "./env.js";
import { runInit } from "./init/runInit.js";
import type { ResourceType } from "./types.js";
import { setLogLevel } from "./util/logger.js";

type Command = "sync" | "init";

interface SyncParsedArgs {
  command: "sync";
  dryRun: boolean;
  reportOnly: boolean;
  force: boolean;
  typeFilter?: ResourceType;
  help: boolean;
}

interface InitParsedArgs {
  command: "init";
  parentPageId?: string;
  writeToml: boolean;
  force: boolean;
  help: boolean;
}

type ParsedArgs = SyncParsedArgs | InitParsedArgs;

const RESOURCE_TYPES: ResourceType[] = [
  "developer-product",
  "game-pass",
  "badge",
];

function printUsage(): void {
  console.error(`Usage:
  ntn-roblox init [options]
  ntn-roblox sync [options]

Development:
  npm run init -- [options]
  npm run sync -- [options]

Commands:
  init                 Create Notion databases for sync
  sync                 Run full synchronization (default)

Init options:
  --parent-page-id=<id>  Notion parent page ID (overrides ntn-roblox.toml)
  --write-toml           Write created database IDs to ntn-roblox.toml
  --force                Create new databases even if IDs are already configured
  --help, -h             Show this help message

Sync options:
  --dry-run            Log planned mutations without writing to Roblox or Notion
  --report-only        List Roblox orphans only; skip create/update
  --force              Re-sync rows with Sync Status = Synced
  --type=<type>        Limit to one resource type (${RESOURCE_TYPES.join(" | ")})
  --help, -h           Show this help message
`);
}

function parseSyncArg(arg: string, parsed: SyncParsedArgs): void {
  if (arg.startsWith("--parent-page-id=") || arg === "--write-toml") {
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (arg === "--dry-run") {
    parsed.dryRun = true;
    return;
  }
  if (arg === "--report-only") {
    parsed.reportOnly = true;
    return;
  }
  if (arg === "--force") {
    parsed.force = true;
    return;
  }
  if (arg.startsWith("--type=")) {
    const value = arg.slice("--type=".length) as ResourceType;
    if (!RESOURCE_TYPES.includes(value)) {
      throw new Error(
        `Invalid --type value: ${value}. Expected one of: ${RESOURCE_TYPES.join(", ")}`,
      );
    }
    parsed.typeFilter = value;
    return;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

function parseInitArg(arg: string, parsed: InitParsedArgs): void {
  if (
    arg === "--dry-run" ||
    arg === "--report-only" ||
    arg.startsWith("--type=")
  ) {
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (arg.startsWith("--parent-page-id=")) {
    const value = arg.slice("--parent-page-id=".length).trim();
    if (!value) {
      throw new Error(
        "Invalid --parent-page-id value: value must not be empty",
      );
    }
    parsed.parentPageId = value;
    return;
  }
  if (arg === "--write-toml") {
    parsed.writeToml = true;
    return;
  }
  if (arg === "--force") {
    parsed.force = true;
    return;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

function parseArgs(argv: string[]): ParsedArgs {
  let command: Command | undefined;
  let help = false;

  for (const arg of argv) {
    if (arg === "sync" || arg === "init") {
      if (command) {
        throw new Error(`Unknown argument: ${arg}`);
      }
      command = arg;
    }
  }

  const resolvedCommand = command ?? "sync";

  const syncParsed: SyncParsedArgs = {
    command: "sync",
    dryRun: false,
    reportOnly: false,
    force: false,
    help: false,
  };

  const initParsed: InitParsedArgs = {
    command: "init",
    writeToml: false,
    force: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "sync" || arg === "init") {
      continue;
    }
    if (!arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    if (resolvedCommand === "sync") {
      parseSyncArg(arg, syncParsed);
    } else {
      parseInitArg(arg, initParsed);
    }
  }

  if (resolvedCommand === "init") {
    initParsed.help = help;
    return initParsed;
  }

  syncParsed.help = help;
  return syncParsed;
}

async function main(): Promise<void> {
  loadEnvFile();

  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (args.command === "init") {
    const initConfig = loadInitConfig({ parentPageId: args.parentPageId });
    setLogLevel(initConfig.LOG_LEVEL);
    await runInit(initConfig, {
      force: args.force,
      writeToml: args.writeToml,
    });
    return;
  }

  setConfig(loadSyncConfig());

  const { runSync, shouldExitWithError } = await import("./sync/engine.js");

  const result = await runSync({
    dryRun: args.dryRun,
    reportOnly: args.reportOnly,
    force: args.force,
    typeFilter: args.typeFilter,
  });

  if (shouldExitWithError(result)) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const { logger } = await import("./util/logger.js");
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
