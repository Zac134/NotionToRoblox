/** Redact API-key-like tokens from strings destined for Notion writeback. */
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/\bsecret_[A-Za-z0-9]+\b/g, "[redacted]")
    .replace(/\bx-api-key:\s*\S+/gi, "x-api-key: [redacted]")
    .replace(/\b[A-Za-z0-9]{32,}\b/g, "[redacted]");
}
