import type { ResourceType } from "../types.js";

export interface OrphanItem {
  robloxId: number;
  name: string;
  price?: number | null;
  isForSale?: boolean;
  enabled?: boolean;
}

export interface OrphanReportSection {
  type: ResourceType;
  orphans: OrphanItem[];
}

const TYPE_LABELS: Record<ResourceType, string> = {
  "developer-product": "Developer Product",
  "game-pass": "Game Pass",
  badge: "Badge",
  asset: "Asset",
};

export function collectNotionRobloxIds(
  rows: Array<{ robloxId: number | null; robloxIds?: Record<string, number | null> }>,
  targetKey: string | null = null,
): Set<number> {
  const ids = new Set<number>();
  for (const row of rows) {
    if (targetKey !== null && row.robloxIds) {
      const id = row.robloxIds[targetKey];
      if (id !== null && id !== undefined) {
        ids.add(id);
      }
      continue;
    }
    if (row.robloxId !== null) {
      ids.add(row.robloxId);
    }
  }
  return ids;
}

export function findOrphans(
  robloxItems: OrphanItem[],
  notionIds: Set<number>,
): OrphanItem[] {
  return robloxItems
    .filter((item) => !notionIds.has(item.robloxId))
    .sort((a, b) => a.robloxId - b.robloxId);
}

export function countOrphans(sections: OrphanReportSection[]): number {
  return sections.reduce((sum, section) => sum + section.orphans.length, 0);
}

export function printOrphanReport(sections: OrphanReportSection[]): void {
  const filteredSections = sections.filter((section) => section.type !== "asset");
  const totalOrphans = countOrphans(filteredSections);

  console.log("");
  console.log("Roblox items not referenced in Notion");
  console.log(`Total: ${totalOrphans}`);
  console.log("");

  filteredSections.forEach((section, index) => {
    const isLast = index === filteredSections.length - 1;
    const branch = isLast ? "└──" : "├──";
    const childPrefix = isLast ? "    " : "│   ";
    const label = TYPE_LABELS[section.type];

    console.log(`${branch} ${label} (${section.orphans.length})`);

    if (section.orphans.length === 0) {
      console.log(`${childPrefix}└── (none)`);
      console.log("");
      return;
    }

    printSectionTable(section, childPrefix);
    console.log("");
  });

  console.log(
    "Report only / does not by itself set a non-zero exit.",
  );
}

function printSectionTable(section: OrphanReportSection, prefix: string): void {
  const headers =
    section.type === "badge"
      ? (["Roblox ID", "Name", "Enabled"] as const)
      : (["Roblox ID", "Name", "Price", "ForSale"] as const);

  const rows = section.orphans.map((item) =>
    formatOrphanRow(section.type, item),
  );
  const tableLines = renderTable(headers, rows);

  for (const line of tableLines) {
    console.log(`${prefix}${line}`);
  }
}

function formatOrphanRow(type: ResourceType, item: OrphanItem): string[] {
  if (type === "badge") {
    return [String(item.robloxId), item.name, String(item.enabled ?? false)];
  }

  return [
    String(item.robloxId),
    item.name,
    item.price === null || item.price === undefined ? "-" : String(item.price),
    String(item.isForSale ?? false),
  ];
}

function renderTable(headers: readonly string[], rows: string[][]): string[] {
  const colCount = headers.length;
  const colWidths = Array.from({ length: colCount }, (_, index) =>
    Math.max(headers[index].length, ...rows.map((row) => row[index].length)),
  );

  const separator = `┌${colWidths.map((width) => "─".repeat(width + 2)).join("┬")}┐`;
  const middle = `├${colWidths.map((width) => "─".repeat(width + 2)).join("┼")}┤`;
  const bottom = `└${colWidths.map((width) => "─".repeat(width + 2)).join("┴")}┘`;

  const formatRow = (cells: string[]) =>
    `│ ${cells.map((cell, index) => cell.padEnd(colWidths[index])).join(" │ ")} │`;

  const lines = [separator, formatRow([...headers]), middle];
  for (const row of rows) {
    lines.push(formatRow(row));
  }
  lines.push(bottom);
  return lines;
}
