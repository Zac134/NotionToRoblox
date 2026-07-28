import { getConfig } from "../config.js";
import type { FileUpload } from "../types.js";
import { logger } from "../util/logger.js";
import {
  robloxBadgeLimiter,
  robloxDeveloperProductReadLimiter,
  robloxDeveloperProductWriteLimiter,
  robloxGamePassReadLimiter,
  robloxGamePassWriteLimiter,
  type RateLimiter,
  type RateLimiterPerMinute,
} from "../util/rateLimit.js";

export const ROBLOX_API_BASE = "https://apis.roblox.com";
export const BADGES_PUBLIC_BASE = "https://badges.roblox.com";

const MAX_ROBLOX_RETRIES = 3;
const DEBUG_BODY_MAX = 500;

export class RobloxHttpError extends Error {
  readonly status: number;
  readonly body: string;
  readonly url: string;

  constructor(status: number, body: string, url: string) {
    super(`Roblox API error ${status} for ${url}`);
    this.name = "RobloxHttpError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

class RobloxHttpRetryableError extends Error {
  readonly status: number;
  readonly body: string;
  readonly url: string;
  readonly retryAfter: string | null;

  constructor(
    status: number,
    body: string,
    url: string,
    retryAfter: string | null,
  ) {
    super(`Roblox API retryable error ${status} for ${url}`);
    this.name = "RobloxHttpRetryableError";
    this.status = status;
    this.body = body;
    this.url = url;
    this.retryAfter = retryAfter;
  }
}

export function shouldRetryRobloxStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function parseRetryAfterMs(retryAfter: string | null): number | undefined {
  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(retryAfter);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}

export function computeRobloxRetryDelayMs(
  attempt: number,
  status: number,
  retryAfter: string | null,
): number {
  let baseMs: number;
  if (status === 429) {
    const retryAfterMs = parseRetryAfterMs(retryAfter);
    baseMs = retryAfterMs ?? Math.min(8000, 500 * 2 ** attempt);
  } else {
    baseMs = Math.min(8000, 500 * 2 ** attempt);
  }

  const jitterMs = Math.floor(Math.random() * 250);
  return baseMs + jitterMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeWithRetry<T>(
  execute: () => Promise<T>,
  limiter?: Limiter,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_ROBLOX_RETRIES; attempt++) {
    try {
      const run = () => execute();
      return limiter ? await limiter.schedule(run) : await run();
    } catch (error) {
      if (!(error instanceof RobloxHttpRetryableError)) {
        throw error;
      }

      if (attempt >= MAX_ROBLOX_RETRIES) {
        logRobloxErrorResponse(error.status, error.url, error.body);
        throw new RobloxHttpError(error.status, error.body, error.url);
      }

      const delayMs = computeRobloxRetryDelayMs(
        attempt,
        error.status,
        error.retryAfter,
      );
      await sleep(delayMs);
    }
  }

  throw new Error("executeWithRetry exhausted without result");
}

type Limiter = RateLimiter | RateLimiterPerMinute;

export interface RobloxJsonOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  baseUrl?: string;
  useApiKey?: boolean;
  limiter?: Limiter;
}

export interface RobloxMultipartField {
  name: string;
  value: string | boolean | number;
}

export interface RobloxMultipartOptions {
  method: "POST" | "PATCH";
  path: string;
  fields: RobloxMultipartField[];
  file?: FileUpload & { fieldName: string };
  baseUrl?: string;
  limiter?: Limiter;
}

export async function robloxJson<T>(options: RobloxJsonOptions): Promise<T> {
  const {
    method = "GET",
    path,
    body,
    baseUrl = ROBLOX_API_BASE,
    useApiKey = true,
    limiter,
  } = options;

  const execute = async (): Promise<T> => {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (useApiKey) {
      headers["x-api-key"] = getConfig().ROBLOX_API_KEY;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    return parseResponse<T>(response, `${baseUrl}${path}`, method === "PATCH" && response.status === 204);
  };

  return executeWithRetry(execute, limiter);
}

export async function robloxMultipart<T>(
  options: RobloxMultipartOptions,
): Promise<T> {
  const {
    method,
    path,
    fields,
    file,
    baseUrl = ROBLOX_API_BASE,
    limiter,
  } = options;

  const execute = async (): Promise<T> => {
    const form = new FormData();
    for (const field of fields) {
      form.append(field.name, String(field.value));
    }
    if (file) {
      const blob = new Blob([file.buffer], { type: file.mimeType });
      form.append(file.fieldName, blob, file.filename);
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "x-api-key": getConfig().ROBLOX_API_KEY,
      },
      body: form,
    });

    return parseResponse<T>(response, `${baseUrl}${path}`, method === "PATCH" && response.status === 204);
  };

  return executeWithRetry(execute, limiter);
}

function truncateForDebug(text: string): string {
  if (text.length <= DEBUG_BODY_MAX) {
    return text;
  }
  return `${text.slice(0, DEBUG_BODY_MAX)}...`;
}

function logRobloxErrorResponse(
  status: number,
  url: string,
  body: string,
): void {
  logger.debug("Roblox API error response", {
    status,
    url,
    body: truncateForDebug(body),
  });
}

async function parseResponse<T>(
  response: Response,
  url: string,
  allowNoContent: boolean,
): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    if (shouldRetryRobloxStatus(response.status)) {
      throw new RobloxHttpRetryableError(
        response.status,
        text,
        url,
        response.headers.get("Retry-After"),
      );
    }
    logRobloxErrorResponse(response.status, url, text);
    throw new RobloxHttpError(response.status, text, url);
  }

  if (allowNoContent || text.length === 0) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export function universePathPrefix(resourcePath: string): string {
  return resourcePath.replace(
    "{universeId}",
    String(getConfig().ROBLOX_UNIVERSE_ID),
  );
}

export {
  robloxDeveloperProductReadLimiter,
  robloxDeveloperProductWriteLimiter,
  robloxGamePassReadLimiter,
  robloxGamePassWriteLimiter,
  robloxBadgeLimiter,
};
