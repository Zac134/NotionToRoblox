import type { DatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import type { ResourceType } from "../types.js";
import { notionRateLimiter } from "../util/rateLimit.js";
import { databaseIdForType, getNotionClient } from "./client.js";
import { NOTION_PROPERTY_NAMES } from "./mapRow.js";

export type SyncStatusPropertyType = "select" | "status";

const syncStatusTypeCache = new Map<string, SyncStatusPropertyType>();

const TYPE_LABELS: Record<ResourceType, string> = {
  "developer-product": "Developer Product",
  "game-pass": "Game Pass",
  badge: "Badge",
  asset: "Asset",
};

export async function ensureSyncStatusSchemas(
  types: ResourceType[],
): Promise<void> {
  for (const type of types) {
    const databaseId = databaseIdForType(type);
    if (syncStatusTypeCache.has(databaseId)) {
      continue;
    }

    const client = getNotionClient();
    const database = (await notionRateLimiter.schedule(() =>
      client.databases.retrieve({ database_id: databaseId }),
    )) as DatabaseObjectResponse;

    const property = database.properties[NOTION_PROPERTY_NAMES.syncStatus];
    if (!property) {
      throw new Error(
        `${TYPE_LABELS[type]} database (${databaseId}): missing required property "${NOTION_PROPERTY_NAMES.syncStatus}"`,
      );
    }

    if (property.type !== "select" && property.type !== "status") {
      throw new Error(
        `${TYPE_LABELS[type]} database (${databaseId}): "${NOTION_PROPERTY_NAMES.syncStatus}" must be select or status, got ${property.type}`,
      );
    }

    syncStatusTypeCache.set(databaseId, property.type);
  }
}

export function seedSyncStatusPropertyTypeForTests(
  databaseId: string,
  type: SyncStatusPropertyType,
): void {
  syncStatusTypeCache.set(databaseId, type);
}

export function getSyncStatusPropertyType(
  databaseId: string,
): SyncStatusPropertyType {
  const cached = syncStatusTypeCache.get(databaseId);
  if (!cached) {
    throw new Error(
      `Sync Status schema not loaded for database ${databaseId}. Call ensureSyncStatusSchemas first.`,
    );
  }
  return cached;
}
