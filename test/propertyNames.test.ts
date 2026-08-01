import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { robloxIdPropertyName } from "../src/notion/propertyNames.js";
import { aggregateTargetResults } from "../src/notion/writeback.js";

describe("robloxIdPropertyName", () => {
  it("returns Roblox ID for single-universe mode", () => {
    assert.equal(robloxIdPropertyName(null), "Roblox ID");
  });

  it("returns per-key column name in multi-universe mode", () => {
    assert.equal(robloxIdPropertyName("main"), "Roblox ID (main)");
    assert.equal(robloxIdPropertyName("staging"), "Roblox ID (staging)");
  });
});

describe("aggregateTargetResults", () => {
  it("prefixes errors with target key in multi-universe mode", () => {
    const aggregated = aggregateTargetResults([
      {
        targetKey: "main",
        outcome: "error",
        message: "API failed",
      },
      {
        targetKey: "staging",
        outcome: "created",
        robloxId: 100,
      },
    ]);

    assert.equal(aggregated.syncStatus, "Error");
    assert.match(aggregated.syncError, /\[main\] API failed/);
    assert.equal(aggregated.robloxIds.staging, 100);
  });

  it("returns Synced when all targets succeed", () => {
    const aggregated = aggregateTargetResults([
      { targetKey: "main", outcome: "updated", robloxId: 1 },
      { targetKey: "staging", outcome: "created", robloxId: 2 },
    ]);

    assert.equal(aggregated.syncStatus, "Synced");
    assert.equal(aggregated.syncError, "");
    assert.deepEqual(aggregated.robloxIds, { main: 1, staging: 2 });
  });
});
