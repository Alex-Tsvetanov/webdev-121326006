// An error the user can read. `status` becomes the HTTP status code.
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

// A failure from the AI provider. `code` is machine-readable; users see a friendly message instead.
export class AiError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AiError';
    this.code = code;
  }
}
