# NotionToRoblox

> **Make Notion the single source of truth for Roblox monetization assets.**  
> Sync Developer Products, Game Passes, and Badges from Notion databases to Roblox via the Open Cloud API.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Rokit](https://img.shields.io/badge/install-Rokit-0078D4?logo=roblox)](https://github.com/rojo-rbx/rokit)

---

## Overview

NotionToRoblox is a CLI that treats Notion databases as the source of truth and synchronizes **Developer Products**, **Game Passes**, and **Badges** to a Roblox universe through the Open Cloud API. Create and update rows in Notion; the tool creates or updates matching Roblox assets and writes results back to Notion.

**Distribution:** Distributed via [Rokit](https://github.com/rojo-rbx/rokit) / [GitHub Releases](https://github.com/Zac134/NotionToRoblox/releases). Not published to npm (`private: true` in `package.json`).

## Requirements

- [Rokit](https://github.com/rojo-rbx/rokit)
- Notion Internal Integration with access to your parent page and databases (see [Notion setup](#notion-setup))
- Roblox Creator Dashboard API Key for your universe (see [Roblox setup](#roblox-setup); required for `sync`, not for `init`)

---

## Quick start

NotionToRoblox is distributed for [Rokit](https://github.com/rojo-rbx/rokit), the toolchain manager for Roblox projects.

```bash
# From your Roblox project root
rokit add Zac134/NotionToRoblox ntn-roblox
rokit install
```

The second argument (`ntn-roblox`) is the command name on `PATH`. Without it, Rokit exposes the tool as `NotionToRoblox`.

Or add it to your project's `rokit.toml`:

```toml
[tools]
ntn-roblox = "Zac134/NotionToRoblox@0.1.0"
```

```bash
rokit install
ntn-roblox sync --help
```

### Setup

```bash
cp .env.example .env
cp ntn-roblox.toml.example ntn-roblox.toml
```

Both files are read from `process.cwd()`, so run `ntn-roblox` from the directory that contains them (typically your Roblox project root).

**When installed via Rokit only** (the release zip contains the binary, not the templates), fetch examples from GitHub:

```bash
curl -fsSLO https://raw.githubusercontent.com/Zac134/NotionToRoblox/v0.1.0/.env.example
curl -fsSLO https://raw.githubusercontent.com/Zac134/NotionToRoblox/v0.1.0/ntn-roblox.toml.example
cp .env.example .env
cp ntn-roblox.toml.example ntn-roblox.toml
```

Replace `v0.1.0` with the release tag you installed via Rokit.

#### First-time workflow

1. Copy the example files (above).
2. Create a Notion integration and set `NOTION_TOKEN` in `.env` (see [Notion setup](#notion-setup)).
3. Pick a **parent page** in Notion (existing page or new empty page) and **share it with the integration**.
4. Run `ntn-roblox init --write-toml`, passing `--parent-page-id=<id>` or setting `notion.parent_page_id` in `ntn-roblox.toml` first. This creates the three databases and writes their IDs into `ntn-roblox.toml`.
5. Complete **Roblox setup** — set `ROBLOX_API_KEY` in `.env` and `roblox.universe_id` in `ntn-roblox.toml`.
6. Run `ntn-roblox sync`.

<a id="notion-setup"></a>
<details open>
<summary><strong>Notion setup — integration, parent page, and databases</strong></summary>

1. **Create an integration** at [notion.so/my-integrations](https://www.notion.so/my-integrations). Choose **Internal** integration.

2. **Copy the Internal Integration Secret** into `.env` as `NOTION_TOKEN`.

3. **Capabilities** (integration settings → Capabilities):
   - **Read content** — required for `sync` (fetch rows from databases)
   - **Update content** — required for `sync` (write back `Roblox ID`, `Sync Status`, `Sync Error`, and `Last Synced At`)
   - **Insert content** — required for `init` (creates the three databases under your parent page)

   For `sync` only, **Insert content** is not required unless you create rows manually outside Notion.

4. **Connect the parent page to the integration:** open the page where databases should live → **⋯** → **Connections** / **Share** → **Invite** → select your integration. `init` verifies it can access this page before creating databases.

5. **Create databases** — choose one:

   **Recommended — `init`**

   ```bash
   # Set parent_page_id in ntn-roblox.toml, or pass --parent-page-id
   ntn-roblox init --write-toml
   ```

   Creates **Developer Products**, **Game Passes**, and **Badges** under the parent page with the schema in [Notion database schema](#notion-database-schema), then writes database IDs into `ntn-roblox.toml` when `--write-toml` is set. Only `NOTION_TOKEN` is required; database IDs may be empty in the TOML beforehand.

   If database IDs are already configured, `init` exits unless you pass `--force` (creates new databases anyway; update or remove stale IDs afterward).

   **Manual — create databases yourself**

   Create three Notion databases (one each for Developer Products, Game Passes, and Badges). Use the exact property names and types in [Notion database schema](#notion-database-schema). At minimum, each database needs:
   - `Name` (title) — required on every row
   - `Sync Status` (select or status — **select recommended**) with options: `Pending`, `Synced`, `Error`, `Skipped`
   - Remaining shared columns: `Description`, `Icon`, `Roblox ID`, `Sync Error`, `Last Synced At`
   - Type-specific columns: `Price` + `Is For Sale` (Developer Product / Game Pass), or `Is Active` (Badge)

   **Tip:** Duplicate one database twice after setting up the shared columns, then add the type-specific columns to each copy.

   Share **each database** with the integration (same **Connections** / **Invite** flow as the parent page). Copy each 32-character hex ID from the database URL (`.../{database_id}?v=...`) into `ntn-roblox.toml`:
   - `notion.dev_product_db_id`
   - `notion.game_pass_db_id`
   - `notion.badge_db_id`

   Hyphens in the URL are optional; paste the ID as shown in Notion.

6. **`Sync Status` options (manual setup):** Add all four options before syncing (as select options or status options). New rows should start as `Pending`. After a successful sync the tool sets `Synced`; failures set `Error` or `Skipped`. (`init` creates these options automatically.)

</details>

<a id="roblox-setup"></a>
<details>
<summary><strong>Roblox setup — API key, universe, and scopes</strong></summary>

1. Open [Creator Dashboard](https://create.roblox.com/) → your experience → **Creator Hub** → **Open Cloud** → **API Keys** (or the workspace-level API Keys page).

2. **Create an API key** with access to the **universe** you want to sync.

3. **Grant scopes** for every resource type you plan to sync (see [Roblox API Key scopes](#roblox-api-key-scopes)):
   - Developer Products: `developer-product:read`, `developer-product:write`
   - Game Passes: `game-pass:read`, `game-pass:write`
   - Badges: `legacy-universe.badge:write`, `legacy-universe.badge:manage-and-spend-robux`, and `legacy-badge:manage` (icon updates)

4. **Copy the API key** into `.env` as `ROBLOX_API_KEY`. Store it securely — it is shown only once.

5. **Universe ID:** from the experience URL or Creator Dashboard, set `roblox.universe_id` in `ntn-roblox.toml`.

6. **Badge free quota:** new badges are created only when the free quota applies. For group-owned universes, set `roblox.badge_payment_source = "group"` in `ntn-roblox.toml`.

</details>

#### Environment variables (`.env`)

| Variable | Required for | Purpose |
| --- | --- | --- |
| `NOTION_TOKEN` | `init`, `sync` | Notion integration internal secret |
| `ROBLOX_API_KEY` | `sync` | Roblox Open Cloud API key |

Do not commit `.env`. Keep database IDs, parent page ID, and universe settings in `ntn-roblox.toml` instead.

#### Configuration (`ntn-roblox.toml`)

**Required for `sync`.** Configuration is read from `ntn-roblox.toml` and `.env`. There are no CLI flags to override TOML values during `sync`. For `init`, `--parent-page-id` can supply `notion.parent_page_id` instead of setting it in the file. Unknown keys are rejected at startup.

See [ntn-roblox.toml.example](./ntn-roblox.toml.example) for a commented template.

| Key | Required for | Default | Purpose |
| --- | --- | --- | --- |
| `notion.parent_page_id` | `init` | — | Parent page where `init` creates databases (32-char hex ID) |
| `notion.dev_product_db_id` | `sync` | — | Notion database ID for Developer Products (`init` may leave empty) |
| `notion.game_pass_db_id` | `sync` | — | Notion database ID for Game Passes (`init` may leave empty) |
| `notion.badge_db_id` | `sync` | — | Notion database ID for Badges (`init` may leave empty) |
| `roblox.universe_id` | `sync` | — | Target universe ID |
| `roblox.badge_payment_source` | No | `user` | Badge create payment source: `user` or `group` (free quota only) |
| `logging.level` | No | `info` | Log level: `debug`, `info`, `warn`, or `error` |

Example `ntn-roblox.toml` (after `init --write-toml`):

```toml
[notion]
parent_page_id    = "your-parent-page-id"
dev_product_db_id = "your-dev-product-database-id"
game_pass_db_id   = "your-game-pass-database-id"
badge_db_id       = "your-badge-database-id"

[roblox]
universe_id = 1234567890
# badge_payment_source = "user"

[logging]
# level = "info"
```

### First sync

```bash
ntn-roblox sync              # full sync (all resource types)
ntn-roblox sync --dry-run    # log planned actions only
ntn-roblox sync --type=badge # one resource type
```

---

<a id="notion-database-schema"></a>
## Notion database schema

Create three databases using the property names and types below. These names are **case-sensitive** and must match exactly.

### Shared properties

| Property | Notion type | Description |
| --- | --- | --- |
| `Name` | title | Required. Maps to Roblox `name`. |
| `Description` | rich_text | Roblox `description`. |
| `Icon` | files | Only the first file is synced. Skips icon update when empty. |
| `Roblox ID` | number | Match key. Written back after a successful Create. |
| `Sync Status` | select **or** status | `Pending` / `Synced` / `Error` / `Skipped`. Both **select** and **status** are supported for read and writeback. **select** is recommended. |
| `Sync Error` | rich_text | Failure or skip reason. Cleared on success. |
| `Last Synced At` | date | Timestamp on successful sync. |

### DeveloperProduct and GamePass only

| Property | Notion type | Description |
| --- | --- | --- |
| `Price` | number | Robux price. Required on Create. |
| `Is For Sale` | checkbox | Maps to `isForSale`. Defaults to `true` when unset. |

### Badge only

| Property | Notion type | Description |
| --- | --- | --- |
| `Is Active` | checkbox | Create: `isActive` / Update: `enabled`. Defaults to `true` when unset. |

---

## Roblox API Key scopes

Grant the following scopes on your API key.

| Resource | Required scopes |
| --- | --- |
| Developer Product | `developer-product:read`, `developer-product:write` |
| Game Pass | `game-pass:read`, `game-pass:write` |
| Badge (create & update) | `legacy-universe.badge:write`, `legacy-universe.badge:manage-and-spend-robux` |
| Badge (icon update) | `legacy-badge:manage` |

Badge listing and free-quota checks use the public `badges.roblox.com` API and do not require an API key.

---

## Use in Roblox projects

Typical layout when using Rokit:

```
my-game/
  .env                  # secrets (gitignored)
  ntn-roblox.toml       # parent page ID, DB IDs, universe_id (safe to commit)
  rokit.toml            # ntn-roblox = "Zac134/NotionToRoblox@0.1.0"
  default.project.json
```

Run `ntn-roblox init` or `ntn-roblox sync` from the project root (where `.env` and `ntn-roblox.toml` live). Add sync to CI or a pre-commit hook to keep Notion authoritative.

---

## CLI

`sync` is the default command when omitted.

### `init`

Create the three Notion databases under a parent page. Requires `NOTION_TOKEN` only.

```bash
ntn-roblox init [--parent-page-id=<id>] [--write-toml] [--force]
```

| Option | Description |
| --- | --- |
| `--parent-page-id=<id>` | Parent page ID (overrides `notion.parent_page_id` in TOML) |
| `--write-toml` | Write created database IDs into `ntn-roblox.toml` |
| `--force` | Create new databases even when database IDs are already configured |
| `--help`, `-h` | Show help |

Share the parent page with your integration before running `init`. Database IDs may be empty in `ntn-roblox.toml` beforehand; they are required before `sync`.

### `sync`

```bash
ntn-roblox sync [--dry-run] [--report-only] [--force] [--type=developer-product|game-pass|badge]
```

| Option | Description |
| --- | --- |
| `--dry-run` | Log planned mutations without writing to Roblox or Notion |
| `--report-only` | List Roblox orphans only; skip create/update |
| `--force` | Include rows with `Sync Status = Synced` in create/update (default: skipped) |
| `--type=<type>` | Limit to one resource type (`developer-product`, `game-pass`, or `badge`) |
| `--help`, `-h` | Show help |

Exit code (`sync`): `1` if any row ends in `Error` or `Skipped`; otherwise `0`.

---

## Sync overview

1. Fetch current Roblox state via List APIs.
2. Report Roblox items not present in Notion to the console (runs in all modes including `--dry-run` and `--report-only`; no Notion writes). Orphan reporting is informational only and does not affect the exit code.
3. Create or update Notion rows whose `Sync Status` is not `Synced` (or all rows when `--force` is set), then write results back to Notion.

Rows with `Sync Status = Synced` are skipped unless `--force` is set. With `--force`, Synced rows are create/update targets: rows without `Roblox ID` are created; rows with `Roblox ID` are updated. Rows with `Roblox ID` set and status `Pending`, `Error`, or `Skipped` are always updated on Roblox.

If Roblox Create succeeds but Notion writeback fails completely, the CLI logs a `CRITICAL` message with the new `robloxId`. Manually set that `Roblox ID` on the Notion page and set `Sync Status` to `Synced` or `Error`.

**Badge free quota:** New badges are created only when the free quota applies (`expectedCost=0`). Paid creation (100 Robux each) is not supported. When quota is 0, creation is skipped with `Skipped` status and retried automatically on the next sync after the daily GMT reset. Set `badge_payment_source = "group"` in `ntn-roblox.toml` for group-owned universes.

---

## Errors

The CLI exits with code `1` when configuration is invalid, mapping fails, or any row ends in `Error` or `Skipped`. Common cases:

- **Missing `ntn-roblox.toml`** — copy from [ntn-roblox.toml.example](./ntn-roblox.toml.example)
- **Missing or invalid secrets** — set `NOTION_TOKEN` in `.env` for `init`; both `NOTION_TOKEN` and `ROBLOX_API_KEY` for `sync`
- **Missing `notion.parent_page_id` on init** — set it in `ntn-roblox.toml` or pass `--parent-page-id`
- **Parent page not shared with integration** — share the page via **Connections** / **Invite** (see [Notion setup](#notion-setup))
- **Database IDs already configured on init** — remove or update stale IDs, or pass `--force`
- **Unknown TOML keys** — the config schema is strict; remove extra keys
- **Invalid `Sync Status` value** — must be one of `Pending`, `Synced`, `Error`, `Skipped`
- **Missing `Price` on Create** — Developer Product and Game Pass rows require a price
- **Badge free quota exhausted** — row is marked `Skipped`; retries after the daily GMT reset
- **Notion permission errors** — for `init`, ensure **Insert content** and parent-page access; for `sync`, ensure **Read content** and **Update content**, and all three databases are shared (see [Notion setup](#notion-setup))
- **Roblox API errors** — verify API key scopes (see [Roblox API Key scopes](#roblox-api-key-scopes))

---

<details>
<summary>Contributing &amp; development (Node.js)</summary>

### Requirements

- Node.js 22+
- npm 10.9.2+

### Setup

```bash
npm install
cp .env.example .env
cp ntn-roblox.toml.example ntn-roblox.toml
# Edit .env and ntn-roblox.toml
```

### Development commands

```bash
npm run build        # tsc
npm run check        # type check
npm run start -- init --help         # init command
npm run start -- sync --help         # run compiled CLI
npm run sync                         # Full sync (no build required)
npm run sync -- --dry-run            # No mutations (planned actions only)
npm run sync -- --report-only        # Orphan report only
npm run sync -- --type=developer-product|game-pass|badge
```

### Project layout

```
ntn-roblox.toml.example  # Non-secret config template (parent page + DB IDs)
src/
  cli.ts              # CLI entry
  env.ts              # .env loader (process.cwd())
  toml.ts             # ntn-roblox.toml loader (process.cwd())
  tomlWrite.ts        # init --write-toml TOML updates
  config.ts           # .env + TOML validation (zod)
  init/               # Notion database bootstrap (init command)
  sync/
    engine.ts         # Sync orchestration
    candidates.ts     # Row action selection
    orphanReport.ts   # Orphan reporting
  notion/
    mapRow.ts         # Notion row mapping
    writeback.ts      # Notion writeback
  roblox/             # Open Cloud & badge API clients
  util/
```

### Building binaries (maintainers)

Release artifacts are standalone Bun-compiled binaries packaged as Rokit-compatible zip files.

**Prerequisites:** [Bun](https://bun.sh) on `PATH`, and `zip` or Python 3

```bash
npm run compile -- 0.1.0 bun-darwin-arm64 ./release
```

| `bun-target` | Zip suffix |
| --- | --- |
| `bun-linux-x64` | `linux-x86_64` |
| `bun-linux-arm64` | `linux-aarch64` |
| `bun-darwin-x64` | `macos-x86_64` |
| `bun-darwin-arm64` | `macos-aarch64` |
| `bun-windows-x64` | `windows-x86_64` |
| `bun-windows-arm64` | `windows-aarch64` |

Output: `NotionToRoblox-<version>-<os>-<arch>.zip` containing a single `NotionToRoblox` (or `NotionToRoblox.exe` on Windows) binary. Rokit installs that binary and links it on `PATH` as `ntn-roblox` when your `rokit.toml` uses the `ntn-roblox` alias.

#### Release checklist

1. Confirm checks pass: `npm run check`
2. Align version strings in `package.json`, README, and the commented consumer example in this repo's `rokit.toml` (the line stays commented here; consumer projects uncomment it in their own `rokit.toml`)
3. Tag and push:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. GitHub Actions builds all six targets and attaches zip assets to the Release
5. Verify from a clean Roblox project:
   ```bash
   rokit add Zac134/NotionToRoblox@0.1.0 ntn-roblox
   rokit install
   ntn-roblox sync --help
   ```

#### Pre-publication checklist (maintainers)

Before making the repository public or cutting the first GitHub Release:

- [ ] Set the GitHub repository visibility to **Public**
- [ ] Confirm no secrets in git history or tracked files (`.env`, API keys, real tokens in examples)
- [ ] Enable **Dependabot** alerts and version updates (see [`.github/dependabot.yml`](./.github/dependabot.yml))
- [ ] Enable **Private vulnerability reporting** (Security → Advisories) — recommended

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

</details>

---

## Security

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/Zac134/NotionToRoblox/security/advisories/new) or a high-level GitHub Issue. **Do not paste secrets** (`NOTION_TOKEN`, `ROBLOX_API_KEY`, `.env` contents) in public reports.

Details: [SECURITY.md](./SECURITY.md)

---

## License

MIT License. See [LICENSE](./LICENSE) for details.
