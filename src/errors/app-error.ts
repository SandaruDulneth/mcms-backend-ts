export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code = 'APPLICATION_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}
