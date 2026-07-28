import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectNotionRobloxIds,
  findOrphans,
} from "../src/sync/orphanReport.js";

describe("collectNotionRobloxIds", () => {
  it("collects non-null robloxId values", () => {
    const ids = collectNotionRobloxIds([
      { robloxId: 10 },
      { robloxId: null },
      { robloxId: 20 },
      { robloxId: 10 },
    ]);
    assert.deepEqual([...ids].sort((a, b) => a - b), [10, 20]);
  });

  it("returns an empty set when no rows have robloxId", () => {
    const ids = collectNotionRobloxIds([{ robloxId: null }]);
    assert.equal(ids.size, 0);
  });
});

describe("findOrphans", () => {
  it("returns Roblox items not referenced in Notion, sorted by robloxId", () => {
    const notionIds = new Set([100, 300]);
    const orphans = findOrphans(
      [
        { robloxId: 300, name: "Referenced" },
        { robloxId: 200, name: "Orphan B" },
        { robloxId: 150, name: "Orphan A" },
      ],
      notionIds,
    );
    assert.deepEqual(
      orphans.map((item) => item.robloxId),
      [150, 200],
    );
  });

  it("returns an empty array when all Roblox items are referenced", () => {
    const notionIds = new Set([1, 2]);
    const orphans = findOrphans(
      [
        { robloxId: 1, name: "A" },
        { robloxId: 2, name: "B" },
      ],
      notionIds,
    );
    assert.deepEqual(orphans, []);
  });
});
