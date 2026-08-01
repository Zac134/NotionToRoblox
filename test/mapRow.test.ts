import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { loadSyncConfig, setConfig } from "../src/config.js";
import { mapAssetPage, mapDeveloperProductPage } from "../src/notion/mapRow.js";

function makePage(
  properties: PageObjectResponse["properties"],
): PageObjectResponse {
  return {
    object: "page",
    id: "page-test-1",
    created_time: "2026-01-01T00:00:00.000Z",
    last_edited_time: "2026-01-01T00:00:00.000Z",
    archived: false,
    in_trash: false,
    url: "https://notion.so/page-test-1",
    properties,
    parent: { type: "database_id", database_id: "db-1" },
    icon: null,
    cover: null,
    created_by: { object: "user", id: "user-1" },
    last_edited_by: { object: "user", id: "user-1" },
    public_url: null,
  } as PageObjectResponse;
}

function baseProperties(
  extras: PageObjectResponse["properties"] = {},
): PageObjectResponse["properties"] {
  return {
    Name: {
      id: "name",
      type: "title",
      title: [
        {
          type: "text",
          plain_text: "Test",
          text: { content: "Test", link: null },
          annotations: {
            bold: false,
            italic: false,
            strikethrough: false,
            underline: false,
            code: false,
            color: "default",
          },
          href: null,
        },
      ],
    },
    Description: { id: "desc", type: "rich_text", rich_text: [] },
    "Sync Status": {
      id: "status",
      type: "select",
      select: { id: "pending", name: "Pending", color: "default" },
    },
    "Sync Error": { id: "err", type: "rich_text", rich_text: [] },
    "Last Synced At": { id: "synced", type: "date", date: null },
    ...extras,
  };
}

describe("mapAssetPage", () => {
  it("maps asset fields and validates Asset Type", () => {
    const mapped = mapAssetPage(
      makePage(
        baseProperties({
          "Asset Type": {
            id: "type",
            type: "select",
            select: { id: "model", name: "Model", color: "default" },
          },
          File: {
            id: "file",
            type: "files",
            files: [
              {
                name: "model.fbx",
                type: "external",
                external: { url: "https://example.com/model.fbx" },
              },
            ],
          },
          "Roblox ID": { id: "rid", type: "number", number: 12345 },
        }),
      ),
    );

    assert.ok(!("message" in mapped));
    if ("message" in mapped) {
      return;
    }

    assert.equal(mapped.type, "asset");
    assert.equal(mapped.assetType, "Model");
    assert.equal(mapped.fileUrl, "https://example.com/model.fbx");
    assert.equal(mapped.robloxId, 12345);
  });

  it("returns mapping error for unsupported Asset Type", () => {
    const mapped = mapAssetPage(
      makePage(
        baseProperties({
          "Asset Type": {
            id: "type",
            type: "select",
            select: { id: "mesh", name: "MeshPart", color: "default" },
          },
          File: { id: "file", type: "files", files: [] },
        }),
      ),
    );

    assert.ok("message" in mapped);
    if ("message" in mapped) {
      assert.match(mapped.message, /Invalid Asset Type/);
    }
  });
});

describe("mapDeveloperProductPage multi-universe", () => {
  let multiTomlPath: string;

  before(() => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-maprow-"));
    multiTomlPath = join(dir, "ntn-roblox.toml");
    writeFileSync(
      multiTomlPath,
      `[notion]
dev_product_db_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
game_pass_db_id   = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
badge_db_id       = "cccccccccccccccccccccccccccccccc"
asset_db_id       = "dddddddddddddddddddddddddddddddd"

[roblox]
universes = { main = 111, staging = 222 }
asset_creator = { is_group = false, id = 87654321 }
`,
      "utf8",
    );

    setConfig(
      loadSyncConfig({
        env: {
          NOTION_TOKEN: "test-notion-token",
          ROBLOX_API_KEY: "test-roblox-api-key",
        },
        tomlPath: multiTomlPath,
      }),
    );
  });

  after(() => {
    setConfig(
      loadSyncConfig({
        env: {
          NOTION_TOKEN: "test-notion-token",
          ROBLOX_API_KEY: "test-roblox-api-key",
        },
      }),
    );
  });

  it("reads per-key Roblox ID columns with robloxId null", () => {
    const mapped = mapDeveloperProductPage(
      makePage(
        baseProperties({
          "Roblox ID (main)": { id: "rid-main", type: "number", number: 111 },
          "Roblox ID (staging)": {
            id: "rid-staging",
            type: "number",
            number: null,
          },
          Price: { id: "price", type: "number", number: 50 },
          "Is For Sale": { id: "sale", type: "checkbox", checkbox: true },
          Icon: { id: "icon", type: "files", files: [] },
        }),
      ),
    );

    assert.ok(!("message" in mapped));
    if ("message" in mapped) {
      return;
    }

    assert.equal(mapped.robloxId, null);
    assert.deepEqual(mapped.robloxIds, { main: 111, staging: null });
  });
});
