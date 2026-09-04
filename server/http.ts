import { AppError } from './errors.ts';

export function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function api(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof AppError)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    if (error instanceof Error && error.name === 'DomainError') {
      return json(
        { error: { code: 'INVALID_TRADE', message: error.message } },
        422,
      );
    }
    console.error('Application request failed', {
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return json(
      {
        error: {
          code: 'UNAVAILABLE',
          message: 'Your workspace could not be loaded. Please try again.',
        },
      },
      503,
    );
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new AppError(
      'CROSS_ORIGIN',
      'This action must come from your workspace.',
      403,
    );
  }
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  requireSameOrigin(request);
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  ) {
    throw new AppError('CONTENT_TYPE', 'Send JSON data.', 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('INVALID_BODY', 'Request data is required.');
  let length = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 65_536) {
      await reader.cancel();
      throw new AppError('TOO_LARGE', 'This request is too large.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('object required');
    return body as Record<string, unknown>;
  } catch {
    throw new AppError(
      'INVALID_JSON',
      'The request must contain a valid JSON object.',
    );
  }
}

export function textField(
  value: unknown,
  name: string,
  max: number,
  fallback = '',
): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max)
    throw new AppError(
      'INVALID_FIELD',
      `${name} must be text with no more than ${max} characters.`,
    );
  return value.trim();
}
