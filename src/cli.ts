#!/usr/bin/env node

import { loadEnvFile } from "./env.js";
import type { ResourceType } from "./types.js";

interface ParsedArgs {
  command?: string;
  dryRun: boolean;
  reportOnly: boolean;
  typeFilter?: ResourceType;
  help: boolean;
}

const RESOURCE_TYPES: ResourceType[] = [
  "developer-product",
  "game-pass",
  "badge",
];

function printUsage(): void {
  console.error(`Usage:
  ntn-roblox sync [options]

Development:
  npm run sync -- [options]

Commands:
  sync                 Run full synchronization (default)

Options:
  --dry-run            Log planned mutations without writing to Roblox or Notion
  --report-only        List Roblox orphans only; skip create/update
  --type=<type>        Limit to one resource type (${RESOURCE_TYPES.join(" | ")})
  --help, -h           Show this help message
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    dryRun: false,
    reportOnly: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--report-only") {
      parsed.reportOnly = true;
      continue;
    }
    if (arg.startsWith("--type=")) {
      const value = arg.slice("--type=".length) as ResourceType;
      if (!RESOURCE_TYPES.includes(value)) {
        throw new Error(
          `Invalid --type value: ${value}. Expected one of: ${RESOURCE_TYPES.join(", ")}`,
        );
      }
      parsed.typeFilter = value;
      continue;
    }
    if (!arg.startsWith("-") && !parsed.command) {
      parsed.command = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

async function main(): Promise<void> {
  loadEnvFile();

  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  const command = args.command ?? "sync";
  if (command !== "sync") {
    throw new Error(`Unknown command: ${command}`);
  }

  const { runSync, shouldExitWithError } = await import("./sync/engine.js");

  const result = await runSync({
    dryRun: args.dryRun,
    reportOnly: args.reportOnly,
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
