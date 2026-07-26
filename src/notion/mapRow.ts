import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import type {
  BadgeRow,
  DeveloperProductRow,
  GamePassRow,
  NotionRow,
  RowMappingError,
  SyncStatus,
} from "../types.js";
import { SYNC_STATUSES } from "../types.js";

const PROPERTY = {
  name: "Name",
  description: "Description",
  icon: "Icon",
  robloxId: "Roblox ID",
  syncStatus: "Sync Status",
  syncError: "Sync Error",
  lastSyncedAt: "Last Synced At",
  price: "Price",
  isForSale: "Is For Sale",
  isActive: "Is Active",
} as const;

export function mapDeveloperProductPage(
  page: PageObjectResponse,
): DeveloperProductRow | RowMappingError {
  const base = mapBasePage(page, "developer-product");
  if ("message" in base) {
    return base;
  }

  return {
    ...base,
    type: "developer-product",
    price: readOptionalNumber(page, PROPERTY.price),
    isForSale: readCheckbox(page, PROPERTY.isForSale, true),
  };
}

export function mapGamePassPage(
  page: PageObjectResponse,
): GamePassRow | RowMappingError {
  const base = mapBasePage(page, "game-pass");
  if ("message" in base) {
    return base;
  }

  return {
    ...base,
    type: "game-pass",
    price: readOptionalNumber(page, PROPERTY.price),
    isForSale: readCheckbox(page, PROPERTY.isForSale, true),
  };
}

export function mapBadgePage(
  page: PageObjectResponse,
): BadgeRow | RowMappingError {
  const base = mapBasePage(page, "badge");
  if ("message" in base) {
    return base;
  }

  return {
    ...base,
    type: "badge",
    isActive: readCheckbox(page, PROPERTY.isActive, true),
  };
}

function mapBasePage(
  page: PageObjectResponse,
  _type: NotionRow["type"],
): (Omit<NotionRow, "type"> & { type?: never }) | RowMappingError {
  const pageId = page.id;

  try {
    const name = readTitle(page, PROPERTY.name);
    if (!name) {
      return { pageId, message: `Missing required property: ${PROPERTY.name}` };
    }

    const syncStatus = readSyncStatus(page, PROPERTY.syncStatus);
    if (!syncStatus) {
      return {
        pageId,
        message: `Missing or invalid ${PROPERTY.syncStatus}. Expected one of: ${SYNC_STATUSES.join(", ")}`,
      };
    }

    return {
      pageId,
      name,
      description: readRichText(page, PROPERTY.description),
      iconUrl: readFirstFileUrl(page, PROPERTY.icon),
      robloxId: readOptionalNumber(page, PROPERTY.robloxId),
      syncStatus,
      syncError: readRichText(page, PROPERTY.syncError),
      lastSyncedAt: readOptionalDate(page, PROPERTY.lastSyncedAt),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown mapping error";
    return { pageId, message };
  }
}

function readTitle(page: PageObjectResponse, propertyName: string): string {
  const property = page.properties[propertyName];
  if (!property || property.type !== "title") {
    throw new Error(`Property "${propertyName}" is not a title property`);
  }
  return property.title
    .map((item) => item.plain_text)
    .join("")
    .trim();
}

function readRichText(page: PageObjectResponse, propertyName: string): string {
  const property = page.properties[propertyName];
  if (!property) {
    return "";
  }
  if (property.type !== "rich_text") {
    throw new Error(`Property "${propertyName}" is not a rich_text property`);
  }
  return property.rich_text.map((item) => item.plain_text).join("");
}

function readOptionalNumber(
  page: PageObjectResponse,
  propertyName: string,
): number | null {
  const property = page.properties[propertyName];
  if (!property || property.type !== "number") {
    return null;
  }
  return property.number;
}

function readCheckbox(
  page: PageObjectResponse,
  propertyName: string,
  defaultValue: boolean,
): boolean {
  const property = page.properties[propertyName];
  if (!property || property.type !== "checkbox") {
    return defaultValue;
  }
  return property.checkbox;
}

function readSyncStatus(
  page: PageObjectResponse,
  propertyName: string,
): SyncStatus | null {
  const property = page.properties[propertyName];
  if (!property) {
    return "Pending";
  }

  let name: string | null = null;
  if (property.type === "status") {
    name = property.status?.name ?? null;
  } else if (property.type === "select") {
    name = property.select?.name ?? null;
  }

  if (!name) {
    return "Pending";
  }

  if ((SYNC_STATUSES as readonly string[]).includes(name)) {
    return name as SyncStatus;
  }
  return null;
}

function readOptionalDate(
  page: PageObjectResponse,
  propertyName: string,
): string | null {
  const property = page.properties[propertyName];
  if (!property || property.type !== "date" || !property.date?.start) {
    return null;
  }
  return property.date.start;
}

function readFirstFileUrl(
  page: PageObjectResponse,
  propertyName: string,
): string | null {
  const property = page.properties[propertyName];
  if (!property || property.type !== "files" || property.files.length === 0) {
    return null;
  }

  const file = property.files[0];
  if (file.type === "external") {
    return file.external.url;
  }
  if (file.type === "file") {
    return file.file.url;
  }
  return null;
}

export function isMappingError(
  value: NotionRow | RowMappingError,
): value is RowMappingError {
  return "message" in value;
}

export function richTextFromString(text: string) {
  if (!text) {
    return [];
  }
  return [{ type: "text" as const, text: { content: text } }];
}

export { PROPERTY as NOTION_PROPERTY_NAMES };
