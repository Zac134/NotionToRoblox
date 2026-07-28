import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { downloadFile } from "../src/util/download.js";
import {
  MAX_DOWNLOAD_BYTES,
  MAX_REDIRECTS,
  validateDownloadUrl,
} from "../src/util/urlSafety.js";

describe("validateDownloadUrl", () => {
  it("allows public https URLs", () => {
    const parsed = validateDownloadUrl("https://example.com/icons/test.png");
    assert.equal(parsed.hostname, "example.com");
  });

  it("allows public IPv4 addresses", () => {
    const parsed = validateDownloadUrl("https://8.8.8.8/icon.png");
    assert.equal(parsed.hostname, "8.8.8.8");
  });

  it("rejects non-https schemes", () => {
    assert.throws(
      () => validateDownloadUrl("http://example.com/icon.png"),
      /must use https/,
    );
    assert.throws(
      () => validateDownloadUrl("file:///etc/passwd"),
      /must use https/,
    );
  });

  it("rejects invalid URLs", () => {
    assert.throws(() => validateDownloadUrl("not-a-url"), /Invalid download URL/);
  });

  it("rejects dangerous hostnames", () => {
    assert.throws(
      () => validateDownloadUrl("https://localhost/icon.png"),
      /hostname is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://LOCALHOST/icon.png"),
      /hostname is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://app.localhost/icon.png"),
      /hostname is not allowed/,
    );
  });

  it("rejects loopback IPv4 addresses", () => {
    assert.throws(
      () => validateDownloadUrl("https://127.0.0.1/icon.png"),
      /IP address is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://127.0.1.1/icon.png"),
      /IP address is not allowed/,
    );
  });

  it("rejects private IPv4 addresses", () => {
    assert.throws(
      () => validateDownloadUrl("https://10.0.0.1/icon.png"),
      /IP address is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://172.16.0.1/icon.png"),
      /IP address is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://192.168.1.1/icon.png"),
      /IP address is not allowed/,
    );
  });

  it("rejects link-local and metadata IPv4 addresses", () => {
    assert.throws(
      () => validateDownloadUrl("https://169.254.169.254/latest/meta-data"),
      /IP address is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://169.254.1.1/icon.png"),
      /IP address is not allowed/,
    );
  });

  it("rejects unspecified IPv4 and IPv6 addresses", () => {
    assert.throws(
      () => validateDownloadUrl("https://0.0.0.0/icon.png"),
      /IP address is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://[::]/icon.png"),
      /IP address is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://[::0]/icon.png"),
      /IP address is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://[::ffff:0.0.0.0]/icon.png"),
      /IP address is not allowed/,
    );
  });

  it("rejects loopback and private IPv6 addresses", () => {
    assert.throws(
      () => validateDownloadUrl("https://[::1]/icon.png"),
      /IP address is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://[fe80::1]/icon.png"),
      /IP address is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://[fc00::1]/icon.png"),
      /IP address is not allowed/,
    );
    assert.throws(
      () => validateDownloadUrl("https://[::ffff:127.0.0.1]/icon.png"),
      /IP address is not allowed/,
    );
  });
});

describe("downloadFile", () => {
  let originalFetch: typeof globalThis.fetch;

  before(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  it("downloads a valid https response", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(Buffer.from("png-bytes"), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    ) as typeof fetch;

    const result = await downloadFile("https://example.com/icon.png");

    assert.equal(result.buffer.toString(), "png-bytes");
    assert.equal(result.filename, "icon.png");
    assert.equal(result.mimeType, "image/png");
    assert.equal((globalThis.fetch as ReturnType<typeof mock.fn>).mock.callCount(), 1);
    const fetchOptions = (globalThis.fetch as ReturnType<typeof mock.fn>).mock
      .calls[0]!.arguments[1] as RequestInit;
    assert.equal(fetchOptions.redirect, "manual");
  });

  it("rejects unsafe URLs before fetching", async () => {
    globalThis.fetch = mock.fn(async () => new Response()) as typeof fetch;

    await assert.rejects(
      () => downloadFile("https://127.0.0.1/icon.png"),
      /IP address is not allowed/,
    );
    assert.equal((globalThis.fetch as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  });

  it("follows redirects up to the configured limit", async () => {
    const fetchMock = mock.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://example.com/start.png") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.com/icon.png" },
        });
      }
      if (url === "https://cdn.example.com/icon.png") {
        return new Response(Buffer.from("ok"), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await downloadFile("https://example.com/start.png");

    assert.equal(result.buffer.toString(), "ok");
    assert.equal(fetchMock.mock.callCount(), 2);
  });

  it(`rejects more than ${MAX_REDIRECTS} redirects`, async () => {
    const fetchMock = mock.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/r3")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://example.com/r4" },
        });
      }
      return new Response(null, {
        status: 302,
        headers: {
          location: `https://example.com/r${Number(url.match(/r(\d+)/)?.[1] ?? 0) + 1}`,
        },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await assert.rejects(
      () => downloadFile("https://example.com/r0"),
      /Too many redirects/,
    );
    assert.equal(fetchMock.mock.callCount(), MAX_REDIRECTS + 1);
  });

  it("rejects redirects to unsafe URLs", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/icon.png" },
      }),
    ) as typeof fetch;

    await assert.rejects(
      () => downloadFile("https://example.com/start.png"),
      /IP address is not allowed/,
    );
    assert.equal((globalThis.fetch as ReturnType<typeof mock.fn>).mock.callCount(), 1);
  });

  it("rejects responses larger than the download limit", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(Buffer.alloc(MAX_DOWNLOAD_BYTES + 1), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    ) as typeof fetch;

    await assert.rejects(
      () => downloadFile("https://example.com/large.png"),
      /Download body exceeds/,
    );
  });

  it("rejects oversized Content-Length before reading the body", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(null, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(MAX_DOWNLOAD_BYTES + 1),
        },
      }),
    ) as typeof fetch;

    await assert.rejects(
      () => downloadFile("https://example.com/large.png"),
      /Download body exceeds/,
    );
  });

  it("rejects non-ok responses", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response("missing", {
        status: 404,
        headers: { "content-type": "text/plain" },
      }),
    ) as typeof fetch;

    await assert.rejects(
      () => downloadFile("https://example.com/missing.png"),
      /Download failed \(404\)/,
    );
  });
});
