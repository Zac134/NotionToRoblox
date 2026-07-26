import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeRobloxRetryDelayMs,
  shouldRetryRobloxStatus,
} from "../src/roblox/http.js";

describe("shouldRetryRobloxStatus", () => {
  it("retries on 429", () => {
    assert.equal(shouldRetryRobloxStatus(429), true);
  });

  it("retries on 5xx", () => {
    assert.equal(shouldRetryRobloxStatus(500), true);
    assert.equal(shouldRetryRobloxStatus(599), true);
  });

  it("does not retry on other status codes", () => {
    assert.equal(shouldRetryRobloxStatus(400), false);
    assert.equal(shouldRetryRobloxStatus(404), false);
    assert.equal(shouldRetryRobloxStatus(600), false);
  });
});

describe("computeRobloxRetryDelayMs", () => {
  it("uses Retry-After seconds for 429", () => {
    const delay = computeRobloxRetryDelayMs(0, 429, "2");
    assert.ok(delay >= 2000 && delay <= 2250);
  });

  it("falls back to exponential backoff for 429 without Retry-After", () => {
    const delay = computeRobloxRetryDelayMs(1, 429, null);
    assert.ok(delay >= 1000 && delay <= 1250);
  });

  it("uses exponential backoff for 5xx", () => {
    const delay = computeRobloxRetryDelayMs(2, 503, null);
    assert.ok(delay >= 2000 && delay <= 2250);
  });

  it("caps exponential backoff at 8000ms plus jitter", () => {
    const delay = computeRobloxRetryDelayMs(10, 500, null);
    assert.ok(delay >= 8000 && delay <= 8250);
  });
});
