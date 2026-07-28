import { z } from "zod";
import { loadTomlFile } from "./toml.js";
import { setLogLevel } from "./util/logger.js";

const syncSecretsSchema = z.object({
  NOTION_TOKEN: z.string().min(1, "NOTION_TOKEN is required"),
  ROBLOX_API_KEY: z.string().min(1, "ROBLOX_API_KEY is required"),
});

const initSecretsSchema = z.object({
  NOTION_TOKEN: z.string().min(1, "NOTION_TOKEN is required"),
});

const syncTomlSchema = z
  .object({
    notion: z
      .object({
        dev_product_db_id: z.string().min(1),
        game_pass_db_id: z.string().min(1),
        badge_db_id: z.string().min(1),
        parent_page_id: z.string().optional(),
      })
      .strict(),
    roblox: z
      .object({
        universe_id: z.number().int().positive(),
        badge_payment_source: z.enum(["user", "group"]).default("user"),
      })
      .strict(),
    logging: z
      .object({
        level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      })
      .strict()
      .default({}),
  })
  .strict();

const initTomlSchema = z
  .object({
    notion: z
      .object({
        dev_product_db_id: z.string().optional(),
        game_pass_db_id: z.string().optional(),
        badge_db_id: z.string().optional(),
        parent_page_id: z.string().optional(),
      })
      .strict()
      .default({}),
    roblox: z
      .object({
        universe_id: z.number().int().positive().optional(),
        badge_payment_source: z.enum(["user", "group"]).default("user"),
      })
      .strict()
      .optional(),
    logging: z
      .object({
        level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      })
      .strict()
      .default({}),
  })
  .strict();

export type Config = {
  NOTION_TOKEN: string;
  ROBLOX_API_KEY: string;
  NOTION_DEVPRODUCT_DB_ID: string;
  NOTION_GAMEPASS_DB_ID: string;
  NOTION_BADGE_DB_ID: string;
  NOTION_PARENT_PAGE_ID?: string;
  ROBLOX_UNIVERSE_ID: number;
  ROBLOX_BADGE_PAYMENT_SOURCE: "user" | "group";
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

let currentConfig: Config | null = null;

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

  const config: Config = {
    NOTION_TOKEN: secrets.NOTION_TOKEN,
    ROBLOX_API_KEY: secrets.ROBLOX_API_KEY,
    NOTION_DEVPRODUCT_DB_ID: toml.notion.dev_product_db_id,
    NOTION_GAMEPASS_DB_ID: toml.notion.game_pass_db_id,
    NOTION_BADGE_DB_ID: toml.notion.badge_db_id,
    NOTION_PARENT_PAGE_ID: trimOptional(toml.notion.parent_page_id),
    ROBLOX_UNIVERSE_ID: toml.roblox.universe_id,
    ROBLOX_BADGE_PAYMENT_SOURCE: toml.roblox.badge_payment_source,
    LOG_LEVEL: toml.logging.level,
  };

  return config;
}

export function loadInitConfig(options?: {
  env?: NodeJS.ProcessEnv;
  tomlPath?: string;
  parentPageId?: string;
}): Config {
  const env = options?.env ?? process.env;
  const errors: string[] = [];

  const secretsResult = initSecretsSchema.safeParse({
    NOTION_TOKEN: env.NOTION_TOKEN,
  });
  if (!secretsResult.success) {
    errors.push(formatZodError(secretsResult.error));
  }

  const tomlData = loadTomlFile(options?.tomlPath);
  const tomlResult = initTomlSchema.safeParse(tomlData);
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
      "Invalid configuration:\nnotion.parent_page_id: parent page ID is required for init (set in ntn-roblox.toml or pass --parent-page-id)",
    );
  }

  const config: Config = {
    NOTION_TOKEN: secrets.NOTION_TOKEN,
    ROBLOX_API_KEY: "",
    NOTION_DEVPRODUCT_DB_ID: normalizeOptionalDbId(
      toml.notion.dev_product_db_id,
    ),
    NOTION_GAMEPASS_DB_ID: normalizeOptionalDbId(toml.notion.game_pass_db_id),
    NOTION_BADGE_DB_ID: normalizeOptionalDbId(toml.notion.badge_db_id),
    NOTION_PARENT_PAGE_ID: parentPageId,
    ROBLOX_UNIVERSE_ID: toml.roblox?.universe_id ?? 0,
    ROBLOX_BADGE_PAYMENT_SOURCE: toml.roblox?.badge_payment_source ?? "user",
    LOG_LEVEL: toml.logging.level,
  };

  return config;
}
