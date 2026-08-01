import type { Client } from "@notionhq/client";
import type {
  CreateDatabaseParameters,
  DatabaseObjectResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import { notionRateLimiter } from "../util/rateLimit.js";
import {
  assetDatabaseProperties,
  badgeDatabaseProperties,
  DATABASE_TITLES,
  developerProductDatabaseProperties,
  gamePassDatabaseProperties,
} from "./databaseSchemas.js";

export interface CreatedDatabaseIds {
  devProductDbId: string;
  gamePassDbId: string;
  badgeDbId: string;
  assetDbId: string;
}

export type PartialCreatedDatabaseIds = Partial<CreatedDatabaseIds>;

export class CreateDatabasesError extends Error {
  readonly createdIds: PartialCreatedDatabaseIds;

  constructor(message: string, createdIds: PartialCreatedDatabaseIds) {
    super(message);
    this.name = "CreateDatabasesError";
    this.createdIds = createdIds;
  }
}

export interface CreateAllDatabasesArgs {
  client: Client;
  parentPageId: string;
}

const DATABASE_SPECS = [
  {
    title: DATABASE_TITLES.developerProduct,
    properties: developerProductDatabaseProperties,
    idKey: "devProductDbId" as const,
  },
  {
    title: DATABASE_TITLES.gamePass,
    properties: gamePassDatabaseProperties,
    idKey: "gamePassDbId" as const,
  },
  {
    title: DATABASE_TITLES.badge,
    properties: badgeDatabaseProperties,
    idKey: "badgeDbId" as const,
  },
  {
    title: DATABASE_TITLES.asset,
    properties: assetDatabaseProperties,
    idKey: "assetDbId" as const,
  },
] as const;

export async function createAllDatabases(
  args: CreateAllDatabasesArgs,
): Promise<CreatedDatabaseIds> {
  const { client, parentPageId } = args;
  const createdIds: PartialCreatedDatabaseIds = {};

  for (const spec of DATABASE_SPECS) {
    try {
      const database = await createDatabase(
        client,
        parentPageId,
        spec.title,
        spec.properties(),
      );
      createdIds[spec.idKey] = database.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CreateDatabasesError(
        `Failed to create Notion database "${spec.title}": ${message}`,
        { ...createdIds },
      );
    }
  }

  return createdIds as CreatedDatabaseIds;
}

async function createDatabase(
  client: Client,
  parentPageId: string,
  title: string,
  properties: CreateDatabaseParameters["properties"],
): Promise<DatabaseObjectResponse> {
  const params: CreateDatabaseParameters = {
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: title } }],
    properties,
  };

  const response = await notionRateLimiter.schedule(() =>
    client.databases.create(params),
  );

  if (!("id" in response) || typeof response.id !== "string") {
    throw new Error(
      `Notion API returned an incomplete database response for "${title}"`,
    );
  }

  return response as DatabaseObjectResponse;
}
