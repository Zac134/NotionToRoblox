import { config } from "../config.js";
import type { FileUpload } from "../types.js";
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

export class RobloxHttpError extends Error {
  readonly status: number;
  readonly body: string;
  readonly url: string;

  constructor(status: number, body: string, url: string) {
    super(`Roblox API error ${status} for ${url}: ${body}`);
    this.name = "RobloxHttpError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
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
      headers["x-api-key"] = config.ROBLOX_API_KEY;
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

  return limiter ? limiter.schedule(execute) : execute();
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
        "x-api-key": config.ROBLOX_API_KEY,
      },
      body: form,
    });

    return parseResponse<T>(response, `${baseUrl}${path}`, method === "PATCH" && response.status === 204);
  };

  return limiter ? limiter.schedule(execute) : execute();
}

async function parseResponse<T>(
  response: Response,
  url: string,
  allowNoContent: boolean,
): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new RobloxHttpError(response.status, text, url);
  }

  if (allowNoContent || text.length === 0) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export function universePathPrefix(resourcePath: string): string {
  return resourcePath.replace("{universeId}", String(config.ROBLOX_UNIVERSE_ID));
}

export {
  robloxDeveloperProductReadLimiter,
  robloxDeveloperProductWriteLimiter,
  robloxGamePassReadLimiter,
  robloxGamePassWriteLimiter,
  robloxBadgeLimiter,
};
