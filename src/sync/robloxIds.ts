import type { NotionRowBase } from "../types.js";

export function getRobloxIdForTarget(
  row: NotionRowBase,
  targetKey: string | null,
): number | null {
  if (targetKey === null) {
    return row.robloxId;
  }
  return row.robloxIds?.[targetKey] ?? null;
}

export function collectRobloxIdsForTarget(
  rows: NotionRowBase[],
  targetKey: string | null,
): Set<number> {
  const ids = new Set<number>();
  for (const row of rows) {
    const id = getRobloxIdForTarget(row, targetKey);
    if (id !== null) {
      ids.add(id);
    }
  }
  return ids;
}
