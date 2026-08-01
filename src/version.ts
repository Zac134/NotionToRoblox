import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let VERSION = "0.0.0-dev";
try {
  VERSION = require("../package.json").version;
} catch {
  // keep fallback
}

export { VERSION };
