import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { parse } from "smol-toml";
import type { Config } from "../src/config.js";

const CREATED_IDS = {
  devProductDbId: "11111111111111111111111111111111",
  gamePassDbId: "22222222222222222222222222222222",
  badgeDbId: "33333333333333333333333333333333",
};

const DB_CREATE_ORDER = [
  CREATED_IDS.devProductDbId,
  CREATED_IDS.gamePassDbId,
  CREATED_IDS.badgeDbId,
];

function makeInitConfig(overrides: Partial<Config> = {}): Config {
  return {
    NOTION_TOKEN: "test-notion-token",
    ROBLOX_API_KEY: "",
    NOTION_DEVPRODUCT_DB_ID: "",
    NOTION_GAMEPASS_DB_ID: "",
    NOTION_BADGE_DB_ID: "",
    NOTION_PARENT_PAGE_ID: "parent-page-id-1234567890123456",
    ROBLOX_UNIVERSE_ID: 0,
    ROBLOX_BADGE_PAYMENT_SOURCE: "user",
    LOG_LEVEL: "info",
    ...overrides,
  };
}

function writeInitToml(dir: string): string {
  const path = join(dir, "ntn-roblox.toml");
  writeFileSync(
    path,
    `[notion]
parent_page_id = "parent-page-id-1234567890123456"
dev_product_db_id = ""
game_pass_db_id   = ""
badge_db_id       = ""

[logging]
level = "info"
`,
    "utf8",
  );
  return path;
}

describe("runInit", () => {
  let runInit: typeof import("../src/init/runInit.js").runInit;
  let pagesRetrieve: ReturnType<typeof mock.fn>;
  let databasesCreate: ReturnType<typeof mock.fn>;

  before(async () => {
    pagesRetrieve = mock.fn(async () => ({}));
    databasesCreate = mock.fn(async () => ({ id: DB_CREATE_ORDER[0] }));

    mock.module("@notionhq/client", {
      namedExports: {
        Client: class MockClient {
          pages = { retrieve: pagesRetrieve };
          databases = { create: databasesCreate };
        },
      },
    });

    ({ runInit } = await import("../src/init/runInit.js"));
  });

  beforeEach(() => {
    pagesRetrieve.mock.resetCalls();
    databasesCreate.mock.resetCalls();

    let createIndex = 0;
    databasesCreate.mock.mockImplementation(async () => {
      const id = DB_CREATE_ORDER[createIndex];
      createIndex += 1;
      return { id };
    });
  });

  after(() => {
    mock.reset();
  });

  it("creates databases when IDs are unset", async () => {
    const result = await runInit(makeInitConfig(), {
      force: false,
      writeToml: false,
    });

    assert.deepEqual(result, CREATED_IDS);
    assert.equal(pagesRetrieve.mock.callCount(), 1);
    assert.equal(databasesCreate.mock.callCount(), 3);
  });

  it("throws when database IDs are already configured", async () => {
    await assert.rejects(
      () =>
        runInit(
          makeInitConfig({
            NOTION_DEVPRODUCT_DB_ID: "existing-dev-product-id",
          }),
          { force: false, writeToml: false },
        ),
      /already configured \(dev_product_db_id\)/,
    );

    assert.equal(pagesRetrieve.mock.callCount(), 0);
    assert.equal(databasesCreate.mock.callCount(), 0);
  });

  it("recreates databases when --force is set", async () => {
    const result = await runInit(
      makeInitConfig({
        NOTION_DEVPRODUCT_DB_ID: "existing-dev-product-id",
        NOTION_GAMEPASS_DB_ID: "existing-game-pass-id",
        NOTION_BADGE_DB_ID: "existing-badge-id",
      }),
      { force: true, writeToml: false },
    );

    assert.deepEqual(result, CREATED_IDS);
    assert.equal(databasesCreate.mock.callCount(), 3);
  });

  it("writes created database IDs to TOML with --write-toml", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-init-write-toml-"));
    const tomlPath = writeInitToml(dir);

    await runInit(makeInitConfig(), {
      force: false,
      writeToml: true,
      tomlPath,
    });

    const parsed = parse(readFileSync(tomlPath, "utf8")) as {
      notion: {
        dev_product_db_id: string;
        game_pass_db_id: string;
        badge_db_id: string;
        parent_page_id: string;
      };
    };

    assert.equal(parsed.notion.dev_product_db_id, CREATED_IDS.devProductDbId);
    assert.equal(parsed.notion.game_pass_db_id, CREATED_IDS.gamePassDbId);
    assert.equal(parsed.notion.badge_db_id, CREATED_IDS.badgeDbId);
    assert.equal(
      parsed.notion.parent_page_id,
      "parent-page-id-1234567890123456",
    );
  });

  it("does not update TOML when database creation partially fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-init-partial-fail-"));
    const tomlPath = writeInitToml(dir);
    const originalContent = readFileSync(tomlPath, "utf8");

    let createIndex = 0;
    databasesCreate.mock.mockImplementation(async () => {
      createIndex += 1;
      if (createIndex === 3) {
        throw new Error("Notion API unavailable");
      }
      return { id: DB_CREATE_ORDER[createIndex - 1] };
    });

    await assert.rejects(
      () =>
        runInit(makeInitConfig(), {
          force: false,
          writeToml: true,
          tomlPath,
        }),
      /Failed to create Notion database/,
    );

    assert.equal(readFileSync(tomlPath, "utf8"), originalContent);
  });
});
