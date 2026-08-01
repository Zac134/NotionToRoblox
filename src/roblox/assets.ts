import { getConfig, type RobloxAssetCreator } from "../config.js";
import type { FileUpload } from "../types.js";
import { robloxJson, robloxMultipart } from "./http.js";

const CREATE_PATH = "/assets/v1/assets";
const POLL_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

export interface CreateAssetInput {
  assetType: string;
  displayName: string;
  description: string;
  file: FileUpload;
}

export interface UpdateAssetMetadataInput {
  displayName: string;
  description: string;
}

interface AssetOperation {
  path: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: {
    path?: string;
    assetId?: string | number;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAssetCreator(): RobloxAssetCreator {
  const creator = getConfig().ROBLOX_ASSET_CREATOR;
  if (!creator) {
    throw new Error(
      "roblox.asset_creator is required in ntn-roblox.toml (is_group, id)",
    );
  }
  return creator;
}

function buildCreationContext() {
  const creator = getAssetCreator();
  return {
    creator: creator.is_group
      ? { groupId: String(creator.id) }
      : { userId: String(creator.id) },
    expectedPrice: 0,
  };
}

export function mimeTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".bmp")) {
    return "image/bmp";
  }
  if (lower.endsWith(".tga")) {
    return "image/tga";
  }
  if (lower.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (lower.endsWith(".ogg")) {
    return "audio/ogg";
  }
  if (lower.endsWith(".wav")) {
    return "audio/wav";
  }
  if (lower.endsWith(".flac")) {
    return "audio/flac";
  }
  if (lower.endsWith(".fbx")) {
    return "model/fbx";
  }
  if (lower.endsWith(".gltf")) {
    return "model/gltf+json";
  }
  if (lower.endsWith(".glb")) {
    return "model/gltf-binary";
  }
  if (lower.endsWith(".rbxm") || lower.endsWith(".rbxmx")) {
    return "model/x-rbxm";
  }
  return "application/octet-stream";
}

function parseAssetIdFromPath(path: string): number | null {
  const match = path.match(/^assets\/(\d+)$/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function parseAssetIdFromOperation(operation: AssetOperation): number {
  const responsePath = operation.response?.path;
  if (responsePath) {
    const assetId = parseAssetIdFromPath(responsePath);
    if (assetId !== null) {
      return assetId;
    }
  }

  if (operation.response?.assetId !== undefined) {
    return Number(operation.response.assetId);
  }

  throw new Error("Asset operation completed without asset ID");
}

async function pollAssetOperation(operationPath: string): Promise<number> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const operation = await robloxJson<AssetOperation>({
      path: `/assets/v1/${operationPath}`,
    });

    if (operation.error?.message) {
      throw new Error(`Asset operation failed: ${operation.error.message}`);
    }

    if (operation.done) {
      return parseAssetIdFromOperation(operation);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Asset operation timed out after ${POLL_TIMEOUT_MS / 1000}s (${operationPath})`,
  );
}

export async function createAsset(input: CreateAssetInput): Promise<number> {
  const request = {
    assetType: input.assetType,
    displayName: input.displayName,
    description: input.description,
    creationContext: buildCreationContext(),
  };

  const operation = await robloxMultipart<AssetOperation>({
    method: "POST",
    path: CREATE_PATH,
    fields: [{ name: "request", value: JSON.stringify(request) }],
    file: {
      ...input.file,
      mimeType:
        input.file.mimeType || mimeTypeFromFilename(input.file.filename),
      fieldName: "fileContent",
    },
  });

  if (operation.done) {
    return parseAssetIdFromOperation(operation);
  }

  if (!operation.path) {
    throw new Error("Asset create response missing operation path");
  }

  return pollAssetOperation(operation.path);
}

export async function updateAssetMetadata(
  assetId: number,
  input: UpdateAssetMetadataInput,
): Promise<void> {
  const request = {
    assetId,
    displayName: input.displayName,
    description: input.description,
  };

  await robloxMultipart<void>({
    method: "PATCH",
    path: `/assets/v1/assets/${assetId}?updateMask=description,displayName`,
    fields: [{ name: "request", value: JSON.stringify(request) }],
  });
}
