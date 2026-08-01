import {
  isMultiUniverseMode,
  resolveSyncTargets,
  setActiveUniverse,
} from "../config.js";
import { databaseIdForType, queryAllPagesForType } from "../notion/client.js";
import {
  isMappingError,
  mapAssetPage,
  mapBadgePage,
  mapDeveloperProductPage,
  mapGamePassPage,
} from "../notion/mapRow.js";
import {
  aggregateTargetResults,
  writebackAggregatedTargetResults,
  writebackError,
  writebackRobloxId,
  writebackSkipped,
  writebackSuccess,
  type TargetResult,
} from "../notion/writeback.js";
import { ensureSyncStatusSchemas } from "../notion/schema.js";
import { createAsset, updateAssetMetadata } from "../roblox/assets.js";
import { RobloxHttpError } from "../roblox/http.js";
import {
  BadgeQuotaExhaustedError,
  createBadge,
  getFreeBadgeQuota,
  listBadges,
  updateBadge,
  warnQuotaExhausted,
} from "../roblox/badges.js";
import {
  createDeveloperProduct,
  getDeveloperProductPrice,
  listDeveloperProducts,
  updateDeveloperProduct,
} from "../roblox/developerProducts.js";
import {
  createGamePass,
  getGamePassPrice,
  listGamePasses,
  updateGamePass,
} from "../roblox/gamePasses.js";
import type {
  AssetRow,
  FileUpload,
  NotionRow,
  ResourceType,
  RowMappingError,
} from "../types.js";
import {
  downloadFile,
  MAX_ASSET_DOWNLOAD_BYTES,
} from "../util/download.js";
import { logger } from "../util/logger.js";
import { sanitizeErrorMessage } from "../util/sanitizeError.js";
import {
  classifyRow,
  filterActionable,
  type SyncCandidate,
} from "./candidates.js";
import {
  collectNotionRobloxIds,
  countOrphans,
  findOrphans,
  printOrphanReport,
  type OrphanItem,
  type OrphanReportSection,
} from "./orphanReport.js";
import { getRobloxIdForTarget } from "./robloxIds.js";

export interface SyncOptions {
  mode: "sync" | "update";
  dryRun: boolean;
  reportOnly: boolean;
  typeFilter?: ResourceType;
  targetFilter?: string;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  mappingErrors: number;
  orphans: number;
}

const ALL_TYPES: ResourceType[] = [
  "developer-product",
  "game-pass",
  "badge",
  "asset",
];

const MONETIZATION_TYPES: ResourceType[] = [
  "developer-product",
  "game-pass",
  "badge",
];

const TYPE_LABELS: Record<ResourceType, string> = {
  "developer-product": "Developer Product",
  "game-pass": "Game Pass",
  badge: "Badge",
  asset: "Asset",
};

interface TypeSyncContext {
  type: ResourceType;
  rows: NotionRow[];
  mappingErrors: RowMappingError[];
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const types = resolveTypes(options.typeFilter);
  await ensureSyncStatusSchemas(types);

  const targets = resolveSyncTargets(options.targetFilter);
  const skipWriteback = options.dryRun || options.reportOnly;

  const result: SyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    mappingErrors: 0,
    orphans: 0,
  };

  const orphanSections: OrphanReportSection[] = [];
  const monetizationContexts: TypeSyncContext[] = [];
  let assetContext: TypeSyncContext | undefined;

  for (const type of types) {
    logger.info(`Loading ${TYPE_LABELS[type]}...`);

    const { rows, mappingErrors } = await loadNotionRows(type);
    result.mappingErrors += mappingErrors.length;

    for (const mappingError of mappingErrors) {
      await handleMappingError(mappingError, skipWriteback, type);
      result.errors += 1;
    }

    if (type === "asset") {
      assetContext = { type, rows, mappingErrors };
      continue;
    }

    for (const target of targets) {
      setActiveUniverse(target.key);

      const robloxItems = await listRobloxItemsForOrphans(type);
      const notionIds = collectNotionRobloxIds(rows, target.key);
      orphanSections.push({
        type,
        orphans: findOrphans(robloxItems, notionIds),
      });
    }

    monetizationContexts.push({ type, rows, mappingErrors });
  }

  result.orphans = countOrphans(orphanSections);
  printOrphanReport(orphanSections);

  if (options.reportOnly) {
    logSummary(result, options);
    return result;
  }

  let badgeQuota: number | undefined;

  for (const context of monetizationContexts) {
    const { type, rows } = context;
    logger.info(`Syncing ${TYPE_LABELS[type]}...`);

    if (isMultiUniverseMode()) {
      const rowResults = new Map<string, TargetResult[]>();

      for (const target of targets) {
        setActiveUniverse(target.key);

        const candidates = buildCandidates(rows, options.mode, target.key);
        if (candidates.length === 0) {
          continue;
        }

        if (type === "badge" && badgeQuota === undefined) {
          badgeQuota = await getFreeBadgeQuota();
          logger.info(`Badge free quota remaining: ${badgeQuota}`);
        }

        for (const candidate of candidates) {
          const rowResult = await processCandidate(candidate, {
            dryRun: options.dryRun,
            badgeQuota,
            targetKey: target.key,
            deferWriteback: true,
          });

          applyRowResult(result, rowResult);

          if (
            type === "badge" &&
            badgeQuota !== undefined &&
            rowResult.consumedBadgeQuota
          ) {
            badgeQuota -= 1;
          }

          const targetOutcome = toTargetResult(
            target.key,
            rowResult,
            candidate.reason,
          );
          const existing = rowResults.get(candidate.row.pageId) ?? [];
          existing.push(targetOutcome);
          rowResults.set(candidate.row.pageId, existing);
        }
      }

      if (!options.dryRun) {
        for (const [pageId, targetResults] of rowResults) {
          const aggregated = aggregateTargetResults(targetResults);
          await writebackAggregatedTargetResults(
            pageId,
            databaseIdForType(type),
            aggregated,
          );
        }
      }
    } else {
      const target = targets[0]!;
      setActiveUniverse(target.key);

      const candidates = buildCandidates(rows, options.mode, target.key);
      if (candidates.length === 0) {
        logger.info(`No actionable rows for ${TYPE_LABELS[type]}`);
        continue;
      }

      if (type === "badge" && badgeQuota === undefined) {
        badgeQuota = await getFreeBadgeQuota();
        logger.info(`Badge free quota remaining: ${badgeQuota}`);
      }

      for (const candidate of candidates) {
        const rowResult = await processCandidate(candidate, {
          dryRun: options.dryRun,
          badgeQuota,
          targetKey: target.key,
        });

        applyRowResult(result, rowResult);

        if (
          type === "badge" &&
          badgeQuota !== undefined &&
          rowResult.consumedBadgeQuota
        ) {
          badgeQuota -= 1;
        }
      }
    }
  }

  if (assetContext && types.includes("asset")) {
    logger.info(`Syncing ${TYPE_LABELS.asset}...`);
    const candidates = buildCandidates(assetContext.rows, options.mode, null);

    if (candidates.length === 0) {
      logger.info(`No actionable rows for ${TYPE_LABELS.asset}`);
    } else {
      for (const candidate of candidates) {
        const rowResult = await processCandidate(candidate, {
          dryRun: options.dryRun,
          targetKey: null,
        });
        applyRowResult(result, rowResult);
      }
    }
  }

  logSummary(result, options);
  return result;
}

function buildCandidates(
  rows: NotionRow[],
  mode: SyncOptions["mode"],
  targetKey: string | null,
): SyncCandidate[] {
  return filterActionable(
    rows.map((row) =>
      classifyRow(row, {
        mode,
        robloxIdForTarget: getRobloxIdForTarget(row, targetKey),
      }),
    ),
  );
}

function toTargetResult(
  targetKey: string | null,
  rowResult: ProcessCandidateResult,
  skipReason?: string,
): TargetResult {
  if (rowResult.outcome === "created") {
    return {
      targetKey,
      outcome: "created",
      robloxId: rowResult.robloxId,
    };
  }
  if (rowResult.outcome === "updated") {
    return {
      targetKey,
      outcome: "updated",
      robloxId: rowResult.robloxId,
    };
  }
  if (rowResult.outcome === "skipped") {
    return {
      targetKey,
      outcome: "skipped",
      message: rowResult.message ?? skipReason,
    };
  }
  return {
    targetKey,
    outcome: "error",
    message: rowResult.message,
    robloxId: rowResult.robloxId,
  };
}

function applyRowResult(result: SyncResult, rowResult: ProcessCandidateResult): void {
  if (rowResult.outcome === "created") {
    result.created += 1;
  } else if (rowResult.outcome === "updated") {
    result.updated += 1;
  } else if (rowResult.outcome === "skipped") {
    result.skipped += 1;
  } else {
    result.errors += 1;
  }
}

function resolveTypes(typeFilter?: ResourceType): ResourceType[] {
  if (typeFilter) {
    return [typeFilter];
  }
  return ALL_TYPES;
}

async function loadNotionRows(type: ResourceType): Promise<{
  rows: NotionRow[];
  mappingErrors: RowMappingError[];
}> {
  const pages = await queryAllPagesForType(type);
  const rows: NotionRow[] = [];
  const mappingErrors: RowMappingError[] = [];

  for (const page of pages) {
    const mapped = mapPage(type, page);
    if (isMappingError(mapped)) {
      mappingErrors.push(mapped);
    } else {
      rows.push(mapped);
    }
  }

  return { rows, mappingErrors };
}

function mapPage(
  type: ResourceType,
  page: Parameters<typeof mapDeveloperProductPage>[0],
): NotionRow | RowMappingError {
  switch (type) {
    case "developer-product":
      return mapDeveloperProductPage(page);
    case "game-pass":
      return mapGamePassPage(page);
    case "badge":
      return mapBadgePage(page);
    case "asset":
      return mapAssetPage(page);
  }
}

async function listRobloxItemsForOrphans(
  type: ResourceType,
): Promise<OrphanItem[]> {
  switch (type) {
    case "developer-product":
      return (await listDeveloperProducts()).map((item) => ({
        robloxId: item.productId,
        name: item.name,
        price: getDeveloperProductPrice(item),
        isForSale: item.isForSale,
      }));
    case "game-pass":
      return (await listGamePasses()).map((item) => ({
        robloxId: item.gamePassId,
        name: item.name,
        price: getGamePassPrice(item),
        isForSale: item.isForSale,
      }));
    case "badge":
      return (await listBadges()).map((item) => ({
        robloxId: item.id,
        name: item.name,
        enabled: item.enabled,
      }));
    case "asset":
      return [];
  }
}

type RowOutcome = "created" | "updated" | "skipped" | "error";

export interface ProcessCandidateResult {
  outcome: RowOutcome;
  consumedBadgeQuota?: boolean;
  robloxId?: number;
  message?: string;
}

interface ProcessContext {
  dryRun: boolean;
  badgeQuota?: number;
  targetKey: string | null;
  deferWriteback?: boolean;
}

export async function processCandidate(
  candidate: SyncCandidate,
  context: ProcessContext,
): Promise<ProcessCandidateResult> {
  const { row } = candidate;
  const label = `${TYPE_LABELS[row.type]} "${row.name}" (${row.pageId})`;
  const databaseId = databaseIdForType(row.type);

  try {
    if (candidate.action === "create") {
      return await processCreate(row, label, context);
    }
    return await processUpdate(row, label, context);
  } catch (error) {
    if (error instanceof BadgeQuotaExhaustedError) {
      const reason = error.message;
      warnQuotaExhausted(row.name);
      logger.warn(`${label}: ${reason}`);
      if (!context.dryRun && !context.deferWriteback) {
        await writebackSkipped(row.pageId, databaseId, reason);
      }
      return { outcome: "skipped", message: reason };
    }

    const message = formatError(error);
    logger.error(`${label}: ${message}`);
    if (!context.dryRun && !context.deferWriteback) {
      await writebackError(
        row.pageId,
        databaseId,
        message,
        undefined,
        context.targetKey,
      );
    }
    return { outcome: "error", message };
  }
}

async function processCreate(
  row: NotionRow,
  label: string,
  context: ProcessContext,
): Promise<ProcessCandidateResult> {
  const databaseId = databaseIdForType(row.type);

  if (row.type === "asset" && !row.fileUrl) {
    const reason = "File is required for asset create";
    logger.error(`${label}: ${reason}`);
    if (!context.dryRun && !context.deferWriteback) {
      await writebackError(row.pageId, databaseId, reason);
    }
    return { outcome: "error", message: reason };
  }

  if (row.type === "badge") {
    const quota = context.badgeQuota ?? 0;
    if (quota <= 0) {
      const reason = "Badge free quota exhausted";
      warnQuotaExhausted(row.name);
      logger.warn(`${label}: ${reason}`);
      if (!context.dryRun && !context.deferWriteback) {
        await writebackSkipped(row.pageId, databaseId, reason);
      }
      return { outcome: "skipped", message: reason };
    }
  }

  if (
    row.type !== "badge" &&
    row.type !== "asset" &&
    row.price === null
  ) {
    const reason = "Price is required for create";
    logger.error(`${label}: ${reason}`);
    if (!context.dryRun && !context.deferWriteback) {
      await writebackError(
        row.pageId,
        databaseId,
        reason,
        undefined,
        context.targetKey,
      );
    }
    return { outcome: "error", message: reason };
  }

  const iconHint = row.type === "asset" ? "n/a" : row.iconUrl ? "yes" : "no";

  if (context.dryRun) {
    logger.info(`[DRY-RUN] CREATE ${label} (icon=${iconHint})`);
    return { outcome: "created" };
  }

  const icon =
    row.type === "asset" ? undefined : await resolveIcon(row.iconUrl);

  const robloxId = await createRobloxItem(row, icon, context.badgeQuota ?? 0);
  const consumedBadgeQuota = row.type === "badge";

  if (context.deferWriteback) {
    logger.info(`Created ${label} → Roblox ID ${robloxId}`);
    return {
      outcome: "created",
      robloxId,
      ...(consumedBadgeQuota ? { consumedBadgeQuota: true } : {}),
    };
  }

  let idWritebackOk = true;
  try {
    await writebackRobloxId(
      row.pageId,
      databaseId,
      robloxId,
      context.targetKey,
    );
  } catch (error) {
    idWritebackOk = false;
    logger.error(
      `${label}: Roblox ID writeback failed (${robloxId}): ${formatError(error)}`,
    );
  }

  let robloxIdPersisted = idWritebackOk;

  try {
    await writebackSuccess(
      row.pageId,
      databaseId,
      robloxId,
      context.targetKey,
    );
    logger.info(`Created ${label} → Roblox ID ${robloxId}`);
    return {
      outcome: "created",
      robloxId,
      ...(consumedBadgeQuota ? { consumedBadgeQuota: true } : {}),
    };
  } catch (error) {
    const message = formatError(error);
    logger.error(`${label}: Sync success writeback failed: ${message}`);

    try {
      await writebackError(
        row.pageId,
        databaseId,
        message,
        robloxId,
        context.targetKey,
      );
      robloxIdPersisted = true;
    } catch (writebackErr) {
      logger.error(
        `${label}: Error writeback failed: ${formatError(writebackErr)}`,
      );
    }

    if (!robloxIdPersisted) {
      logger.error(
        `CRITICAL: Roblox item created but Notion writeback completely failed. ` +
          `pageId=${row.pageId} robloxId=${robloxId}. ` +
          `Manually set Roblox ID ${robloxId} on the Notion page and set Sync Status to Synced or Error.`,
      );
    }

    return {
      outcome: "error",
      message,
      robloxId,
      ...(consumedBadgeQuota ? { consumedBadgeQuota: true } : {}),
    };
  }
}

async function processUpdate(
  row: NotionRow,
  label: string,
  context: ProcessContext,
): Promise<ProcessCandidateResult> {
  const databaseId = databaseIdForType(row.type);
  const robloxId = getRobloxIdForTarget(row, context.targetKey);

  if (robloxId === null) {
    const reason = "Roblox ID is required for update";
    logger.error(`${label}: ${reason}`);
    if (!context.dryRun && !context.deferWriteback) {
      await writebackError(
        row.pageId,
        databaseId,
        reason,
        undefined,
        context.targetKey,
      );
    }
    return { outcome: "error", message: reason };
  }

  const iconHint = row.type === "asset" ? "n/a" : row.iconUrl ? "yes" : "no";

  if (context.dryRun) {
    logger.info(
      `[DRY-RUN] UPDATE ${label} (Roblox ID ${robloxId}, icon=${iconHint})`,
    );
    return { outcome: "updated", robloxId };
  }

  const icon =
    row.type === "asset" ? undefined : await resolveIcon(row.iconUrl);

  await updateRobloxItem(row, icon, robloxId);

  if (context.deferWriteback) {
    logger.info(`Updated ${label} (Roblox ID ${robloxId})`);
    return { outcome: "updated", robloxId };
  }

  await writebackSuccess(
    row.pageId,
    databaseId,
    robloxId,
    context.targetKey,
  );
  logger.info(`Updated ${label} (Roblox ID ${robloxId})`);
  return { outcome: "updated", robloxId };
}

async function createRobloxItem(
  row: NotionRow,
  icon: FileUpload | undefined,
  badgeQuota: number,
): Promise<number> {
  switch (row.type) {
    case "developer-product":
      return createDeveloperProduct({
        name: row.name,
        description: row.description || undefined,
        price: row.price as number,
        isForSale: row.isForSale,
        icon,
      });
    case "game-pass":
      return createGamePass({
        name: row.name,
        description: row.description || undefined,
        price: row.price as number,
        isForSale: row.isForSale,
        icon,
      });
    case "badge":
      return createBadge(
        {
          name: row.name,
          description: row.description || undefined,
          isActive: row.isActive,
          icon,
        },
        badgeQuota,
      );
    case "asset":
      return createAssetFromRow(row);
  }
}

async function createAssetFromRow(row: AssetRow): Promise<number> {
  const file = await downloadFile(
    row.fileUrl as string,
    undefined,
    MAX_ASSET_DOWNLOAD_BYTES,
  );
  return createAsset({
    assetType: row.assetType,
    displayName: row.name,
    description: row.description,
    file,
  });
}

async function updateRobloxItem(
  row: NotionRow,
  icon: FileUpload | undefined,
  robloxId: number,
): Promise<void> {
  switch (row.type) {
    case "developer-product":
      await updateDeveloperProduct(robloxId, {
        name: row.name,
        description: row.description,
        price: row.price ?? undefined,
        isForSale: row.isForSale,
        icon,
      });
      return;
    case "game-pass":
      await updateGamePass(robloxId, {
        name: row.name,
        description: row.description,
        price: row.price ?? undefined,
        isForSale: row.isForSale,
        icon,
      });
      return;
    case "badge":
      await updateBadge(robloxId, {
        name: row.name,
        description: row.description,
        enabled: row.isActive,
        icon,
      });
      return;
    case "asset":
      await updateAssetMetadata(robloxId, {
        displayName: row.name,
        description: row.description,
      });
      return;
  }
}

async function resolveIcon(
  iconUrl: string | null,
): Promise<FileUpload | undefined> {
  if (!iconUrl) {
    return undefined;
  }
  return downloadFile(iconUrl);
}

async function handleMappingError(
  error: RowMappingError,
  skipWriteback: boolean,
  type: ResourceType,
): Promise<void> {
  logger.error(`Mapping error for page ${error.pageId}: ${error.message}`);
  if (!skipWriteback) {
    await writebackError(
      error.pageId,
      databaseIdForType(type),
      error.message,
    );
  }
}

function formatError(error: unknown): string {
  if (error instanceof RobloxHttpError) {
    return error.message;
  }
  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message);
  }
  return sanitizeErrorMessage(String(error));
}

function logSummary(result: SyncResult, options: SyncOptions): void {
  const parts = [
    `created=${result.created}`,
    `updated=${result.updated}`,
    `skipped=${result.skipped}`,
    `errors=${result.errors}`,
    `orphans=${result.orphans}`,
  ];

  if (result.mappingErrors > 0) {
    parts.push(`mappingErrors=${result.mappingErrors}`);
  }

  const mode = options.reportOnly
    ? "report-only"
    : options.dryRun
      ? "dry-run"
      : options.mode;
  logger.info(`Finished (${mode}): ${parts.join(", ")}`);
}

export function shouldExitWithError(result: SyncResult): boolean {
  return result.errors > 0 || result.skipped > 0;
}

export { MONETIZATION_TYPES };
