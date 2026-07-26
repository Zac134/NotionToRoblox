import { config } from "../config.js";
import type {
  DeveloperProductInput,
  DeveloperProductUpdateInput,
  RobloxDeveloperProduct,
} from "../types.js";
import { extractDefaultPrice } from "../types.js";
import {
  robloxDeveloperProductReadLimiter,
  robloxDeveloperProductWriteLimiter,
  robloxJson,
  robloxMultipart,
} from "./http.js";

const LIST_PATH =
  "/developer-products/v2/universes/{universeId}/developer-products/creator";
const CREATE_PATH =
  "/developer-products/v2/universes/{universeId}/developer-products";
const UPDATE_PATH =
  "/developer-products/v2/universes/{universeId}/developer-products/{productId}";

interface ListDeveloperProductsResponse {
  developerProducts: RobloxDeveloperProduct[];
  nextPageToken?: string;
}

interface DeveloperProductCreateResponse {
  productId: number;
  name: string;
  description: string;
  iconImageAssetId: number;
  universeId: number;
  isForSale: boolean;
}

function pathWithUniverse(template: string): string {
  return template.replace("{universeId}", String(config.ROBLOX_UNIVERSE_ID));
}

function pathWithProduct(template: string, productId: number): string {
  return pathWithUniverse(template).replace("{productId}", String(productId));
}

export async function listDeveloperProducts(): Promise<RobloxDeveloperProduct[]> {
  const items: RobloxDeveloperProduct[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams();
    query.set("pageSize", "50");
    if (pageToken) {
      query.set("pageToken", pageToken);
    }

    const response = await robloxJson<ListDeveloperProductsResponse>({
      path: `${pathWithUniverse(LIST_PATH)}?${query.toString()}`,
      limiter: robloxDeveloperProductReadLimiter,
    });

    items.push(...response.developerProducts);
    pageToken = response.nextPageToken;
  } while (pageToken);

  return items.map(normalizeDeveloperProduct);
}

export async function createDeveloperProduct(
  input: DeveloperProductInput,
): Promise<number> {
  const fields = buildFields(input);
  const response = await robloxMultipart<DeveloperProductCreateResponse>({
    method: "POST",
    path: pathWithUniverse(CREATE_PATH),
    fields,
    file: input.icon
      ? { ...input.icon, fieldName: "imageFile" }
      : undefined,
    limiter: robloxDeveloperProductWriteLimiter,
  });

  return response.productId;
}

export async function updateDeveloperProduct(
  productId: number,
  input: DeveloperProductUpdateInput,
): Promise<void> {
  const fields = buildUpdateFields(input);
  await robloxMultipart<void>({
    method: "PATCH",
    path: pathWithProduct(UPDATE_PATH, productId),
    fields,
    file: input.icon
      ? { ...input.icon, fieldName: "imageFile" }
      : undefined,
    limiter: robloxDeveloperProductWriteLimiter,
  });
}

function buildFields(input: DeveloperProductInput) {
  const fields = [
    { name: "name", value: input.name },
    { name: "isForSale", value: input.isForSale },
    { name: "price", value: input.price },
    { name: "isRegionalPricingEnabled", value: false },
  ];

  if (input.description !== undefined) {
    fields.push({ name: "description", value: input.description });
  }

  return fields;
}

function buildUpdateFields(input: DeveloperProductUpdateInput) {
  const fields: Array<{ name: string; value: string | boolean | number }> = [];

  if (input.name !== undefined) {
    fields.push({ name: "name", value: input.name });
  }
  if (input.description !== undefined) {
    fields.push({ name: "description", value: input.description });
  }
  if (input.isForSale !== undefined) {
    fields.push({ name: "isForSale", value: input.isForSale });
  }
  if (input.price !== undefined) {
    fields.push({ name: "price", value: input.price });
  }

  return fields;
}

function normalizeDeveloperProduct(
  product: RobloxDeveloperProduct,
): RobloxDeveloperProduct {
  return {
    ...product,
    priceInformation: product.priceInformation ?? {
      defaultPriceInRobux: extractDefaultPrice(product.priceInformation) ?? undefined,
    },
  };
}

export function getDeveloperProductPrice(
  product: RobloxDeveloperProduct,
): number | null {
  return extractDefaultPrice(product.priceInformation);
}
