import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPublishersQuery } from "../../queries/publisher-queries.js";
import { listSolutionsByPublisherQuery } from "../../queries/solution-queries.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

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

export interface PublisherSolutionRecord extends Record<string, unknown> {
  solutionid: string;
  friendlyname: string;
  uniquename: string;
  version: string;
  ismanaged: boolean;
  modifiedon: string;
}

export interface PublisherDetails {
  publisher: PublisherRecord;
  solutions: PublisherSolutionRecord[];
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

export async function resolvePublisher(
  env: EnvironmentConfig,
  client: DynamicsClient,
  publisherRef: string,
): Promise<PublisherRecord> {
  const publishers = await listPublishers(env, client);
  return resolvePublisherFromRecords(env.name, publishers, publisherRef);
}

export async function fetchPublisherDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  publisherRef: string,
): Promise<PublisherDetails> {
  const publisher = await resolvePublisher(env, client, publisherRef);
  const solutions = await client.query<Record<string, unknown>>(
    env,
    "solutions",
    listSolutionsByPublisherQuery(publisher.publisherid),
  );

  return {
    publisher,
    solutions: solutions.map(normalizePublisherSolution),
  };
}

function resolvePublisherFromRecords(
  environmentName: string,
  publishers: PublisherRecord[],
  publisherRef: string,
): PublisherRecord {
  const exactId = publishers.filter((publisher) => publisher.publisherid === publisherRef);
  if (exactId.length === 1) {
    return exactId[0];
  }

  const exactUnique = publishers.filter((publisher) => publisher.uniquename === publisherRef);
  if (exactUnique.length === 1) {
    return exactUnique[0];
  }

  const exactFriendly = publishers.filter((publisher) => publisher.friendlyname === publisherRef);
  if (exactFriendly.length === 1) {
    return exactFriendly[0];
  }

  const exactPrefix = publishers.filter(
    (publisher) => publisher.customizationprefix === publisherRef,
  );
  if (exactPrefix.length === 1) {
    return exactPrefix[0];
  }

  const needle = publisherRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniquePublishers(
    publishers.filter(
      (publisher) =>
        publisher.publisherid.toLowerCase() === needle ||
        publisher.uniquename.toLowerCase() === needle ||
        publisher.friendlyname.toLowerCase() === needle ||
        publisher.customizationprefix.toLowerCase() === needle,
    ),
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniquePublishers(
    publishers.filter(
      (publisher) =>
        publisher.uniquename.toLowerCase().includes(needle) ||
        publisher.friendlyname.toLowerCase().includes(needle) ||
        publisher.customizationprefix.toLowerCase().includes(needle),
    ),
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const ambiguous = uniquePublishers([
    ...exactId,
    ...exactUnique,
    ...exactFriendly,
    ...exactPrefix,
    ...caseInsensitiveMatches,
    ...partialMatches,
  ]);
  if (ambiguous.length > 1) {
    throw createAmbiguousPublisherError(publisherRef, environmentName, ambiguous);
  }

  throw new Error(`Publisher '${publisherRef}' not found in '${environmentName}'.`);
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

function normalizePublisherSolution(record: Record<string, unknown>): PublisherSolutionRecord {
  return {
    ...record,
    solutionid: String(record.solutionid || ""),
    friendlyname: String(record.friendlyname || ""),
    uniquename: String(record.uniquename || ""),
    version: String(record.version || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
  };
}

function createAmbiguousPublisherError(
  publisherRef: string,
  environmentName: string,
  matches: PublisherRecord[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Publisher '${publisherRef}' is ambiguous in '${environmentName}'. Choose a publisher and try again. Matches: ${matches.map(formatPublisherMatch).join(", ")}.`,
    {
      parameter: "publisher",
      options: matches.map((publisher) => createPublisherOption(publisher)),
    },
  );
}

function createPublisherOption(publisher: PublisherRecord): AmbiguousMatchOption {
  return {
    value: publisher.publisherid,
    label: formatPublisherMatch(publisher),
  };
}

function formatPublisherMatch(publisher: PublisherRecord): string {
  const suffix = [
    publisher.uniquename ? publisher.uniquename : null,
    publisher.customizationprefix ? `prefix=${publisher.customizationprefix}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return suffix ? `${publisher.friendlyname} [${suffix}]` : publisher.friendlyname;
}

function uniquePublishers(publishers: PublisherRecord[]): PublisherRecord[] {
  const seen = new Set<string>();

  return publishers.filter((publisher) => {
    if (seen.has(publisher.publisherid)) {
      return false;
    }

    seen.add(publisher.publisherid);
    return true;
  });
}
