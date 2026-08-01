import { logger } from "./logger.js";
import {
  MAX_DOWNLOAD_BYTES,
  MAX_REDIRECTS,
  validateDownloadUrl,
} from "./urlSafety.js";

export const MAX_ASSET_DOWNLOAD_BYTES = 20 * 1024 * 1024;

const DEFAULT_TIMEOUT_MS = 30_000;

export interface DownloadedFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export async function downloadFile(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = MAX_DOWNLOAD_BYTES,
): Promise<DownloadedFile> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { response, finalUrl } = await fetchWithRedirects(
      url,
      controller.signal,
    );
    if (!response.ok) {
      throw new Error(
        `Download failed (${response.status}) for ${sanitizeUrl(finalUrl)}`,
      );
    }

    const buffer = await readResponseBodyLimited(response, maxBytes);
    const filename = filenameFromUrl(finalUrl);
    const mimeType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      guessMimeType(filename);

    return { buffer, filename, mimeType };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Download timed out for ${sanitizeUrl(url)}`);
    }
    logger.debug("downloadFile error", { url: sanitizeUrl(url), error });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRedirects(
  initialUrl: string,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: string }> {
  validateDownloadUrl(initialUrl);

  let currentUrl = initialUrl;
  let redirectsFollowed = 0;

  while (true) {
    const response = await fetch(currentUrl, {
      signal,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      if (redirectsFollowed >= MAX_REDIRECTS) {
        throw new Error(`Too many redirects for ${sanitizeUrl(initialUrl)}`);
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new Error(
          `Redirect response missing Location for ${sanitizeUrl(currentUrl)}`,
        );
      }

      currentUrl = new URL(location, currentUrl).href;
      validateDownloadUrl(currentUrl);
      redirectsFollowed += 1;
      continue;
    }

    return { response, finalUrl: currentUrl };
  }
}

async function readResponseBodyLimited(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isNaN(length) && length > maxBytes) {
      throw new Error(`Download body exceeds ${maxBytes} bytes`);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Download body exceeds ${maxBytes} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop();
    if (base && base.length > 0) {
      return decodeURIComponent(base);
    }
  } catch {
    // fall through
  }
  return "icon.png";
}

function guessMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".bmp")) {
    return "image/bmp";
  }
  if (lower.endsWith(".tga")) {
    return "image/tga";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (lower.endsWith(".ogg")) {
    return "audio/ogg";
  }
  if (lower.endsWith(".wav")) {
    return "audio/wav";
  }
  if (lower.endsWith(".flac")) {
    return "audio/flac";
  }
  if (lower.endsWith(".fbx")) {
    return "model/fbx";
  }
  if (lower.endsWith(".gltf")) {
    return "model/gltf+json";
  }
  if (lower.endsWith(".glb")) {
    return "model/gltf-binary";
  }
  if (lower.endsWith(".rbxm") || lower.endsWith(".rbxmx")) {
    return "model/x-rbxm";
  }
  return "image/png";
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}
