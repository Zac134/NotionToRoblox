import type { NotionRow } from "../src/types.js";

export function makeRow(overrides: Partial<NotionRow> = {}): NotionRow {
  return {
    pageId: "page-1",
    name: "Test Item",
    description: "desc",
    iconUrl: null,
    robloxId: null,
    syncStatus: "Pending",
    syncError: "",
    lastSyncedAt: null,
    type: "developer-product",
    price: 100,
    isForSale: true,
    ...overrides,
  };
}
