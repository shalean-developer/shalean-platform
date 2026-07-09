/**
 * @module _shared/errors
 * @status CONTRACT ONLY
 */

export class WorkerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 500,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkerError";
  }
}

export class UnauthorizedError extends WorkerError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ConfigError extends WorkerError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR", 503);
  }
}
