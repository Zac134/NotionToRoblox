import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "smol-toml";
import { updateNotionDatabaseIdsInToml } from "../src/tomlWrite.js";

const IDS = {
  devProductDbId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  gamePassDbId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  badgeDbId: "cccccccccccccccccccccccccccccccc",
};

describe("updateNotionDatabaseIdsInToml", () => {
  it("replaces existing notion database id values and preserves comments", () => {
    const input = `# project config
[notion]
dev_product_db_id = "old-dev"
game_pass_db_id   = "old-pass" # primary pass db
badge_db_id       = "old-badge"

[roblox]
universe_id = 123
`;

    const output = updateNotionDatabaseIdsInToml(input, IDS);

    assert.match(output, /# project config/);
    assert.match(output, /# primary pass db/);
    assert.match(
      output,
      /game_pass_db_id\s*=\s*"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" # primary pass db/,
    );
    assert.doesNotMatch(output, /old-dev/);
    assert.doesNotMatch(output, /old-pass/);
    assert.doesNotMatch(output, /old-badge/);

    const parsed = parse(output) as {
      notion: {
        dev_product_db_id: string;
        game_pass_db_id: string;
        badge_db_id: string;
      };
    };
    assert.equal(parsed.notion.dev_product_db_id, IDS.devProductDbId);
    assert.equal(parsed.notion.game_pass_db_id, IDS.gamePassDbId);
    assert.equal(parsed.notion.badge_db_id, IDS.badgeDbId);
  });

  it("inserts missing keys immediately after [notion]", () => {
    const input = `[notion]
parent_page_id = "parent-should-stay"

[roblox]
universe_id = 123
`;

    const output = updateNotionDatabaseIdsInToml(input, IDS);

    assert.match(
      output,
      /\[notion\]\ndev_product_db_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"\ngame_pass_db_id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"\nbadge_db_id = "cccccccccccccccccccccccccccccccc"\nparent_page_id = "parent-should-stay"/,
    );
  });

  it("does not modify parent_page_id", () => {
    const input = `[notion]
parent_page_id    = "keep-this-parent-id"
dev_product_db_id = "old-dev"
game_pass_db_id   = "old-pass"
badge_db_id       = "old-badge"
`;

    const output = updateNotionDatabaseIdsInToml(input, IDS);

    assert.match(output, /parent_page_id\s*=\s*"keep-this-parent-id"/);
    assert.match(output, /dev_product_db_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/);
  });

  it("inserts only missing keys while updating existing ones", () => {
    const input = `[notion]
dev_product_db_id = "old-dev"
parent_page_id = "parent-should-stay"
`;

    const output = updateNotionDatabaseIdsInToml(input, IDS);

    assert.match(output, /dev_product_db_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/);
    assert.match(output, /game_pass_db_id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/);
    assert.match(output, /badge_db_id = "cccccccccccccccccccccccccccccccc"/);
    assert.match(output, /parent_page_id = "parent-should-stay"/);
    assert.doesNotMatch(output, /old-dev/);
  });

  it("throws when [notion] section is missing", () => {
    assert.throws(
      () =>
        updateNotionDatabaseIdsInToml(
          `[roblox]\nuniverse_id = 1\n`,
          IDS,
        ),
      /Missing \[notion\] section/,
    );
  });
});
