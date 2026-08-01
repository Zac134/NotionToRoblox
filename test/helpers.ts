import type { AssetRow, NotionRow } from "../src/types.js";

export function makeRow(overrides: Partial<NotionRow> = {}): NotionRow {
  const base = {
    pageId: "page-1",
    name: "Test Item",
    description: "desc",
    iconUrl: null,
    robloxId: null,
    syncStatus: "Pending" as const,
    syncError: "",
    lastSyncedAt: null,
    ...overrides,
  };

  if (base.type === "asset") {
    return {
      ...base,
      type: "asset",
      assetType: (base as Partial<AssetRow>).assetType ?? "Model",
      fileUrl: (base as Partial<AssetRow>).fileUrl ?? null,
    } as AssetRow;
  }

  if (base.type === "badge") {
    return {
      ...base,
      type: "badge",
      isActive: (base as { isActive?: boolean }).isActive ?? true,
    } as NotionRow;
  }

  if (base.type === "game-pass") {
    return {
      ...base,
      type: "game-pass",
      price: (base as { price?: number | null }).price ?? 100,
      isForSale: (base as { isForSale?: boolean }).isForSale ?? true,
    } as NotionRow;
  }

  return {
    ...base,
    type: "developer-product",
    price: (base as { price?: number | null }).price ?? 100,
    isForSale: (base as { isForSale?: boolean }).isForSale ?? true,
  } as NotionRow;
}
