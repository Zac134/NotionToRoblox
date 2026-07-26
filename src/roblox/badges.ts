import { getConfig } from "../config.js";
import type { BadgeInput, BadgeUpdateInput, RobloxBadge } from "../types.js";
import {
  BADGES_PUBLIC_BASE,
  robloxBadgeLimiter,
  robloxJson,
  robloxMultipart,
} from "./http.js";
import { logger } from "../util/logger.js";

const CREATE_PATH = "/legacy-badges/v1/universes/{universeId}/badges";
const UPDATE_PATH = "/legacy-badges/v1/badges/{badgeId}";
const UPDATE_ICON_PATH =
  "/legacy-game-internationalization/v1/badges/{badgeId}/icons/language-codes/{languageCode}";

const PAYMENT_SOURCE_BY_CONFIG = {
  user: 1,
  group: 2,
} as const;
const EXPECTED_COST_FREE = 0;
const DEFAULT_ICON_LANGUAGE = "en-us";

interface BadgeListResponse {
  previousPageCursor?: string | null;
  nextPageCursor?: string | null;
  data: RobloxBadge[];
}

interface BadgeCreateResponse {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
}

export class BadgeQuotaExhaustedError extends Error {
  constructor(message = "No free badge quota remaining for today") {
    super(message);
    this.name = "BadgeQuotaExhaustedError";
  }
}

function pathWithUniverse(template: string): string {
  return template.replace(
    "{universeId}",
    String(getConfig().ROBLOX_UNIVERSE_ID),
  );
}

function pathWithBadge(template: string, badgeId: number): string {
  return template.replace("{badgeId}", String(badgeId));
}

export async function listBadges(): Promise<RobloxBadge[]> {
  const items: RobloxBadge[] = [];
  let cursor: string | undefined;

  do {
    const query = new URLSearchParams();
    query.set("limit", "100");
    if (cursor) {
      query.set("cursor", cursor);
    }

    const response = await robloxJson<BadgeListResponse>({
      path: `/v1/universes/${getConfig().ROBLOX_UNIVERSE_ID}/badges?${query.toString()}`,
      baseUrl: BADGES_PUBLIC_BASE,
      useApiKey: false,
    });

    items.push(...response.data);
    cursor = response.nextPageCursor ?? undefined;
  } while (cursor);

  return items;
}

export async function getFreeBadgeQuota(): Promise<number> {
  const quota = await robloxJson<number>({
    path: `/v1/universes/${getConfig().ROBLOX_UNIVERSE_ID}/free-badges-quota`,
    baseUrl: BADGES_PUBLIC_BASE,
    useApiKey: false,
  });
  return quota;
}

export function canCreateBadge(remainingQuota: number): boolean {
  return remainingQuota > 0;
}

export async function createBadge(
  input: BadgeInput,
  remainingQuota: number,
): Promise<number> {
  if (!canCreateBadge(remainingQuota)) {
    throw new BadgeQuotaExhaustedError();
  }

  const fields = [
    { name: "name", value: input.name },
    {
      name: "paymentSourceType",
      value:
        PAYMENT_SOURCE_BY_CONFIG[getConfig().ROBLOX_BADGE_PAYMENT_SOURCE],
    },
    { name: "expectedCost", value: EXPECTED_COST_FREE },
    { name: "isActive", value: input.isActive },
  ];

  if (input.description !== undefined) {
    fields.push({ name: "description", value: input.description });
  }

  const response = await robloxMultipart<BadgeCreateResponse>({
    method: "POST",
    path: pathWithUniverse(CREATE_PATH),
    fields,
    file: input.icon ? { ...input.icon, fieldName: "files" } : undefined,
    limiter: robloxBadgeLimiter,
  });

  return response.id;
}

export async function updateBadge(
  badgeId: number,
  input: BadgeUpdateInput,
): Promise<void> {
  const body: Record<string, string | boolean> = {};
  if (input.name !== undefined) {
    body.name = input.name;
  }
  if (input.description !== undefined) {
    body.description = input.description;
  }
  if (input.enabled !== undefined) {
    body.enabled = input.enabled;
  }

  if (Object.keys(body).length > 0) {
    await robloxJson<void>({
      method: "PATCH",
      path: pathWithBadge(UPDATE_PATH, badgeId),
      body,
      limiter: robloxBadgeLimiter,
    });
  }

  if (input.icon) {
    await updateBadgeIcon(badgeId, input.icon);
  }
}

export async function updateBadgeIcon(
  badgeId: number,
  icon: BadgeInput["icon"],
  languageCode = DEFAULT_ICON_LANGUAGE,
): Promise<void> {
  if (!icon) {
    return;
  }

  await robloxMultipart<void>({
    method: "POST",
    path: pathWithBadge(UPDATE_ICON_PATH, badgeId).replace(
      "{languageCode}",
      languageCode,
    ),
    fields: [],
    file: { ...icon, fieldName: "files" },
    limiter: robloxBadgeLimiter,
  });
}

export function warnQuotaExhausted(context?: string): void {
  const suffix = context ? ` (${context})` : "";
  logger.warn(
    `Badge free quota exhausted; skipping create${suffix}. Will retry automatically on the next sync after the daily quota resets (GMT).`,
  );
}
