import type { UpdatePageParameters } from "@notionhq/client/build/src/api-endpoints.js";
import type { SyncStatus, WritebackPayload } from "../types.js";
import { notionRateLimiter } from "../util/rateLimit.js";
import { robloxIdPropertyName } from "./propertyNames.js";
import { getNotionClient } from "./client.js";
import { NOTION_PROPERTY_NAMES, richTextFromString } from "./mapRow.js";
import { getSyncStatusPropertyType } from "./schema.js";

const MAX_SYNC_ERROR_LENGTH = 1900;

export interface TargetResult {
  targetKey: string | null;
  outcome: "created" | "updated" | "skipped" | "error";
  robloxId?: number;
  message?: string;
}

export interface AggregatedWriteback {
  syncStatus: SyncStatus;
  syncError: string;
  robloxIds: Record<string, number>;
  lastSyncedAt?: string;
}

export function aggregateTargetResults(
  results: TargetResult[],
): AggregatedWriteback {
  const errors: string[] = [];
  const skips: string[] = [];
  const robloxIds: Record<string, number> = {};
  let hasSuccess = false;

  for (const result of results) {
    const prefix =
      result.targetKey !== null ? `[${result.targetKey}] ` : "";

    if (result.robloxId !== undefined && result.targetKey !== null) {
      robloxIds[result.targetKey] = result.robloxId;
    } else if (result.robloxId !== undefined && result.targetKey === null) {
      robloxIds[""] = result.robloxId;
    }

    if (result.outcome === "created" || result.outcome === "updated") {
      hasSuccess = true;
    } else if (result.outcome === "error" && result.message) {
      errors.push(`${prefix}${result.message}`);
    } else if (result.outcome === "skipped" && result.message) {
      skips.push(`${prefix}${result.message}`);
    }
  }

  if (errors.length > 0) {
    return {
      syncStatus: "Error",
      syncError: errors.join("\n"),
      robloxIds,
    };
  }

  if (!hasSuccess && skips.length > 0) {
    return {
      syncStatus: "Skipped",
      syncError: skips.join("\n"),
      robloxIds,
    };
  }

  return {
    syncStatus: "Synced",
    syncError: "",
    robloxIds,
    lastSyncedAt: new Date().toISOString(),
  };
}

export async function writebackPage(
  pageId: string,
  databaseId: string,
  payload: WritebackPayload,
): Promise<void> {
  const properties: NonNullable<UpdatePageParameters["properties"]> = {
    [NOTION_PROPERTY_NAMES.syncStatus]: buildSyncStatusProperty(
      databaseId,
      payload.syncStatus,
    ),
  };

  if (payload.syncError !== undefined) {
    properties[NOTION_PROPERTY_NAMES.syncError] = {
      rich_text: richTextFromString(
        truncate(payload.syncError, MAX_SYNC_ERROR_LENGTH),
      ),
    };
  }

  if (payload.robloxId !== undefined) {
    const targetKey = payload.robloxIdTargetKey ?? null;
    properties[robloxIdPropertyName(targetKey)] = {
      number: payload.robloxId,
    };
  }

  if (payload.lastSyncedAt !== undefined) {
    properties[NOTION_PROPERTY_NAMES.lastSyncedAt] = {
      date: { start: payload.lastSyncedAt },
    };
  }

  const client = getNotionClient();
  await notionRateLimiter.schedule(() =>
    client.pages.update({
      page_id: pageId,
      properties,
    }),
  );
}

export async function writebackRobloxId(
  pageId: string,
  _databaseId: string,
  robloxId: number,
  targetKey: string | null = null,
): Promise<void> {
  const client = getNotionClient();
  await notionRateLimiter.schedule(() =>
    client.pages.update({
      page_id: pageId,
      properties: {
        [robloxIdPropertyName(targetKey)]: {
          number: robloxId,
        },
      },
    }),
  );
}

export async function writebackAggregatedTargetResults(
  pageId: string,
  databaseId: string,
  aggregated: AggregatedWriteback,
): Promise<void> {
  const properties: NonNullable<UpdatePageParameters["properties"]> = {
    [NOTION_PROPERTY_NAMES.syncStatus]: buildSyncStatusProperty(
      databaseId,
      aggregated.syncStatus,
    ),
    [NOTION_PROPERTY_NAMES.syncError]: {
      rich_text: richTextFromString(
        truncate(aggregated.syncError, MAX_SYNC_ERROR_LENGTH),
      ),
    },
  };

  for (const [key, robloxId] of Object.entries(aggregated.robloxIds)) {
    const targetKey = key === "" ? null : key;
    properties[robloxIdPropertyName(targetKey)] = { number: robloxId };
  }

  if (aggregated.lastSyncedAt !== undefined) {
    properties[NOTION_PROPERTY_NAMES.lastSyncedAt] = {
      date: { start: aggregated.lastSyncedAt },
    };
  }

  const client = getNotionClient();
  await notionRateLimiter.schedule(() =>
    client.pages.update({
      page_id: pageId,
      properties,
    }),
  );
}

export async function writebackSuccess(
  pageId: string,
  databaseId: string,
  robloxId: number,
  targetKey: string | null = null,
): Promise<void> {
  await writebackPage(pageId, databaseId, {
    syncStatus: "Synced",
    syncError: "",
    robloxId,
    robloxIdTargetKey: targetKey,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function writebackError(
  pageId: string,
  databaseId: string,
  message: string,
  robloxId?: number,
  targetKey: string | null = null,
): Promise<void> {
  await writebackPage(pageId, databaseId, {
    syncStatus: "Error",
    syncError: message,
    ...(robloxId !== undefined
      ? { robloxId, robloxIdTargetKey: targetKey }
      : {}),
  });
}

export async function writebackSkipped(
  pageId: string,
  databaseId: string,
  reason: string,
): Promise<void> {
  await writebackPage(pageId, databaseId, {
    syncStatus: "Skipped",
    syncError: reason,
  });
}

export function buildSyncStatusProperty(
  databaseId: string,
  name: SyncStatus,
):
  | { select: { name: SyncStatus } }
  | { status: { name: SyncStatus } } {
  const propertyType = getSyncStatusPropertyType(databaseId);
  if (propertyType === "status") {
    return { status: { name } };
  }
  return { select: { name } };
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}
