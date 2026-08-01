# NotionToRoblox

> **Make Notion the single source of truth for Roblox monetization assets.**  
> Sync Developer Products, Game Passes, Badges, and free Open Cloud Assets from Notion databases to Roblox.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Rokit](https://img.shields.io/badge/install-Rokit-0078D4?logo=roblox)](https://github.com/rojo-rbx/rokit)

---

## Overview

NotionToRoblox is a CLI that treats Notion databases as the source of truth and synchronizes **Developer Products**, **Game Passes**, **Badges**, and **Assets** (Animation, Audio, Decal, Image, Model) to Roblox through the Open Cloud API. Edit rows in Notion; run `sync` to create missing Roblox items and `update` to push current Notion fields onto existing ones. Results are written back to Notion.

**Distribution:** Distributed via [Rokit](https://github.com/rojo-rbx/rokit) / [GitHub Releases](https://github.com/Zac134/NotionToRoblox/releases). Not published to npm (`private: true` in `package.json`).

## Requirements

- [Rokit](https://github.com/rojo-rbx/rokit)
- Notion Internal Integration with access to your parent page and databases (see [Notion setup](#notion-setup))
- Roblox Creator Dashboard API Key (see [Roblox setup](#roblox-setup); required for `sync` / `update`, not for `init` / `create-db`)

---

## Quick start

```bash
rokit add Zac134/NotionToRoblox ntn-roblox
rokit install
```

Or in `rokit.toml`:

```toml
[tools]
ntn-roblox = "Zac134/NotionToRoblox@0.2.0"
```

```bash
rokit install
ntn-roblox --version
ntn-roblox sync --help
```

### Setup

```bash
ntn-roblox init
```

#### First-time workflow

1. Run `ntn-roblox init`.
2. Set `NOTION_TOKEN` in `.env` (see [Notion setup](#notion-setup)).
3. Share a **parent page** with your integration; set `notion.parent_page_id` in `ntn-roblox.toml`.
4. Configure `[roblox.universes]` **before** `create-db` if using multi-universe (optional).
5. Run `ntn-roblox create-db` — creates four databases and writes IDs to TOML.
6. Set `ROBLOX_API_KEY` in `.env`, `roblox.universe_id` (or `[roblox.universes]`), and `[roblox.asset_creator]` if using Assets.
7. Run `ntn-roblox sync` to create Roblox items; run `ntn-roblox update` after editing Notion rows.

See [Notion setup](#notion-setup) and [Roblox setup](#roblox-setup) for details.

---

<a id="notion-setup"></a>
<details open>
<summary><strong>Notion setup</strong></summary>

1. Create an **Internal** integration at [notion.so/my-integrations](https://www.notion.so/my-integrations).
2. Set `NOTION_TOKEN` in `.env`.
3. **Capabilities:** Read content, Update content (sync/update); Insert content (`create-db`).
4. Share the parent page and each database with the integration.
5. Run `ntn-roblox create-db` (recommended) or create databases manually per [Notion database schema](#notion-database-schema).

</details>

<a id="roblox-setup"></a>
<details>
<summary><strong>Roblox setup</strong></summary>

1. Create an API key with scopes for resources you sync (see [Roblox API Key scopes](#roblox-api-key-scopes)).
2. Set `ROBLOX_API_KEY` in `.env`.
3. Set `roblox.universe_id` or `[roblox.universes]` for Dev Products / Game Passes / Badges.
4. Set `[roblox.asset_creator]` for Assets (`is_group` + `id` — user or group upload target).
5. For group-owned badges: `roblox.badge_payment_source = "group"`.

</details>

#### Configuration (`ntn-roblox.toml`)

| Key | Required for | Purpose |
| --- | --- | --- |
| `notion.parent_page_id` | `create-db` | Parent page for database creation |
| `notion.is_inline` | `create-db` | Inline DBs on parent (default `true`) |
| `notion.dev_product_db_id` | `sync`, `update` | Developer Products database ID |
| `notion.game_pass_db_id` | `sync`, `update` | Game Passes database ID |
| `notion.badge_db_id` | `sync`, `update` | Badges database ID |
| `notion.asset_db_id` | `sync`, `update` | Assets database ID |
| `roblox.universe_id` | `sync`, `update` | Single universe (monetization types) |
| `roblox.universes` | `sync`, `update` | Multi-universe map (alternative to `universe_id`) |
| `roblox.asset_creator` | Assets | `is_group` + `id` for upload ownership |
| `roblox.badge_payment_source` | Badges | `user` or `group` (free quota) |
| `logging.level` | No | `debug` / `info` / `warn` / `error` |

Example:

```toml
[notion]
parent_page_id    = "your-parent-page-id"
dev_product_db_id = "..."
game_pass_db_id   = "..."
badge_db_id       = "..."
asset_db_id       = "..."

[roblox]
universe_id = 1234567890

[roblox.asset_creator]
is_group = false
id = 123456789

[logging]
# level = "info"
```

---

<a id="notion-database-schema"></a>
## Notion database schema

Property names are **case-sensitive**. Extra columns are ignored — you may add your own properties freely.

### Shared (Developer Products, Game Passes, Badges)

| Property | Type | Description |
| --- | --- | --- |
| `Name` | title | Required |
| `Description` | rich_text | Roblox description |
| `Icon` | files | First file only (Dev Product / Game Pass / Badge) |
| `Roblox ID` | number | Single-universe mode |
| `Roblox ID (Key)` | number | Multi-universe: one column per TOML key |
| `Sync Status` | select | `Pending` / `Synced` / `Error` / `Skipped` |
| `Sync Error` | rich_text | Cleared on success |
| `Last Synced At` | date | Success timestamp |

Create vs update is decided by whether the Roblox ID column is set, **not** by Sync Status.

### Assets database

| Property | Type | Description |
| --- | --- | --- |
| `Name` | title | Roblox `displayName` |
| `File` | files | Upload file (first attachment). **Create only** |
| `Asset Type` | select | `Animation`, `Audio`, `Decal`, `Image`, `Model` |
| `Roblox ID` | number | Always single column (even in multi-universe) |
| `Description` | rich_text | Optional; empty sends `""` |
| `Sync Status` / `Sync Error` / `Last Synced At` | — | Same as above |

**Not supported:** Video (paid), Mesh (Roblox-delivery only).

---

## Roblox API Key scopes

| Resource | Scopes |
| --- | --- |
| Developer Product | `developer-product:read`, `developer-product:write` |
| Game Pass | `game-pass:read`, `game-pass:write` |
| Badge | `legacy-universe.badge:write`, `legacy-universe.badge:manage-and-spend-robux`, `legacy-badge:manage` |
| Assets | `asset:read`, `asset:write` |

---

## CLI

Global options (all commands): `--help`, `-h`, `--version`, `-V`

### `sync` (default)

Create Roblox items for rows **without** a Roblox ID.

```bash
ntn-roblox sync [--dry-run] [--report-only] [--type=...] [--target=Key]
```

| Option | Description |
| --- | --- |
| `--dry-run` | Log planned creates only |
| `--report-only` | Orphan report only (monetization types) |
| `--type=<type>` | `developer-product`, `game-pass`, `badge`, or `asset` |
| `--target=<Key>` | One universe (requires `[roblox.universes]`) |

### `update`

Push current Notion fields to **existing** Roblox items (ID set).

```bash
ntn-roblox update [--dry-run] [--type=...] [--target=Key]
```

Assets: metadata only (`Name`, `Description`). `File` is ignored on update.

### `create-db`

Creates four Notion databases. Alias: `create-databases`.

```bash
ntn-roblox create-db [--parent-page-id=<id>] [--force]
```

---

## Multi-universe

```toml
[roblox.universes]
Prod = 111111111
Dev  = 222222222
```

- Dev Product / Game Pass / Badge: `Roblox ID (Prod)` etc.; `--target=Prod` limits scope.
- **Assets:** single `Roblox ID` column; creator-scoped, not per-universe.

---

## Assets

Upload free asset types via Open Cloud Assets API. Configure `[roblox.asset_creator]`:

```toml
[roblox.asset_creator]
is_group = true   # true = groupId, false = userId
id = 987654321
```

| Asset Type | Upload | Update content |
| --- | --- | --- |
| Decal, Image, Audio, Animation, Model | ✅ | Metadata only (`update`) |

Video (2000 Robux) and Mesh are excluded.

---

## Migrating from 0.1.x

- `sync --force` removed — use `update` to push changes to existing items.
- `sync` creates only; `update` updates only.
- Add `asset_db_id` and `asset_creator` for Assets.
- Multi-universe: switch from `universe_id` to `[roblox.universes]` and rename ID columns.

---

## Errors

Exit code `1` on config errors, mapping failures, or any row ending in `Error` / `Skipped`.

---

<details>
<summary>Contributing &amp; development</summary>

```bash
npm install
npm run check
npm test
npm run sync -- --dry-run
npm run update -- --dry-run
```

Release: `npm run compile -- 0.2.0 bun-darwin-arm64 ./release`

</details>

---

## License

MIT — see [LICENSE](./LICENSE).
