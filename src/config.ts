import { z } from "zod";
import { loadTomlFile } from "./toml.js";
import { setLogLevel } from "./util/logger.js";

const secretsSchema = z.object({
  NOTION_TOKEN: z.string().min(1, "NOTION_TOKEN is required"),
  ROBLOX_API_KEY: z.string().min(1, "ROBLOX_API_KEY is required"),
});

const tomlSchema = z
  .object({
    notion: z
      .object({
        dev_product_db_id: z.string().min(1),
        game_pass_db_id: z.string().min(1),
        badge_db_id: z.string().min(1),
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

export type Config = {
  NOTION_TOKEN: string;
  ROBLOX_API_KEY: string;
  NOTION_DEVPRODUCT_DB_ID: string;
  NOTION_GAMEPASS_DB_ID: string;
  NOTION_BADGE_DB_ID: string;
  ROBLOX_UNIVERSE_ID: number;
  ROBLOX_BADGE_PAYMENT_SOURCE: "user" | "group";
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
};

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

export function loadConfig(options?: {
  env?: NodeJS.ProcessEnv;
  tomlPath?: string;
}): Config {
  const env = options?.env ?? process.env;
  const errors: string[] = [];

  const secretsResult = secretsSchema.safeParse({
    NOTION_TOKEN: env.NOTION_TOKEN,
    ROBLOX_API_KEY: env.ROBLOX_API_KEY,
  });
  if (!secretsResult.success) {
    errors.push(formatZodError(secretsResult.error));
  }

  const tomlData = loadTomlFile(options?.tomlPath);
  const tomlResult = tomlSchema.safeParse(tomlData);
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
    ROBLOX_UNIVERSE_ID: toml.roblox.universe_id,
    ROBLOX_BADGE_PAYMENT_SOURCE: toml.roblox.badge_payment_source,
    LOG_LEVEL: toml.logging.level,
  };

  setLogLevel(config.LOG_LEVEL);

  return config;
}

export const config = loadConfig();
