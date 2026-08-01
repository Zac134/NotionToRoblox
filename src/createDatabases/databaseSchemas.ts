import type { CreateDatabaseParameters } from "@notionhq/client/build/src/api-endpoints.js";
import { SUPPORTED_ASSET_TYPES } from "../assetTypes.js";
import { NOTION_PROPERTY_NAMES } from "../notion/mapRow.js";
import { ASSET_PROPERTY_NAMES } from "../notion/propertyNames.js";
import { SYNC_STATUSES } from "../types.js";

export const DATABASE_TITLES = {
  developerProduct: "Developer Products",
  gamePass: "Game Passes",
  badge: "Badges",
  asset: "Assets",
} as const;

function buildSharedProperties(): CreateDatabaseParameters["properties"] {
  return {
    [NOTION_PROPERTY_NAMES.name]: { title: {} },
    [NOTION_PROPERTY_NAMES.description]: { rich_text: {} },
    [NOTION_PROPERTY_NAMES.icon]: { files: {} },
    [NOTION_PROPERTY_NAMES.robloxId]: { number: {} },
    [NOTION_PROPERTY_NAMES.syncStatus]: {
      select: {
        options: SYNC_STATUSES.map((name) => ({ name })),
      },
    },
    [NOTION_PROPERTY_NAMES.syncError]: { rich_text: {} },
    [NOTION_PROPERTY_NAMES.lastSyncedAt]: { date: {} },
  };
}

export function developerProductDatabaseProperties(): CreateDatabaseParameters["properties"] {
  return {
    ...buildSharedProperties(),
    [NOTION_PROPERTY_NAMES.price]: { number: {} },
    [NOTION_PROPERTY_NAMES.isForSale]: { checkbox: {} },
  };
}

export function gamePassDatabaseProperties(): CreateDatabaseParameters["properties"] {
  return {
    ...buildSharedProperties(),
    [NOTION_PROPERTY_NAMES.price]: { number: {} },
    [NOTION_PROPERTY_NAMES.isForSale]: { checkbox: {} },
  };
}

export function badgeDatabaseProperties(): CreateDatabaseParameters["properties"] {
  return {
    ...buildSharedProperties(),
    [NOTION_PROPERTY_NAMES.isActive]: { checkbox: {} },
  };
}

export function assetDatabaseProperties(): CreateDatabaseParameters["properties"] {
  return {
    [NOTION_PROPERTY_NAMES.name]: { title: {} },
    [NOTION_PROPERTY_NAMES.description]: { rich_text: {} },
    [ASSET_PROPERTY_NAMES.file]: { files: {} },
    [ASSET_PROPERTY_NAMES.assetType]: {
      select: {
        options: SUPPORTED_ASSET_TYPES.map((name) => ({ name })),
      },
    },
    [NOTION_PROPERTY_NAMES.robloxId]: { number: {} },
    [NOTION_PROPERTY_NAMES.syncStatus]: {
      select: {
        options: SYNC_STATUSES.map((name) => ({ name })),
      },
    },
    [NOTION_PROPERTY_NAMES.syncError]: { rich_text: {} },
    [NOTION_PROPERTY_NAMES.lastSyncedAt]: { date: {} },
  };
}
