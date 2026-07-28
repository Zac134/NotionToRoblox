import { Client } from "@notionhq/client";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type Config,
  isNotionDatabaseIdConfigured,
} from "../config.js";
import { updateNotionDatabaseIdsInToml } from "../tomlWrite.js";
import {
  createAllDatabases,
  CreateDatabasesError,
  type CreatedDatabaseIds,
  type PartialCreatedDatabaseIds,
} from "./createDatabases.js";
import { DATABASE_TITLES } from "./databaseSchemas.js";

export type InitConfig = Config;

export interface RunInitOptions {
  force: boolean;
  writeToml: boolean;
  tomlPath?: string;
}

const CONFIGURED_DB_FIELDS = [
  {
    valueKey: "NOTION_DEVPRODUCT_DB_ID" as const,
    tomlKey: "dev_product_db_id",
  },
  {
    valueKey: "NOTION_GAMEPASS_DB_ID" as const,
    tomlKey: "game_pass_db_id",
  },
  {
    valueKey: "NOTION_BADGE_DB_ID" as const,
    tomlKey: "badge_db_id",
  },
] as const;

const CREATED_DB_LINES = [
  { label: DATABASE_TITLES.developerProduct, idKey: "devProductDbId" as const },
  { label: DATABASE_TITLES.gamePass, idKey: "gamePassDbId" as const },
  { label: DATABASE_TITLES.badge, idKey: "badgeDbId" as const },
] as const;

function assertNoConfiguredDatabaseIds(initConfig: InitConfig): void {
  const configuredKeys = CONFIGURED_DB_FIELDS.filter(({ valueKey }) =>
    isNotionDatabaseIdConfigured(initConfig[valueKey]),
  ).map(({ tomlKey }) => tomlKey);

  if (configuredKeys.length === 0) {
    return;
  }

  throw new Error(
    `Notion database IDs are already configured (${configuredKeys.join(", ")}). Re-run with --force to create new databases anyway.`,
  );
}

function printCreatedDatabases(
  parentPageId: string,
  ids: PartialCreatedDatabaseIds,
): void {
  console.log(`Created Notion databases under parent ${parentPageId}:`);

  for (const { label, idKey } of CREATED_DB_LINES) {
    const id = ids[idKey];
    if (id) {
      console.log(`  ${label.padEnd(18)} ${id}`);
    }
  }
}

function resolveTomlPath(tomlPath?: string): string {
  return tomlPath ?? resolve(process.cwd(), "ntn-roblox.toml");
}

async function writeDatabaseIdsToToml(
  ids: CreatedDatabaseIds,
  tomlPath?: string,
): Promise<void> {
  const path = resolveTomlPath(tomlPath);
  const content = await readFile(path, "utf8");
  const updated = updateNotionDatabaseIdsInToml(content, ids);
  await writeFile(path, updated, "utf8");
  console.log(`Updated ${path}`);
}

export async function runInit(
  initConfig: InitConfig,
  options: RunInitOptions,
): Promise<CreatedDatabaseIds> {
  if (!options.force) {
    assertNoConfiguredDatabaseIds(initConfig);
  }

  const parentPageId = initConfig.NOTION_PARENT_PAGE_ID;
  if (!parentPageId) {
    throw new Error(
      "Invalid configuration: notion.parent_page_id is required for init",
    );
  }

  const client = new Client({ auth: initConfig.NOTION_TOKEN });

  try {
    await client.pages.retrieve({ page_id: parentPageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to access Notion parent page "${parentPageId}": ${message}`,
    );
  }

  try {
    const createdIds = await createAllDatabases({ client, parentPageId });
    printCreatedDatabases(parentPageId, createdIds);

    if (options.writeToml) {
      await writeDatabaseIdsToToml(createdIds, options.tomlPath);
    }

    return createdIds;
  } catch (error) {
    if (error instanceof CreateDatabasesError) {
      if (Object.keys(error.createdIds).length > 0) {
        printCreatedDatabases(parentPageId, error.createdIds);
      }
    }

    throw error;
  }
}
