import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, TomlError } from "smol-toml";

export function loadTomlFile(
  path = resolve(process.cwd(), "ntn-roblox.toml"),
): unknown {
  let content: string;

  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(
        `Missing config file: ${path} (run \`ntn-roblox init\` or copy ntn-roblox.toml.example)`,
      );
    }

    throw error;
  }

  try {
    return parse(content);
  } catch (error) {
    if (error instanceof TomlError) {
      throw new Error(`Invalid TOML in ${path}: ${error.message}`);
    }

    throw error;
  }
}
