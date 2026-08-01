import type { NotionRow } from "../types.js";

export type SyncAction = "create" | "update" | "skip";

export interface SyncCandidate {
  row: NotionRow;
  action: SyncAction;
  reason?: string;
}

export type ClassifyMode = "sync" | "update";

export interface ClassifyOptions {
  mode: ClassifyMode;
  robloxIdForTarget?: number | null;
}

export function classifyRow(
  row: NotionRow,
  options: ClassifyOptions,
): SyncCandidate {
  const robloxId =
    options.robloxIdForTarget !== undefined
      ? options.robloxIdForTarget
      : row.robloxId;

  if (options.mode === "sync") {
    if (robloxId === null) {
      return { row, action: "create" };
    }
    return { row, action: "skip", reason: "Roblox ID already set" };
  }

  if (robloxId === null) {
    return { row, action: "skip", reason: "Roblox ID is empty" };
  }
  return { row, action: "update" };
}

export function classifyRows(
  rows: NotionRow[],
  options: ClassifyOptions,
): SyncCandidate[] {
  return rows.map((row) => classifyRow(row, options));
}

export function filterActionable(candidates: SyncCandidate[]): SyncCandidate[] {
  return candidates.filter((candidate) => candidate.action !== "skip");
}
