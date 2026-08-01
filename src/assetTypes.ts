export const SUPPORTED_ASSET_TYPES = [
  "Animation",
  "Audio",
  "Decal",
  "Image",
  "Model",
] as const;

export type SupportedAssetType = (typeof SUPPORTED_ASSET_TYPES)[number];

export function isSupportedAssetType(value: string): value is SupportedAssetType {
  return (SUPPORTED_ASSET_TYPES as readonly string[]).includes(value);
}
