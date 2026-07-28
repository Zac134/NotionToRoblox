import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RobloxHttpError,
  computeRobloxRetryDelayMs,
  shouldRetryRobloxStatus,
} from "../src/roblox/http.js";
import { sanitizeErrorMessage } from "../src/util/sanitizeError.js";

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

describe("RobloxHttpError", () => {
  it("uses a short message without response body", () => {
    const body = '{"errors":[{"message":"Invalid API key abcdefghijklmnopqrstuvwxyz012345"}]}';
    const error = new RobloxHttpError(
      403,
      body,
      "https://apis.roblox.com/v1/universe/1/developer-products",
    );

    assert.equal(
      error.message,
      "Roblox API error 403 for https://apis.roblox.com/v1/universe/1/developer-products",
    );
    assert.equal(error.body, body);
    assert.equal(error.status, 403);
  });
});

describe("sanitizeErrorMessage", () => {
  it("redacts Notion secret tokens", () => {
    const message = "Auth failed with secret_abcdefghijklmnopqrstuvwxyz0123456789";
    assert.equal(
      sanitizeErrorMessage(message),
      "Auth failed with [redacted]",
    );
  });

  it("redacts long alphanumeric tokens", () => {
    const token = "abcdefghijklmnopqrstuvwxyz012345";
    assert.equal(
      sanitizeErrorMessage(`Request failed: ${token}`),
      "Request failed: [redacted]",
    );
  });

  it("redacts x-api-key header values", () => {
    assert.equal(
      sanitizeErrorMessage("Header x-api-key: my-secret-key-value"),
      "Header x-api-key: [redacted]",
    );
  });

  it("preserves short identifiers and UUIDs", () => {
    const message = "page abc123-def456 failed for roblox id 987654321";
    assert.equal(sanitizeErrorMessage(message), message);
  });
});
