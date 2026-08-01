import { z } from "zod";
import { assertValidUniverseKey } from "./notion/propertyNames.js";
import { loadTomlFile } from "./toml.js";
import { setLogLevel } from "./util/logger.js";

const syncSecretsSchema = z.object({
  NOTION_TOKEN: z.string().min(1, "NOTION_TOKEN is required"),
  ROBLOX_API_KEY: z.string().min(1, "ROBLOX_API_KEY is required"),
});

const createDatabasesSecretsSchema = z.object({
  NOTION_TOKEN: z.string().min(1, "NOTION_TOKEN is required"),
});

const assetCreatorSchema = z
  .object({
    is_group: z.boolean(),
    id: z.number().int().positive(),
  })
  .strict();

const robloxTomlBaseSchema = z
  .object({
    universe_id: z.number().int().positive().optional(),
    universes: z.record(z.string(), z.number().int().positive()).optional(),
    badge_payment_source: z.enum(["user", "group"]).default("user"),
    asset_creator: assetCreatorSchema.optional(),
  })
  .strict();

function validateUniverseConfig(
  roblox: z.infer<typeof robloxTomlBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  const hasUniverseId = roblox.universe_id !== undefined;
  const hasUniverses =
    roblox.universes !== undefined && Object.keys(roblox.universes).length > 0;

  if (hasUniverseId && hasUniverses) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "roblox.universe_id and roblox.universes are mutually exclusive",
      path: ["universe_id"],
    });
  }

  if (!hasUniverseId && !hasUniverses) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either roblox.universe_id or roblox.universes is required",
      path: ["universe_id"],
    });
  }

  if (hasUniverses) {
    for (const key of Object.keys(roblox.universes!)) {
      try {
        assertValidUniverseKey(key);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            error instanceof Error ? error.message : "Invalid universe key",
          path: ["universes", key],
        });
      }
    }
  }
}

const syncTomlSchema = z
  .object({
    notion: z
      .object({
        dev_product_db_id: z.string().min(1),
        game_pass_db_id: z.string().min(1),
        badge_db_id: z.string().min(1),
        asset_db_id: z.string().min(1),
        parent_page_id: z.string().optional(),
        is_inline: z.boolean().default(true),
      })
      .strict(),
    roblox: robloxTomlBaseSchema.superRefine(validateUniverseConfig),
    logging: z
      .object({
        level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      })
      .strict()
      .default({}),
  })
  .strict();

const createDatabasesTomlSchema = z
  .object({
    notion: z
      .object({
        dev_product_db_id: z.string().optional(),
        game_pass_db_id: z.string().optional(),
        badge_db_id: z.string().optional(),
        asset_db_id: z.string().optional(),
        parent_page_id: z.string().optional(),
        is_inline: z.boolean().default(true),
      })
      .strict()
      .default({}),
    roblox: robloxTomlBaseSchema
      .partial({ badge_payment_source: true })
      .superRefine((roblox, ctx) => {
        const hasUniverseId = roblox.universe_id !== undefined;
        const hasUniverses =
          roblox.universes !== undefined &&
          Object.keys(roblox.universes).length > 0;

        if (hasUniverseId && hasUniverses) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "roblox.universe_id and roblox.universes are mutually exclusive",
            path: ["universe_id"],
          });
        }

        if (hasUniverses) {
          for (const key of Object.keys(roblox.universes!)) {
            try {
              assertValidUniverseKey(key);
            } catch (error) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  error instanceof Error
                    ? error.message
                    : "Invalid universe key",
                path: ["universes", key],
              });
            }
          }
        }
      })
      .optional(),
    logging: z
      .object({
        level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      })
      .strict()
      .default({}),
  })
  .strict();

export type RobloxAssetCreator = z.infer<typeof assetCreatorSchema>;

export type SyncTarget = {
  key: string | null;
  universeId: number;
};

export type Config = {
  NOTION_TOKEN: string;
  ROBLOX_API_KEY: string;
  NOTION_DEVPRODUCT_DB_ID: string;
  NOTION_GAMEPASS_DB_ID: string;
  NOTION_BADGE_DB_ID: string;
  NOTION_ASSET_DB_ID: string;
  NOTION_PARENT_PAGE_ID?: string;
  NOTION_IS_INLINE: boolean;
  ROBLOX_UNIVERSE_ID: number;
  ROBLOX_UNIVERSES: Record<string, number>;
  ROBLOX_BADGE_PAYMENT_SOURCE: "user" | "group";
  ROBLOX_ASSET_CREATOR?: RobloxAssetCreator;
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
};

export function isNotionDatabaseIdConfigured(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalDbId(value: string | undefined): string {
  return value?.trim() ?? "";
}

function buildRobloxUniverses(roblox: {
  universe_id?: number;
  universes?: Record<string, number>;
}): Record<string, number> {
  if (roblox.universes !== undefined) {
    return { ...roblox.universes };
  }
  return {};
}

function resolveInitialUniverseId(roblox: {
  universe_id?: number;
  universes?: Record<string, number>;
}): number {
  if (roblox.universe_id !== undefined) {
    return roblox.universe_id;
  }
  if (
    roblox.universes !== undefined &&
    Object.keys(roblox.universes).length > 0
  ) {
    const keys = Object.keys(roblox.universes).sort();
    return roblox.universes[keys[0]!]!;
  }
  return 0;
}

function validateAssetCreatorWhenAssetDbConfigured(
  assetDbId: string,
  assetCreator: RobloxAssetCreator | undefined,
  errors: string[],
): void {
  if (!isNotionDatabaseIdConfigured(assetDbId)) {
    return;
  }
  if (!assetCreator) {
    errors.push(
      "roblox.asset_creator: required when notion.asset_db_id is configured",
    );
  }
}

let currentConfig: Config | null = null;
let multiUniverseMode = false;
let activeUniverseKey: string | null = null;

export function getConfig(): Config {
  if (!currentConfig) {
    throw new Error(
      "Configuration has not been loaded. Call setConfig(loadSyncConfig()) first.",
    );
  }
  return currentConfig;
}

export function setConfig(config: Config): void {
  currentConfig = config;
  setLogLevel(config.LOG_LEVEL);
}

export function isMultiUniverseMode(): boolean {
  return multiUniverseMode;
}

export function getUniverseKeys(): string[] {
  if (!multiUniverseMode) {
    return [];
  }
  return Object.keys(getConfig().ROBLOX_UNIVERSES).sort();
}

export function setActiveUniverse(key: string | null): void {
  if (!currentConfig) {
    throw new Error(
      "Configuration has not been loaded. Call setConfig(loadSyncConfig()) first.",
    );
  }

  if (!multiUniverseMode) {
    if (key !== null) {
      throw new Error("Cannot set universe key in single-universe mode");
    }
    activeUniverseKey = null;
    return;
  }

  if (key === null) {
    throw new Error("Universe key is required in multi-universe mode");
  }

  assertValidUniverseKey(key);
  if (!(key in currentConfig.ROBLOX_UNIVERSES)) {
    throw new Error(`Unknown universe key: ${key}`);
  }

  activeUniverseKey = key;
  currentConfig.ROBLOX_UNIVERSE_ID = currentConfig.ROBLOX_UNIVERSES[key]!;
}

export function resolveSyncTargets(cliTarget?: string): SyncTarget[] {
  const config = getConfig();

  if (!multiUniverseMode) {
    return [{ key: null, universeId: config.ROBLOX_UNIVERSE_ID }];
  }

  if (cliTarget !== undefined) {
    assertValidUniverseKey(cliTarget);
    const universeId = config.ROBLOX_UNIVERSES[cliTarget];
    if (universeId === undefined) {
      throw new Error(`Unknown universe key: ${cliTarget}`);
    }
    return [{ key: cliTarget, universeId }];
  }

  return getUniverseKeys().map((key) => ({
    key,
    universeId: config.ROBLOX_UNIVERSES[key]!,
  }));
}

export function loadSyncConfig(options?: {
  env?: NodeJS.ProcessEnv;
  tomlPath?: string;
}): Config {
  const env = options?.env ?? process.env;
  const errors: string[] = [];

  const secretsResult = syncSecretsSchema.safeParse({
    NOTION_TOKEN: env.NOTION_TOKEN,
    ROBLOX_API_KEY: env.ROBLOX_API_KEY,
  });
  if (!secretsResult.success) {
    errors.push(formatZodError(secretsResult.error));
  }

  const tomlData = loadTomlFile(options?.tomlPath);
  const tomlResult = syncTomlSchema.safeParse(tomlData);
  if (!tomlResult.success) {
    errors.push(formatZodError(tomlResult.error));
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n${errors.join("\n")}`);
  }

  const secrets = secretsResult.data!;
  const toml = tomlResult.data!;

  validateAssetCreatorWhenAssetDbConfigured(
    toml.notion.asset_db_id,
    toml.roblox.asset_creator,
    errors,
  );

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n${errors.join("\n")}`);
  }

  multiUniverseMode = toml.roblox.universes !== undefined;
  activeUniverseKey = multiUniverseMode
    ? Object.keys(toml.roblox.universes!).sort()[0]!
    : null;

  const robloxUniverses = buildRobloxUniverses(toml.roblox);
  const robloxUniverseId = resolveInitialUniverseId(toml.roblox);

  const config: Config = {
    NOTION_TOKEN: secrets.NOTION_TOKEN,
    ROBLOX_API_KEY: secrets.ROBLOX_API_KEY,
    NOTION_DEVPRODUCT_DB_ID: toml.notion.dev_product_db_id,
    NOTION_GAMEPASS_DB_ID: toml.notion.game_pass_db_id,
    NOTION_BADGE_DB_ID: toml.notion.badge_db_id,
    NOTION_ASSET_DB_ID: toml.notion.asset_db_id,
    NOTION_PARENT_PAGE_ID: trimOptional(toml.notion.parent_page_id),
    NOTION_IS_INLINE: toml.notion.is_inline,
    ROBLOX_UNIVERSE_ID: robloxUniverseId,
    ROBLOX_UNIVERSES: robloxUniverses,
    ROBLOX_BADGE_PAYMENT_SOURCE: toml.roblox.badge_payment_source,
    ROBLOX_ASSET_CREATOR: toml.roblox.asset_creator,
    LOG_LEVEL: toml.logging.level,
  };

  return config;
}

export function loadCreateDatabasesConfig(options?: {
  env?: NodeJS.ProcessEnv;
  tomlPath?: string;
  parentPageId?: string;
}): Config {
  const env = options?.env ?? process.env;
  const errors: string[] = [];

  const secretsResult = createDatabasesSecretsSchema.safeParse({
    NOTION_TOKEN: env.NOTION_TOKEN,
  });
  if (!secretsResult.success) {
    errors.push(formatZodError(secretsResult.error));
  }

  const tomlData = loadTomlFile(options?.tomlPath);
  const tomlResult = createDatabasesTomlSchema.safeParse(tomlData);
  if (!tomlResult.success) {
    errors.push(formatZodError(tomlResult.error));
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n${errors.join("\n")}`);
  }

  const secrets = secretsResult.data!;
  const toml = tomlResult.data!;

  const parentPageId =
    trimOptional(options?.parentPageId) ??
    trimOptional(toml.notion.parent_page_id);
  if (!parentPageId) {
    throw new Error(
      "Invalid configuration:\nnotion.parent_page_id: parent page ID is required for create-db (set in ntn-roblox.toml or pass --parent-page-id)",
    );
  }

  multiUniverseMode = toml.roblox?.universes !== undefined;
  activeUniverseKey = null;

  const robloxUniverses = toml.roblox ? buildRobloxUniverses(toml.roblox) : {};
  const robloxUniverseId =
    toml.roblox !== undefined ? resolveInitialUniverseId(toml.roblox) : 0;

  const config: Config = {
    NOTION_TOKEN: secrets.NOTION_TOKEN,
    ROBLOX_API_KEY: "",
    NOTION_DEVPRODUCT_DB_ID: normalizeOptionalDbId(
      toml.notion.dev_product_db_id,
    ),
    NOTION_GAMEPASS_DB_ID: normalizeOptionalDbId(toml.notion.game_pass_db_id),
    NOTION_BADGE_DB_ID: normalizeOptionalDbId(toml.notion.badge_db_id),
    NOTION_ASSET_DB_ID: normalizeOptionalDbId(toml.notion.asset_db_id),
    NOTION_PARENT_PAGE_ID: parentPageId,
    NOTION_IS_INLINE: toml.notion.is_inline,
    ROBLOX_UNIVERSE_ID: robloxUniverseId,
    ROBLOX_UNIVERSES: robloxUniverses,
    ROBLOX_BADGE_PAYMENT_SOURCE: toml.roblox?.badge_payment_source ?? "user",
    ROBLOX_ASSET_CREATOR: toml.roblox?.asset_creator,
    LOG_LEVEL: toml.logging.level,
  };

  return config;
}
