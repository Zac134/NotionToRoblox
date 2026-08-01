import type { SupportedAssetType } from "./assetTypes.js";

export type ResourceType =
  | "developer-product"
  | "game-pass"
  | "badge"
  | "asset";

export const SYNC_STATUSES = ["Pending", "Synced", "Error", "Skipped"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export interface NotionRowBase {
  pageId: string;
  name: string;
  description: string;
  iconUrl: string | null;
  robloxId: number | null;
  robloxIds?: Record<string, number | null>;
  syncStatus: SyncStatus;
  syncError: string;
  lastSyncedAt: string | null;
}

export interface DeveloperProductRow extends NotionRowBase {
  type: "developer-product";
  price: number | null;
  isForSale: boolean;
}

export interface GamePassRow extends NotionRowBase {
  type: "game-pass";
  price: number | null;
  isForSale: boolean;
}

export interface BadgeRow extends NotionRowBase {
  type: "badge";
  isActive: boolean;
}

export interface AssetRow extends NotionRowBase {
  type: "asset";
  assetType: SupportedAssetType;
  fileUrl: string | null;
}

export type NotionRow =
  | DeveloperProductRow
  | GamePassRow
  | BadgeRow
  | AssetRow;

export interface RowMappingError {
  pageId: string;
  message: string;
}

export interface WritebackPayload {
  syncStatus: SyncStatus;
  syncError?: string;
  robloxId?: number;
  robloxIdTargetKey?: string | null;
  lastSyncedAt?: string;
}

export interface RobloxPriceInformation {
  defaultPriceInRobux?: number;
}

export interface RobloxDeveloperProduct {
  productId: number;
  name: string;
  description: string;
  iconImageAssetId: number;
  universeId: number;
  isForSale: boolean;
  priceInformation?: RobloxPriceInformation;
}

export interface RobloxGamePass {
  gamePassId: number;
  name: string;
  description: string;
  isForSale: boolean;
  iconAssetId: number;
  priceInformation?: RobloxPriceInformation;
}

export interface RobloxBadge {
  id: number;
  name: string;
  description: string;
  displayName?: string;
  displayDescription?: string;
  enabled: boolean;
}

export interface DeveloperProductInput {
  name: string;
  description?: string;
  price: number;
  isForSale: boolean;
  icon?: { buffer: Buffer; filename: string; mimeType: string };
}

export interface DeveloperProductUpdateInput {
  name?: string;
  description?: string;
  price?: number;
  isForSale?: boolean;
  icon?: { buffer: Buffer; filename: string; mimeType: string };
}

export interface GamePassInput {
  name: string;
  description?: string;
  price: number;
  isForSale: boolean;
  icon?: { buffer: Buffer; filename: string; mimeType: string };
}

export interface GamePassUpdateInput {
  name?: string;
  description?: string;
  price?: number;
  isForSale?: boolean;
  icon?: { buffer: Buffer; filename: string; mimeType: string };
}

export interface BadgeInput {
  name: string;
  description?: string;
  isActive: boolean;
  icon?: { buffer: Buffer; filename: string; mimeType: string };
}

export interface BadgeUpdateInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  icon?: { buffer: Buffer; filename: string; mimeType: string };
}

export interface FileUpload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface RobloxAsset {
  assetId: number;
  name: string;
  assetType: SupportedAssetType;
}

export interface AssetInput {
  name: string;
  description?: string;
  assetType: SupportedAssetType;
  file: FileUpload;
}

export interface AssetUpdateInput {
  name?: string;
  description?: string;
  file?: FileUpload;
}

export type RobloxAssetOperation = "create" | "update";

export function extractDefaultPrice(
  priceInformation: RobloxPriceInformation | undefined,
): number | null {
  if (
    priceInformation &&
    typeof priceInformation.defaultPriceInRobux === "number"
  ) {
    return priceInformation.defaultPriceInRobux;
  }
  return null;
}
