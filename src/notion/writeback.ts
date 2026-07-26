import type { UpdatePageParameters } from "@notionhq/client/build/src/api-endpoints.js";
import type { SyncStatus, WritebackPayload } from "../types.js";
import { notionRateLimiter } from "../util/rateLimit.js";
import { getNotionClient } from "./client.js";
import { NOTION_PROPERTY_NAMES, richTextFromString } from "./mapRow.js";
import { getSyncStatusPropertyType } from "./schema.js";

const MAX_SYNC_ERROR_LENGTH = 1900;

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
    properties[NOTION_PROPERTY_NAMES.robloxId] = {
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
): Promise<void> {
  const client = getNotionClient();
  await notionRateLimiter.schedule(() =>
    client.pages.update({
      page_id: pageId,
      properties: {
        [NOTION_PROPERTY_NAMES.robloxId]: {
          number: robloxId,
        },
      },
    }),
  );
}

export async function writebackSuccess(
  pageId: string,
  databaseId: string,
  robloxId: number,
): Promise<void> {
  await writebackPage(pageId, databaseId, {
    syncStatus: "Synced",
    syncError: "",
    robloxId,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function writebackError(
  pageId: string,
  databaseId: string,
  message: string,
  robloxId?: number,
): Promise<void> {
  await writebackPage(pageId, databaseId, {
    syncStatus: "Error",
    syncError: message,
    ...(robloxId !== undefined ? { robloxId } : {}),
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
