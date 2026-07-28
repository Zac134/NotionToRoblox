import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runInit } from "../src/init/runInit.js";
import { ENV_TEMPLATE, TOML_TEMPLATE } from "../src/init/templates.js";

describe("runInit", () => {
  it("creates .env and ntn-roblox.toml when missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-init-scaffold-"));

    const result = await runInit({ force: false, cwd: dir });

    assert.deepEqual(
      result.files.map((f) => f.status),
      ["created", "created"],
    );
    assert.equal(readFileSync(join(dir, ".env"), "utf8"), ENV_TEMPLATE);
    assert.equal(
      readFileSync(join(dir, "ntn-roblox.toml"), "utf8"),
      TOML_TEMPLATE,
    );
  });

  it("skips existing files unless --force is set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-init-skip-"));
    writeFileSync(join(dir, ".env"), "EXISTING_ENV\n", "utf8");
    writeFileSync(join(dir, "ntn-roblox.toml"), "EXISTING_TOML\n", "utf8");

    const skipped = await runInit({ force: false, cwd: dir });
    assert.deepEqual(
      skipped.files.map((f) => f.status),
      ["skipped", "skipped"],
    );
    assert.equal(readFileSync(join(dir, ".env"), "utf8"), "EXISTING_ENV\n");
    assert.equal(
      readFileSync(join(dir, "ntn-roblox.toml"), "utf8"),
      "EXISTING_TOML\n",
    );

    const overwritten = await runInit({ force: true, cwd: dir });
    assert.deepEqual(
      overwritten.files.map((f) => f.status),
      ["overwritten", "overwritten"],
    );
    assert.equal(readFileSync(join(dir, ".env"), "utf8"), ENV_TEMPLATE);
    assert.equal(
      readFileSync(join(dir, "ntn-roblox.toml"), "utf8"),
      TOML_TEMPLATE,
    );
  });

  it("creates only missing files when one already exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ntn-init-partial-"));
    writeFileSync(join(dir, ".env"), "KEEP_ME\n", "utf8");

    const result = await runInit({ force: false, cwd: dir });

    assert.equal(result.files[0]?.status, "skipped");
    assert.equal(result.files[1]?.status, "created");
    assert.equal(readFileSync(join(dir, ".env"), "utf8"), "KEEP_ME\n");
    assert.equal(
      readFileSync(join(dir, "ntn-roblox.toml"), "utf8"),
      TOML_TEMPLATE,
    );
  });
});

describe("init templates", () => {
  it("match root *.example files", () => {
    const root = join(import.meta.dirname, "..");
    assert.equal(
      readFileSync(join(root, ".env.example"), "utf8"),
      ENV_TEMPLATE,
    );
    assert.equal(
      readFileSync(join(root, "ntn-roblox.toml.example"), "utf8"),
      TOML_TEMPLATE,
    );
  });
});
