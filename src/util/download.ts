import { logger } from "./logger.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface DownloadedFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export async function downloadFile(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<DownloadedFile> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status}) for ${sanitizeUrl(url)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = filenameFromUrl(url);
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
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
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
