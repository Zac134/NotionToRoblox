import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyRow } from "../src/sync/candidates.js";
import { makeRow } from "./helpers.js";

describe("classifyRow", () => {
  describe("sync mode", () => {
    it("creates rows without robloxId", () => {
      const row = makeRow({ syncStatus: "Pending", robloxId: null });
      assert.equal(classifyRow(row, { mode: "sync" }).action, "create");
    });

    it("skips rows with robloxId set regardless of Sync Status", () => {
      const row = makeRow({ syncStatus: "Synced", robloxId: 123 });
      const result = classifyRow(row, { mode: "sync" });
      assert.equal(result.action, "skip");
      assert.match(result.reason ?? "", /already set/);
    });

    it("uses robloxIdForTarget when provided", () => {
      const row = makeRow({ robloxId: null, robloxIds: { main: 456 } });
      const result = classifyRow(row, {
        mode: "sync",
        robloxIdForTarget: 456,
      });
      assert.equal(result.action, "skip");
    });
  });

  describe("update mode", () => {
    it("updates rows with robloxId", () => {
      const row = makeRow({ syncStatus: "Pending", robloxId: 789 });
      assert.equal(classifyRow(row, { mode: "update" }).action, "update");
    });

    it("skips rows without robloxId regardless of Sync Status", () => {
      const row = makeRow({ syncStatus: "Synced", robloxId: null });
      const result = classifyRow(row, { mode: "update" });
      assert.equal(result.action, "skip");
      assert.match(result.reason ?? "", /empty/);
    });

    it("uses robloxIdForTarget when provided", () => {
      const row = makeRow({ robloxId: 999, robloxIds: { main: null } });
      const result = classifyRow(row, {
        mode: "update",
        robloxIdForTarget: null,
      });
      assert.equal(result.action, "skip");
    });
  });
});
