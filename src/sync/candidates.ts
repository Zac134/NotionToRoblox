import type { NotionRow, SyncStatus } from "../types.js";

export type SyncAction = "create" | "update" | "skip";

export interface SyncCandidate {
  row: NotionRow;
  action: SyncAction;
  reason?: string;
}

const UPDATE_STATUSES: SyncStatus[] = ["Pending", "Error", "Skipped"];

export function classifyRow(row: NotionRow): SyncCandidate {
  if (row.syncStatus === "Synced") {
    return { row, action: "skip", reason: "Sync Status is Synced" };
  }

  if (row.robloxId === null) {
    return { row, action: "create" };
  }

  if (UPDATE_STATUSES.includes(row.syncStatus)) {
    return { row, action: "update" };
  }

  return { row, action: "skip", reason: `Unhandled Sync Status: ${row.syncStatus}` };
}

export function classifyRows(rows: NotionRow[]): SyncCandidate[] {
  return rows.map(classifyRow);
}

export function filterActionable(candidates: SyncCandidate[]): SyncCandidate[] {
  return candidates.filter((candidate) => candidate.action !== "skip");
}
