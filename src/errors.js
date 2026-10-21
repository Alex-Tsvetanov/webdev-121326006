// An error the user can read. `status` becomes the HTTP status code.
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

// The database refused a booking that overlaps another one in the same lab. The service turns it into a 409.
export class OverlapError extends Error {
  constructor() {
    super('overlap');
    this.name = 'OverlapError';
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
