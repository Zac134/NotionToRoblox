import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyRow } from "../src/sync/candidates.js";
import { makeRow } from "./helpers.js";

describe("classifyRow", () => {
  it("skips Synced rows when force is false", () => {
    const row = makeRow({ syncStatus: "Synced", robloxId: 123 });
    const result = classifyRow(row);
    assert.equal(result.action, "skip");
    assert.match(result.reason ?? "", /Synced/);
  });

  it("creates Synced rows without robloxId when force is true", () => {
    const row = makeRow({ syncStatus: "Synced", robloxId: null });
    const result = classifyRow(row, { force: true });
    assert.equal(result.action, "create");
  });

  it("updates Synced rows with robloxId when force is true", () => {
    const row = makeRow({ syncStatus: "Synced", robloxId: 456 });
    const result = classifyRow(row, { force: true });
    assert.equal(result.action, "update");
  });

  it("creates rows without robloxId", () => {
    const row = makeRow({ syncStatus: "Pending", robloxId: null });
    assert.equal(classifyRow(row).action, "create");
  });

  for (const syncStatus of ["Pending", "Error", "Skipped"] as const) {
    it(`updates rows with robloxId when syncStatus is ${syncStatus}`, () => {
      const row = makeRow({ syncStatus, robloxId: 789 });
      assert.equal(classifyRow(row).action, "update");
    });
  }
});
