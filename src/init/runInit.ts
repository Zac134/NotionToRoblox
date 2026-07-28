import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ENV_TEMPLATE, TOML_TEMPLATE } from "./templates.js";

export interface RunInitOptions {
  force: boolean;
  cwd?: string;
}

export interface InitFileResult {
  path: string;
  status: "created" | "skipped" | "overwritten";
}

export interface RunInitResult {
  files: InitFileResult[];
}

const TARGET_FILES = [
  { relativePath: ".env", contents: ENV_TEMPLATE },
  { relativePath: "ntn-roblox.toml", contents: TOML_TEMPLATE },
] as const;

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function runInit(
  options: RunInitOptions,
): Promise<RunInitResult> {
  const cwd = options.cwd ?? process.cwd();
  const files: InitFileResult[] = [];

  for (const target of TARGET_FILES) {
    const path = resolve(cwd, target.relativePath);
    const exists = await pathExists(path);

    if (exists && !options.force) {
      files.push({ path, status: "skipped" });
      console.log(`Skipped ${path} (already exists; pass --force to overwrite)`);
      continue;
    }

    await writeFile(path, target.contents, "utf8");
    const status = exists ? "overwritten" : "created";
    files.push({ path, status });
    console.log(
      exists ? `Overwrote ${path}` : `Created ${path}`,
    );
  }

  const createdOrOverwritten = files.filter((f) => f.status !== "skipped");
  if (createdOrOverwritten.length > 0) {
    console.log(
      "\nNext steps:\n" +
        "  1. Fill NOTION_TOKEN (and ROBLOX_API_KEY) in .env\n" +
        "  2. Set notion.parent_page_id and roblox.universe_id in ntn-roblox.toml\n" +
        "  3. Share the parent page with your Notion integration\n" +
        "  4. Run: ntn-roblox create-databases",
    );
  }

  return { files };
}
