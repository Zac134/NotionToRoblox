import { isIP } from "node:net";

export const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

export function validateDownloadUrl(urlString: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid download URL");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Download URL must use https");
  }

  const hostname = unbracketHostname(parsed.hostname);
  if (!hostname) {
    throw new Error("Download URL hostname is required");
  }

  if (isBlockedHostname(hostname)) {
    throw new Error(`Download URL hostname is not allowed: ${hostname}`);
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4 || ipVersion === 6) {
    if (isBlockedIpAddress(hostname, ipVersion)) {
      throw new Error(`Download URL IP address is not allowed: ${hostname}`);
    }
  }

  return parsed;
}

function unbracketHostname(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) {
    return true;
  }
  return lower.endsWith(".localhost");
}

function isBlockedIpAddress(host: string, version: 4 | 6): boolean {
  if (version === 4) {
    return isBlockedIpv4(host);
  }
  return isBlockedIpv6(host);
}

function isBlockedIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0) {
    return true;
  }
  if (a === 127) {
    return true;
  }
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "::" || lower === "::0") {
    return true;
  }
  if (lower === "::1") {
    return true;
  }

  const mappedIpv4 = extractIpv4FromMappedIpv6(lower);
  if (mappedIpv4 !== null) {
    return isBlockedIpv4(mappedIpv4);
  }

  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  ) {
    return true;
  }

  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }

  return false;
}

function extractIpv4FromMappedIpv6(host: string): string | null {
  const dotted = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    return dotted[1]!;
  }

  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) {
    return null;
  }

  const high = Number.parseInt(hex[1]!, 16);
  const low = Number.parseInt(hex[2]!, 16);
  const octets = [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ];
  if (octets.some((octet) => Number.isNaN(octet))) {
    return null;
  }
  return octets.join(".");
}
