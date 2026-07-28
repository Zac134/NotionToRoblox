import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { makeRow } from "./helpers.js";

describe("badge quota consumption", () => {
  let processCandidate: typeof import("../src/sync/engine.js").processCandidate;

  before(async () => {
    mock.module("../src/roblox/badges.js", {
      namedExports: {
        BadgeQuotaExhaustedError: class BadgeQuotaExhaustedError extends Error {},
        createBadge: mock.fn(async () => 42_001),
        getFreeBadgeQuota: mock.fn(async () => 5),
        listBadges: mock.fn(async () => []),
        updateBadge: mock.fn(async () => {}),
        warnQuotaExhausted: mock.fn(() => {}),
      },
    });
    mock.module("../src/notion/writeback.js", {
      namedExports: {
        writebackRobloxId: mock.fn(async () => {}),
        writebackSuccess: mock.fn(async () => {
          throw new Error("sync writeback failed");
        }),
        writebackError: mock.fn(async () => {}),
        writebackSkipped: mock.fn(async () => {}),
      },
    });
    mock.module("../src/util/download.js", {
      namedExports: {
        downloadFile: mock.fn(async () => undefined),
      },
    });

    ({ processCandidate } = await import("../src/sync/engine.js"));
  });

  after(() => {
    mock.reset();
  });

  it("consumes badge quota when Roblox create succeeds but sync writeback fails", async () => {
    let badgeQuota = 2;
    const candidate = {
      row: makeRow({ type: "badge", isActive: true }),
      action: "create" as const,
    };

    const result = await processCandidate(candidate, {
      dryRun: false,
      badgeQuota,
    });

    assert.equal(result.outcome, "error");
    assert.equal(result.consumedBadgeQuota, true);

    if (result.consumedBadgeQuota) {
      badgeQuota -= 1;
    }
    assert.equal(badgeQuota, 1);
  });
});
