export type ErrorCode =
  | 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited'
  | 'out_of_stock' | 'invalid_promo' | 'payment_failed' | 'unprocessable' | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, rate_limited: 429,
  out_of_stock: 409, invalid_promo: 422, payment_failed: 402, unprocessable: 422, internal: 500,
};

/** Errors that are safe to show to the caller. Anything else becomes a generic 500. */
export class ApiError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string, readonly details?: Record<string, unknown>, readonly headers?: Record<string, string>) {
    super(message);
    this.status = STATUS[code];
  }
}

export const badRequest = (m: string, d?: Record<string, unknown>) => new ApiError('bad_request', m, d);
export const unauthorized = (m = 'Please sign in to continue') => new ApiError('unauthorized', m);
export const forbidden = (m = 'You do not have permission to do that') => new ApiError('forbidden', m);
export const notFound = (m = 'Not found') => new ApiError('not_found', m);
export const conflict = (m: string, d?: Record<string, unknown>) => new ApiError('conflict', m, d);
