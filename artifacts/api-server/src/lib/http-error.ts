/** An error with an HTTP status that the API error handler returns as `{ error }`. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
