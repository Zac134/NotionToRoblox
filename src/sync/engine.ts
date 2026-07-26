import { databaseIdForType, queryAllPagesForType } from "../notion/client.js";
import {
  isMappingError,
  mapBadgePage,
  mapDeveloperProductPage,
  mapGamePassPage,
} from "../notion/mapRow.js";
import {
  writebackError,
  writebackRobloxId,
  writebackSkipped,
  writebackSuccess,
} from "../notion/writeback.js";
import { ensureSyncStatusSchemas } from "../notion/schema.js";
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
  FileUpload,
  NotionRow,
  ResourceType,
  RowMappingError,
} from "../types.js";
import { downloadFile } from "../util/download.js";
import { logger } from "../util/logger.js";
import {
  classifyRows,
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

export interface SyncOptions {
  dryRun: boolean;
  reportOnly: boolean;
  force: boolean;
  typeFilter?: ResourceType;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  mappingErrors: number;
  orphans: number;
}

const ALL_TYPES: ResourceType[] = ["developer-product", "game-pass", "badge"];

const TYPE_LABELS: Record<ResourceType, string> = {
  "developer-product": "Developer Product",
  "game-pass": "Game Pass",
  badge: "Badge",
};

interface TypeSyncContext {
  type: ResourceType;
  rows: NotionRow[];
  mappingErrors: RowMappingError[];
  candidates: SyncCandidate[];
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const types = resolveTypes(options.typeFilter);
  await ensureSyncStatusSchemas(types);

  const result: SyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    mappingErrors: 0,
    orphans: 0,
  };

  const orphanSections: OrphanReportSection[] = [];
  const typeContexts: TypeSyncContext[] = [];
  const skipWriteback = options.dryRun || options.reportOnly;

  for (const type of types) {
    logger.info(`Loading ${TYPE_LABELS[type]}...`);

    const { rows, mappingErrors } = await loadNotionRows(type);
    result.mappingErrors += mappingErrors.length;

    for (const mappingError of mappingErrors) {
      await handleMappingError(mappingError, skipWriteback, type);
      result.errors += 1;
    }

    const robloxItems = await listRobloxItemsForOrphans(type);
    const notionIds = collectNotionRobloxIds(rows);
    orphanSections.push({
      type,
      orphans: findOrphans(robloxItems, notionIds),
    });

    typeContexts.push({
      type,
      rows,
      mappingErrors,
      candidates: filterActionable(classifyRows(rows, { force: options.force })),
    });
  }

  result.orphans = countOrphans(orphanSections);
  printOrphanReport(orphanSections);

  if (options.reportOnly) {
    logSummary(result, options);
    return result;
  }

  let badgeQuota: number | undefined;

  for (const context of typeContexts) {
    const { type, candidates } = context;
    logger.info(`Syncing ${TYPE_LABELS[type]}...`);

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
      });

      if (rowResult.outcome === "created") {
        result.created += 1;
      } else if (rowResult.outcome === "updated") {
        result.updated += 1;
      } else if (rowResult.outcome === "skipped") {
        result.skipped += 1;
      } else {
        result.errors += 1;
      }

      if (
        type === "badge" &&
        badgeQuota !== undefined &&
        rowResult.consumedBadgeQuota
      ) {
        badgeQuota -= 1;
      }
    }
  }

  logSummary(result, options);
  return result;
}

function resolveTypes(typeFilter?: ResourceType): ResourceType[] {
  return typeFilter ? [typeFilter] : ALL_TYPES;
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
  }
}

type RowOutcome = "created" | "updated" | "skipped" | "error";

export interface ProcessCandidateResult {
  outcome: RowOutcome;
  consumedBadgeQuota?: boolean;
}

interface ProcessContext {
  dryRun: boolean;
  badgeQuota?: number;
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
      if (!context.dryRun) {
        await writebackSkipped(row.pageId, databaseId, reason);
      }
      return { outcome: "skipped" };
    }

    const message = formatError(error);
    logger.error(`${label}: ${message}`);
    if (!context.dryRun) {
      await writebackError(row.pageId, databaseId, message);
    }
    return { outcome: "error" };
  }
}

async function processCreate(
  row: NotionRow,
  label: string,
  context: ProcessContext,
): Promise<ProcessCandidateResult> {
  const databaseId = databaseIdForType(row.type);
  if (row.type === "badge") {
    const quota = context.badgeQuota ?? 0;
    if (quota <= 0) {
      const reason = "Badge free quota exhausted";
      warnQuotaExhausted(row.name);
      logger.warn(`${label}: ${reason}`);
      if (!context.dryRun) {
        await writebackSkipped(row.pageId, databaseId, reason);
      }
      return { outcome: "skipped" };
    }
  }

  if (row.type !== "badge" && row.price === null) {
    const reason = "Price is required for create";
    logger.error(`${label}: ${reason}`);
    if (!context.dryRun) {
      await writebackError(row.pageId, databaseId, reason);
    }
    return { outcome: "error" };
  }

  const iconHint = row.iconUrl ? "yes" : "no";

  if (context.dryRun) {
    logger.info(`[DRY-RUN] CREATE ${label} (icon=${iconHint})`);
    return { outcome: "created" };
  }

  const icon = await resolveIcon(row.iconUrl);

  const robloxId = await createRobloxItem(row, icon, context.badgeQuota ?? 0);
  const consumedBadgeQuota = row.type === "badge";

  let idWritebackOk = true;
  try {
    await writebackRobloxId(row.pageId, databaseId, robloxId);
  } catch (error) {
    idWritebackOk = false;
    logger.error(
      `${label}: Roblox ID writeback failed (${robloxId}): ${formatError(error)}`,
    );
  }

  let robloxIdPersisted = idWritebackOk;

  try {
    await writebackSuccess(row.pageId, databaseId, robloxId);
    logger.info(`Created ${label} → Roblox ID ${robloxId}`);
    return {
      outcome: "created",
      ...(consumedBadgeQuota ? { consumedBadgeQuota: true } : {}),
    };
  } catch (error) {
    const message = formatError(error);
    logger.error(`${label}: Sync success writeback failed: ${message}`);

    try {
      await writebackError(row.pageId, databaseId, message, robloxId);
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
  if (row.robloxId === null) {
    const reason = "Roblox ID is required for update";
    logger.error(`${label}: ${reason}`);
    if (!context.dryRun) {
      await writebackError(row.pageId, databaseId, reason);
    }
    return { outcome: "error" };
  }

  const iconHint = row.iconUrl ? "yes" : "no";

  if (context.dryRun) {
    logger.info(
      `[DRY-RUN] UPDATE ${label} (Roblox ID ${row.robloxId}, icon=${iconHint})`,
    );
    return { outcome: "updated" };
  }

  const icon = await resolveIcon(row.iconUrl);

  await updateRobloxItem(row, icon);
  await writebackSuccess(row.pageId, databaseId, row.robloxId);
  logger.info(`Updated ${label} (Roblox ID ${row.robloxId})`);
  return { outcome: "updated" };
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
  }
}

async function updateRobloxItem(
  row: NotionRow,
  icon: FileUpload | undefined,
): Promise<void> {
  const robloxId = row.robloxId as number;

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
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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
      : "sync";
  logger.info(`Finished (${mode}): ${parts.join(", ")}`);
}

export function shouldExitWithError(result: SyncResult): boolean {
  return result.errors > 0 || result.skipped > 0;
}
