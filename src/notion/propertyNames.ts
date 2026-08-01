export const UNIVERSE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

export function assertValidUniverseKey(key: string): void {
  if (!UNIVERSE_KEY_PATTERN.test(key)) {
    throw new Error(
      `Invalid universe key "${key}": must match ${UNIVERSE_KEY_PATTERN}`,
    );
  }
}

export function robloxIdPropertyName(targetKey: string | null): string {
  if (targetKey === null) {
    return "Roblox ID";
  }
  return `Roblox ID (${targetKey})`;
}

export const ASSET_PROPERTY_NAMES = {
  assetType: "Asset Type",
  file: "File",
} as const;
