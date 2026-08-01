import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs, printUsage, VERSION } from "../src/cli.js";

describe("cli", () => {
  it("prints help to stdout", () => {
    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      output += args.join(" ");
    };
    try {
      printUsage();
    } finally {
      console.log = originalLog;
    }

    assert.match(output, /Sync \/ update options:/);
    assert.match(output, /ntn-roblox update/);
    assert.match(output, /create-db/);
    const syncSection = output.slice(output.indexOf("Sync / update options:"));
    assert.doesNotMatch(syncSection, /--force/);
  });

  it("parses update command and --target", () => {
    const parsed = parseArgs(["update", "--target=main", "--dry-run"]);
    assert.equal(parsed.command, "update");
    if (parsed.command === "update" || parsed.command === "sync") {
      assert.equal(parsed.targetFilter, "main");
      assert.equal(parsed.dryRun, true);
    }
  });

  it("parses create-db alias", () => {
    const parsed = parseArgs(["create-db", "--force"]);
    assert.equal(parsed.command, "create-databases");
  });

  it("exports VERSION from package.json", () => {
    assert.match(VERSION, /^0\.2\.0$/);
  });
});
