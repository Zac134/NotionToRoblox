import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  isNotionDatabaseIdConfigured,
  loadInitConfig,
  loadSyncConfig,
} from "../src/config.js";

function writeToml(dir: string, content: string): string {
  const path = join(dir, "ntn-roblox.toml");
  writeFileSync(path, content, "utf8");
  return path;
}

describe("isNotionDatabaseIdConfigured", () => {
  it("returns true for a non-empty trimmed string", () => {
    assert.equal(isNotionDatabaseIdConfigured("abc123"), true);
    assert.equal(isNotionDatabaseIdConfigured("  abc123  "), true);
  });

  it("returns false for empty, whitespace-only, or non-string values", () => {
    assert.equal(isNotionDatabaseIdConfigured(""), false);
    assert.equal(isNotionDatabaseIdConfigured("   "), false);
    assert.equal(isNotionDatabaseIdConfigured(undefined), false);
    assert.equal(isNotionDatabaseIdConfigured(null), false);
    assert.equal(isNotionDatabaseIdConfigured(42), false);
  });
});

describe("loadInitConfig", () => {
  it("loads with NOTION_TOKEN only and requires parent_page_id", () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-init-config-"));
    const tomlPath = writeToml(
      dir,
      `[notion]
parent_page_id = "parent-from-toml"

[logging]
level = "info"
`,
    );

    const config = loadInitConfig({
      env: { NOTION_TOKEN: "init-token" },
      tomlPath,
    });

    assert.equal(config.NOTION_TOKEN, "init-token");
    assert.equal(config.NOTION_PARENT_PAGE_ID, "parent-from-toml");
    assert.equal(config.ROBLOX_API_KEY, "");
    assert.equal(config.NOTION_DEVPRODUCT_DB_ID, "");
  });

  it("accepts parent_page_id from CLI option when TOML omits it", () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-init-config-"));
    const tomlPath = writeToml(
      dir,
      `[notion]

[logging]
level = "info"
`,
    );

    const config = loadInitConfig({
      env: { NOTION_TOKEN: "init-token" },
      tomlPath,
      parentPageId: "parent-from-cli",
    });

    assert.equal(config.NOTION_PARENT_PAGE_ID, "parent-from-cli");
  });

  it("throws when NOTION_TOKEN is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-init-config-"));
    const tomlPath = writeToml(
      dir,
      `[notion]
parent_page_id = "parent"
`,
    );

    assert.throws(
      () => loadInitConfig({ env: {}, tomlPath }),
      /NOTION_TOKEN.*Required/,
    );
  });

  it("throws when parent_page_id is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-init-config-"));
    const tomlPath = writeToml(
      dir,
      `[notion]

[logging]
level = "info"
`,
    );

    assert.throws(
      () => loadInitConfig({ env: { NOTION_TOKEN: "init-token" }, tomlPath }),
      /parent page ID is required for init/,
    );
  });

  it("does not require ROBLOX_API_KEY", () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-init-config-"));
    const tomlPath = writeToml(
      dir,
      `[notion]
parent_page_id = "parent"
`,
    );

    const config = loadInitConfig({
      env: { NOTION_TOKEN: "init-token" },
      tomlPath,
    });

    assert.equal(config.ROBLOX_API_KEY, "");
  });
});

describe("loadSyncConfig", () => {
  it("loads when NOTION_TOKEN, ROBLOX_API_KEY, and database IDs are present", () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-sync-config-"));
    const tomlPath = writeToml(
      dir,
      `[notion]
dev_product_db_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
game_pass_db_id   = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
badge_db_id       = "cccccccccccccccccccccccccccccccc"

[roblox]
universe_id = 987654321

[logging]
level = "warn"
`,
    );

    const config = loadSyncConfig({
      env: {
        NOTION_TOKEN: "sync-notion",
        ROBLOX_API_KEY: "sync-roblox",
      },
      tomlPath,
    });

    assert.equal(config.NOTION_TOKEN, "sync-notion");
    assert.equal(config.ROBLOX_API_KEY, "sync-roblox");
    assert.equal(
      config.NOTION_DEVPRODUCT_DB_ID,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    assert.equal(config.ROBLOX_UNIVERSE_ID, 987654321);
    assert.equal(config.LOG_LEVEL, "warn");
  });

  it("throws when ROBLOX_API_KEY is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-sync-config-"));
    const tomlPath = writeToml(
      dir,
      `[notion]
dev_product_db_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
game_pass_db_id   = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
badge_db_id       = "cccccccccccccccccccccccccccccccc"

[roblox]
universe_id = 123
`,
    );

    assert.throws(
      () =>
        loadSyncConfig({
          env: { NOTION_TOKEN: "sync-notion" },
          tomlPath,
        }),
      /ROBLOX_API_KEY.*Required/,
    );
  });

  it("throws when NOTION_TOKEN is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-sync-config-"));
    const tomlPath = writeToml(
      dir,
      `[notion]
dev_product_db_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
game_pass_db_id   = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
badge_db_id       = "cccccccccccccccccccccccccccccccc"

[roblox]
universe_id = 123
`,
    );

    assert.throws(
      () =>
        loadSyncConfig({
          env: { ROBLOX_API_KEY: "sync-roblox" },
          tomlPath,
        }),
      /NOTION_TOKEN.*Required/,
    );
  });

  it("treats empty parent_page_id as unset", () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-sync-config-"));
    const tomlPath = writeToml(
      dir,
      `[notion]
parent_page_id = ""
dev_product_db_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
game_pass_db_id   = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
badge_db_id       = "cccccccccccccccccccccccccccccccc"

[roblox]
universe_id = 123
`,
    );

    const config = loadSyncConfig({
      env: {
        NOTION_TOKEN: "sync-notion",
        ROBLOX_API_KEY: "sync-roblox",
      },
      tomlPath,
    });

    assert.equal(config.NOTION_PARENT_PAGE_ID, undefined);
  });
});
