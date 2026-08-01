import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { makeRow } from "./helpers.js";
import "./setup.js";

describe("asset sync", () => {
  let processCandidate: typeof import("../src/sync/engine.js").processCandidate;
  const createAsset = mock.fn(async () => 99_001);
  const updateAssetMetadata = mock.fn(async () => {});
  const downloadFile = mock.fn(async () => ({
    buffer: Buffer.from("file"),
    filename: "model.fbx",
    mimeType: "model/fbx",
  }));

  before(async () => {
    mock.module("../src/roblox/assets.js", {
      namedExports: {
        createAsset,
        updateAssetMetadata,
      },
    });
    mock.module("../src/notion/writeback.js", {
      namedExports: {
        writebackRobloxId: mock.fn(async () => {}),
        writebackSuccess: mock.fn(async () => {}),
        writebackError: mock.fn(async () => {}),
        writebackSkipped: mock.fn(async () => {}),
        writebackAggregatedTargetResults: mock.fn(async () => {}),
        aggregateTargetResults: mock.fn(() => ({
          syncStatus: "Synced",
          syncError: "",
          robloxIds: {},
        })),
      },
    });
    mock.module("../src/util/download.js", {
      namedExports: {
        downloadFile,
        MAX_ASSET_DOWNLOAD_BYTES: 20 * 1024 * 1024,
      },
    });

    ({ processCandidate } = await import("../src/sync/engine.js"));
  });

  after(() => {
    mock.reset();
  });

  beforeEach(() => {
    createAsset.mock.resetCalls();
    updateAssetMetadata.mock.resetCalls();
    downloadFile.mock.resetCalls();
  });

  it("creates asset by downloading file and calling createAsset", async () => {
    const candidate = {
      row: makeRow({
        type: "asset",
        assetType: "Model",
        fileUrl: "https://example.com/model.fbx",
        robloxId: null,
      }),
      action: "create" as const,
    };

    const result = await processCandidate(candidate, {
      dryRun: false,
      targetKey: null,
    });

    assert.equal(result.outcome, "created");
    assert.equal(createAsset.mock.callCount(), 1);
    assert.equal(downloadFile.mock.callCount(), 1);
  });

  it("updates asset metadata only on update", async () => {
    const candidate = {
      row: makeRow({
        type: "asset",
        assetType: "Image",
        fileUrl: "https://example.com/image.png",
        robloxId: 55_001,
      }),
      action: "update" as const,
    };

    const result = await processCandidate(candidate, {
      dryRun: false,
      targetKey: null,
    });

    assert.equal(result.outcome, "updated");
    assert.equal(updateAssetMetadata.mock.callCount(), 1);
    assert.equal(createAsset.mock.callCount(), 0);
    assert.equal(downloadFile.mock.callCount(), 0);
  });
});
