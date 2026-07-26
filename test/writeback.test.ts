import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSyncStatusProperty } from "../src/notion/writeback.js";
import { seedSyncStatusPropertyTypeForTests } from "../src/notion/schema.js";
import type { SyncStatus } from "../src/types.js";

const STATUS_DB = "test-db-status";
const SELECT_DB = "test-db-select";

describe("buildSyncStatusProperty", () => {
  seedSyncStatusPropertyTypeForTests(STATUS_DB, "status");
  seedSyncStatusPropertyTypeForTests(SELECT_DB, "select");

  for (const name of ["Pending", "Synced", "Error", "Skipped"] as SyncStatus[]) {
    it(`builds status property for ${name}`, () => {
      assert.deepEqual(buildSyncStatusProperty(STATUS_DB, name), {
        status: { name },
      });
    });

    it(`builds select property for ${name}`, () => {
      assert.deepEqual(buildSyncStatusProperty(SELECT_DB, name), {
        select: { name },
      });
    });
  }
});
