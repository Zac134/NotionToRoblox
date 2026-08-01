#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  loadCreateDatabasesConfig,
  loadSyncConfig,
  setConfig,
} from "./config.js";
import { runCreateDatabases } from "./createDatabases/runCreateDatabases.js";
import { loadEnvFile } from "./env.js";
import { runInit } from "./init/runInit.js";
import type { ResourceType } from "./types.js";
import { setLogLevel } from "./util/logger.js";
import { VERSION } from "./version.js";

type SyncCommand = "sync" | "update";
type Command = SyncCommand | "init" | "create-databases" | "create-db";

interface SyncParsedArgs {
  command: SyncCommand;
  dryRun: boolean;
  reportOnly: boolean;
  typeFilter?: ResourceType;
  targetFilter?: string;
  help: boolean;
  version: boolean;
}

interface InitParsedArgs {
  command: "init";
  force: boolean;
  help: boolean;
  version: boolean;
}

interface CreateDatabasesParsedArgs {
  command: "create-databases" | "create-db";
  parentPageId?: string;
  force: boolean;
  help: boolean;
  version: boolean;
}

type ParsedArgs =
  | SyncParsedArgs
  | InitParsedArgs
  | CreateDatabasesParsedArgs;

const RESOURCE_TYPES: ResourceType[] = [
  "developer-product",
  "game-pass",
  "badge",
  "asset",
];

const COMMANDS: Command[] = [
  "sync",
  "update",
  "init",
  "create-databases",
  "create-db",
];

function printUsage(): void {
  console.log(`Usage:
  ntn-roblox init [options]
  ntn-roblox create-db [options]
  ntn-roblox create-databases [options]
  ntn-roblox sync [options]
  ntn-roblox update [options]

Development:
  npm run init -- [options]
  npm run create-db -- [options]
  npm run sync -- [options]
  npm run update -- [options]

Commands:
  init                 Create .env and ntn-roblox.toml in the current directory
  create-db            Alias for create-databases
  create-databases     Create Notion databases and write IDs to ntn-roblox.toml
  sync                 Create Roblox items for rows without Roblox ID
  update               Update Roblox items for rows with Roblox ID

Init options:
  --force              Overwrite existing .env / ntn-roblox.toml
  --help, -h           Show this help message
  --version, -V        Show version

Create-databases options:
  --parent-page-id=<id>  Notion parent page ID (overrides ntn-roblox.toml)
  --force                Create new databases even if IDs are already configured
  --help, -h             Show this help message
  --version, -V          Show version

Sync / update options:
  --dry-run            Log planned mutations without writing to Roblox or Notion
  --report-only        List Roblox orphans only; skip create/update
  --type=<type>        Limit to one resource type (${RESOURCE_TYPES.join(" | ")})
  --target=<key>       Limit to one universe key (multi-universe configs only)
  --help, -h           Show this help message
  --version, -V        Show version
`);
}

function parseSyncArg(arg: string, parsed: SyncParsedArgs): void {
  if (
    arg.startsWith("--parent-page-id=") ||
    arg === "--write-toml"
  ) {
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
  if (arg.startsWith("--target=")) {
    const value = arg.slice("--target=".length).trim();
    if (!value) {
      throw new Error("Invalid --target value: value must not be empty");
    }
    parsed.targetFilter = value;
    return;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

function parseInitArg(arg: string, parsed: InitParsedArgs): void {
  if (
    arg === "--dry-run" ||
    arg === "--report-only" ||
    arg.startsWith("--type=") ||
    arg.startsWith("--target=") ||
    arg.startsWith("--parent-page-id=") ||
    arg === "--write-toml"
  ) {
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (arg === "--force") {
    parsed.force = true;
    return;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

function parseCreateDatabasesArg(
  arg: string,
  parsed: CreateDatabasesParsedArgs,
): void {
  if (
    arg === "--dry-run" ||
    arg === "--report-only" ||
    arg.startsWith("--type=") ||
    arg.startsWith("--target=") ||
    arg === "--write-toml"
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
  if (arg === "--force") {
    parsed.force = true;
    return;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

function isCommand(value: string): value is Command {
  return (COMMANDS as string[]).includes(value);
}

function normalizeCommand(command: Command): ParsedArgs["command"] {
  if (command === "create-db") {
    return "create-databases";
  }
  return command;
}

function parseArgs(argv: string[]): ParsedArgs {
  let command: Command | undefined;
  let help = false;
  let version = false;

  for (const arg of argv) {
    if (isCommand(arg)) {
      if (command) {
        throw new Error(`Unknown argument: ${arg}`);
      }
      command = arg;
    }
  }

  const resolvedCommand = command ?? "sync";

  const syncParsed: SyncParsedArgs = {
    command: resolvedCommand === "update" ? "update" : "sync",
    dryRun: false,
    reportOnly: false,
    help: false,
    version: false,
  };

  const initParsed: InitParsedArgs = {
    command: "init",
    force: false,
    help: false,
    version: false,
  };

  const createDatabasesParsed: CreateDatabasesParsedArgs = {
    command: "create-databases",
    force: false,
    help: false,
    version: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--version" || arg === "-V") {
      version = true;
      continue;
    }
    if (isCommand(arg)) {
      continue;
    }
    if (!arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    if (resolvedCommand === "sync" || resolvedCommand === "update") {
      parseSyncArg(arg, syncParsed);
    } else if (resolvedCommand === "init") {
      parseInitArg(arg, initParsed);
    } else {
      parseCreateDatabasesArg(arg, createDatabasesParsed);
    }
  }

  if (resolvedCommand === "init") {
    initParsed.help = help;
    initParsed.version = version;
    return initParsed;
  }

  if (resolvedCommand === "create-databases" || resolvedCommand === "create-db") {
    createDatabasesParsed.help = help;
    createDatabasesParsed.version = version;
    return createDatabasesParsed;
  }

  syncParsed.help = help;
  syncParsed.version = version;
  return syncParsed;
}

async function main(): Promise<void> {
  loadEnvFile();

  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    console.log(VERSION);
    return;
  }

  if (args.help) {
    printUsage();
    return;
  }

  if (args.command === "init") {
    await runInit({ force: args.force });
    return;
  }

  if (args.command === "create-databases") {
    const config = loadCreateDatabasesConfig({
      parentPageId: args.parentPageId,
    });
    setLogLevel(config.LOG_LEVEL);
    await runCreateDatabases(config, { force: args.force });
    return;
  }

  if (args.command !== "sync" && args.command !== "update") {
    return;
  }

  setConfig(loadSyncConfig());

  const { runSync, shouldExitWithError } = await import("./sync/engine.js");

  const result = await runSync({
    mode: args.command,
    dryRun: args.dryRun,
    reportOnly: args.reportOnly,
    typeFilter: args.typeFilter,
    targetFilter: args.targetFilter,
  });

  if (shouldExitWithError(result)) {
    process.exitCode = 1;
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch(async (error) => {
    const { logger } = await import("./util/logger.js");
    logger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { parseArgs, printUsage, VERSION };
