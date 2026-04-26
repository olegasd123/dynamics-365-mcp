export interface LiveRequestLogOptions {
  maxLoggedRequests: number;
  maxLoggedRequestChars: number;
}

export interface LiveRecordedRequest {
  method: "query" | "queryPath" | "queryPage" | "queryPagePath" | "getPath";
  environment: string;
  resourcePath: string;
  queryParams?: string;
}

export interface LiveToolRunFailure {
  toolName: string;
  caseName: string;
  arguments: Record<string, unknown>;
  error: string;
  requests: LiveRecordedRequest[];
}

export function formatRecordedRequest(request: LiveRecordedRequest): string {
  return `${request.method} ${request.environment} ${request.resourcePath}${
    request.queryParams ? `?${request.queryParams}` : ""
  }`;
}

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function getRequestSampleLines(
  requests: LiveRecordedRequest[],
  requestLogOptions: LiveRequestLogOptions,
): string[] {
  if (requests.length === 0) {
    return ["requests: none"];
  }

  const shownRequests = requests.slice(0, requestLogOptions.maxLoggedRequests);
  const lines = [
    `requests: ${requests.length} recorded, showing ${shownRequests.length}`,
    ...shownRequests.map(
      (request) =>
        `request: ${truncateText(formatRecordedRequest(request), requestLogOptions.maxLoggedRequestChars)}`,
    ),
  ];

  if (requests.length > shownRequests.length) {
    lines.push(`requests: ${requests.length - shownRequests.length} more not shown`);
  }

  return lines;
}

export function formatFailuresAssertionMessage(
  failures: LiveToolRunFailure[],
  requestLogOptions: LiveRequestLogOptions,
): string {
  return failures
    .map((failure) =>
      [
        `Tool '${failure.toolName}' case '${failure.caseName}' failed.`,
        `Arguments: ${JSON.stringify(failure.arguments)}`,
        `Error: ${failure.error}`,
        ...getRequestSampleLines(failure.requests, requestLogOptions).map((line) => line),
      ].join("\n"),
    )
    .join("\n\n");
}
