import { config } from "../config.js";
import type {
  GamePassInput,
  GamePassUpdateInput,
  RobloxGamePass,
} from "../types.js";
import { extractDefaultPrice } from "../types.js";
import {
  robloxGamePassReadLimiter,
  robloxGamePassWriteLimiter,
  robloxJson,
  robloxMultipart,
} from "./http.js";

const LIST_PATH =
  "/game-passes/v1/universes/{universeId}/game-passes/creator";
const CREATE_PATH = "/game-passes/v1/universes/{universeId}/game-passes";
const UPDATE_PATH =
  "/game-passes/v1/universes/{universeId}/game-passes/{gamePassId}";

interface ListGamePassesResponse {
  gamePasses: RobloxGamePass[];
  nextPageToken?: string;
}

interface GamePassCreateResponse {
  gamePassId: number;
  name: string;
  description: string;
  isForSale: boolean;
  iconAssetId: number;
}

function pathWithUniverse(template: string): string {
  return template.replace("{universeId}", String(config.ROBLOX_UNIVERSE_ID));
}

function pathWithGamePass(template: string, gamePassId: number): string {
  return pathWithUniverse(template).replace(
    "{gamePassId}",
    String(gamePassId),
  );
}

export async function listGamePasses(): Promise<RobloxGamePass[]> {
  const items: RobloxGamePass[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams();
    query.set("pageSize", "50");
    if (pageToken) {
      query.set("pageToken", pageToken);
    }

    const response = await robloxJson<ListGamePassesResponse>({
      path: `${pathWithUniverse(LIST_PATH)}?${query.toString()}`,
      limiter: robloxGamePassReadLimiter,
    });

    items.push(...response.gamePasses);
    pageToken = response.nextPageToken;
  } while (pageToken);

  return items;
}

export async function createGamePass(input: GamePassInput): Promise<number> {
  const fields = buildCreateFields(input);
  const response = await robloxMultipart<GamePassCreateResponse>({
    method: "POST",
    path: pathWithUniverse(CREATE_PATH),
    fields,
    // Create uses `imageFile`; Update uses `file` (Roblox API quirk).
    file: input.icon
      ? { ...input.icon, fieldName: "imageFile" }
      : undefined,
    limiter: robloxGamePassWriteLimiter,
  });

  return response.gamePassId;
}

export async function updateGamePass(
  gamePassId: number,
  input: GamePassUpdateInput,
): Promise<void> {
  const fields = buildUpdateFields(input);
  await robloxMultipart<void>({
    method: "PATCH",
    path: pathWithGamePass(UPDATE_PATH, gamePassId),
    fields,
    // Create uses `imageFile`; Update uses `file` (Roblox API quirk).
    file: input.icon ? { ...input.icon, fieldName: "file" } : undefined,
    limiter: robloxGamePassWriteLimiter,
  });
}

function buildCreateFields(input: GamePassInput) {
  const fields = [
    { name: "name", value: input.name },
    { name: "isForSale", value: input.isForSale },
    { name: "price", value: input.price },
    { name: "isRegionalPricingEnabled", value: false },
  ];

  if (input.description !== undefined) {
    fields.push({ name: "description", value: input.description });
  }

  return fields;
}

function buildUpdateFields(input: GamePassUpdateInput) {
  const fields: Array<{ name: string; value: string | boolean | number }> = [];

  if (input.name !== undefined) {
    fields.push({ name: "name", value: input.name });
  }
  if (input.description !== undefined) {
    fields.push({ name: "description", value: input.description });
  }
  if (input.isForSale !== undefined) {
    fields.push({ name: "isForSale", value: input.isForSale });
  }
  if (input.price !== undefined) {
    fields.push({ name: "price", value: input.price });
  }

  return fields;
}

export function getGamePassPrice(gamePass: RobloxGamePass): number | null {
  return extractDefaultPrice(gamePass.priceInformation);
}
