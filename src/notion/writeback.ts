import type { UpdatePageParameters } from "@notionhq/client/build/src/api-endpoints.js";
import type { WritebackPayload } from "../types.js";
import { getNotionClient } from "./client.js";
import { NOTION_PROPERTY_NAMES, richTextFromString } from "./mapRow.js";
import { notionRateLimiter } from "../util/rateLimit.js";

const MAX_SYNC_ERROR_LENGTH = 1900;

export async function writebackPage(
  pageId: string,
  payload: WritebackPayload,
): Promise<void> {
  const properties: UpdatePageParameters["properties"] = {
    [NOTION_PROPERTY_NAMES.syncStatus]: {
      select: { name: payload.syncStatus },
    },
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

export async function writebackSuccess(
  pageId: string,
  robloxId: number,
): Promise<void> {
  await writebackPage(pageId, {
    syncStatus: "Synced",
    syncError: "",
    robloxId,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function writebackError(
  pageId: string,
  message: string,
): Promise<void> {
  await writebackPage(pageId, {
    syncStatus: "Error",
    syncError: message,
  });
}

export async function writebackSkipped(
  pageId: string,
  reason: string,
): Promise<void> {
  await writebackPage(pageId, {
    syncStatus: "Skipped",
    syncError: reason,
  });
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}
