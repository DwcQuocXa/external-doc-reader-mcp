export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ScraperError extends AppError {
  constructor(message: string = 'Failed to scrape content', statusCode: number = 500) {
    super(message, statusCode);
  }
}
