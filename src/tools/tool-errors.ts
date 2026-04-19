export interface AmbiguousMatchOption {
  value: string;
  label: string;
}

export class AmbiguousMatchError extends Error {
  readonly parameter: string;
  readonly options: AmbiguousMatchOption[];

  constructor(
    message: string,
    details: {
      parameter: string;
      options: AmbiguousMatchOption[];
    },
  ) {
    super(message);
    this.name = "AmbiguousMatchError";
    this.parameter = details.parameter;
    this.options = details.options;
  }
}
