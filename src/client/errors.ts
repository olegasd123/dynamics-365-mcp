export class DynamicsApiError extends Error {
  constructor(
    public readonly environment: string,
    public readonly statusCode: number,
    public readonly odataErrorCode: string | undefined,
    message: string,
  ) {
    super(`Dynamics API error [${environment}] (${statusCode}): ${message}`);
    this.name = "DynamicsApiError";
  }
}

export class DynamicsRequestError extends Error {
  constructor(
    public readonly environment: string,
    public readonly kind: "timeout" | "network",
    message: string,
  ) {
    super(`Dynamics request ${kind} [${environment}]: ${message}`);
    this.name = "DynamicsRequestError";
  }
}
