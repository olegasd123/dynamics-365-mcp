import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPublishersQuery } from "../../queries/publisher-queries.js";

export interface PublisherRecord extends Record<string, unknown> {
  publisherid: string;
  friendlyname: string;
  uniquename: string;
  customizationprefix: string;
  customizationoptionvalueprefix: number | null;
  description: string;
  emailaddress: string;
  supportingwebsiteurl: string;
  isreadonly: boolean;
  modifiedon: string;
  versionnumber: string;
}

export async function listPublishers(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    nameFilter?: string;
    prefixFilter?: string;
  },
): Promise<PublisherRecord[]> {
  const records = await client.query<Record<string, unknown>>(
    env,
    "publishers",
    listPublishersQuery(options?.nameFilter, options?.prefixFilter),
  );

  return records.map(normalizePublisher);
}

function normalizePublisher(record: Record<string, unknown>): PublisherRecord {
  return {
    ...record,
    publisherid: String(record.publisherid || ""),
    friendlyname: String(record.friendlyname || ""),
    uniquename: String(record.uniquename || ""),
    customizationprefix: String(record.customizationprefix || ""),
    customizationoptionvalueprefix:
      record.customizationoptionvalueprefix === undefined ||
      record.customizationoptionvalueprefix === null ||
      record.customizationoptionvalueprefix === ""
        ? null
        : Number(record.customizationoptionvalueprefix),
    description: String(record.description || ""),
    emailaddress: String(record.emailaddress || ""),
    supportingwebsiteurl: String(record.supportingwebsiteurl || ""),
    isreadonly: Boolean(record.isreadonly),
    modifiedon: String(record.modifiedon || ""),
    versionnumber: String(record.versionnumber || ""),
  };
}
