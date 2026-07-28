import { Client } from "@notionhq/client";
import type {
  PageObjectResponse,
  QueryDatabaseParameters,
} from "@notionhq/client/build/src/api-endpoints.js";
import { getConfig } from "../config.js";
import type { ResourceType } from "../types.js";
import { notionRateLimiter } from "../util/rateLimit.js";

let cachedClient: Client | null = null;

export function getNotionClient(): Client {
  if (!cachedClient) {
    cachedClient = new Client({ auth: getConfig().NOTION_TOKEN });
  }
  return cachedClient;
}

export function databaseIdForType(type: ResourceType): string {
  switch (type) {
    case "developer-product":
      return getConfig().NOTION_DEVPRODUCT_DB_ID;
    case "game-pass":
      return getConfig().NOTION_GAMEPASS_DB_ID;
    case "badge":
      return getConfig().NOTION_BADGE_DB_ID;
  }
}

export async function queryAllPages(
  databaseId: string,
): Promise<PageObjectResponse[]> {
  const client = getNotionClient();
  const pages: PageObjectResponse[] = [];
  let startCursor: string | undefined;

  do {
    const params: QueryDatabaseParameters = {
      database_id: databaseId,
      page_size: 100,
      start_cursor: startCursor,
    };

    const response = await notionRateLimiter.schedule(() =>
      client.databases.query(params),
    );

    for (const result of response.results) {
      if (result.object === "page" && "properties" in result) {
        pages.push(result as PageObjectResponse);
      }
    }

    startCursor = response.has_more
      ? (response.next_cursor ?? undefined)
      : undefined;
  } while (startCursor);

  return pages;
}

export async function queryAllPagesForType(
  type: ResourceType,
): Promise<PageObjectResponse[]> {
  return queryAllPages(databaseIdForType(type));
}
