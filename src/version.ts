declare const NTN_ROBLOX_VERSION: string | undefined;

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let VERSION = "0.0.0-dev";

if (typeof NTN_ROBLOX_VERSION === "string" && NTN_ROBLOX_VERSION.length > 0) {
  VERSION = NTN_ROBLOX_VERSION;
} else {
  try {
    VERSION = require("../package.json").version;
  } catch {
    // keep fallback
  }
}

export { VERSION };
