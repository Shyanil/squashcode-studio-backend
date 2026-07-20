export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function notImplemented(feature: string): never {
  throw new HttpError(501, `${feature} is not implemented yet.`);
}

