export type NotionDatabaseIds = {
  devProductDbId: string;
  gamePassDbId: string;
  badgeDbId: string;
};

const NOTION_DB_KEYS: Array<{
  field: keyof NotionDatabaseIds;
  tomlKey: string;
}> = [
  { field: "devProductDbId", tomlKey: "dev_product_db_id" },
  { field: "gamePassDbId", tomlKey: "game_pass_db_id" },
  { field: "badgeDbId", tomlKey: "badge_db_id" },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatTomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function keyLinePattern(tomlKey: string): RegExp {
  return new RegExp(
    `^(\\s*${escapeRegExp(tomlKey)}\\s*=\\s*)"(?:[^"\\\\]|\\\\.)*"(.*)$`,
    "m",
  );
}

function notionSectionPattern(): RegExp {
  return /^\s*\[notion\]\s*$/m;
}

export function updateNotionDatabaseIdsInToml(
  content: string,
  ids: NotionDatabaseIds,
): string {
  let result = content;
  const missingLines: string[] = [];

  for (const { field, tomlKey } of NOTION_DB_KEYS) {
    const pattern = keyLinePattern(tomlKey);
    const formattedValue = formatTomlString(ids[field]);

    if (pattern.test(result)) {
      result = result.replace(pattern, `$1${formattedValue}$2`);
      continue;
    }

    missingLines.push(`${tomlKey} = ${formattedValue}`);
  }

  if (missingLines.length === 0) {
    return result;
  }

  const notionMatch = result.match(notionSectionPattern());
  if (!notionMatch || notionMatch.index === undefined) {
    throw new Error("Missing [notion] section in TOML content");
  }

  const insertAt = notionMatch.index + notionMatch[0].length;
  const insertion = `\n${missingLines.join("\n")}`;

  return `${result.slice(0, insertAt)}${insertion}${result.slice(insertAt)}`;
}
