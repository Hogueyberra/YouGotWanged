export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ProviderHttpPolicy {
  timeoutMs?: number;
  maxAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  maxTotalBackoffMs?: number;
  maxResponseBytes?: number;
}

export interface ProviderHttpDependencies {
  fetch?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

export interface ProviderGetRequest {
  origin: string;
  path: string;
  headers?: HeadersInit;
}

export interface ProviderJsonResponse<T = unknown> {
  data: T;
  status: number;
  headers: Headers;
  attempts: number;
}

export type ProviderHttpErrorCode =
  | 'INVALID_REQUEST'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'RATE_LIMITED'
  | 'HTTP_STATUS'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_JSON';

export class ProviderHttpError extends Error {
  readonly code: ProviderHttpErrorCode;
  readonly status: number | null;
  readonly attempts: number;
  readonly retryAfterMs: number | null;

  constructor(
    code: ProviderHttpErrorCode,
    message: string,
    options: {
      status?: number | null;
      attempts?: number;
      retryAfterMs?: number | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ProviderHttpError';
    this.code = code;
    this.status = options.status ?? null;
    this.attempts = options.attempts ?? 0;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

interface ResolvedPolicy {
  timeoutMs: number;
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  maxTotalBackoffMs: number;
  maxResponseBytes: number;
}

const DEFAULT_POLICY: ResolvedPolicy = {
  timeoutMs: 8_000,
  maxAttempts: 3,
  initialBackoffMs: 250,
  maxBackoffMs: 4_000,
  maxTotalBackoffMs: 15_000,
  maxResponseBytes: 2_000_000,
};

function boundedInteger(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ProviderHttpError(
      'INVALID_REQUEST',
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function resolvePolicy(policy: ProviderHttpPolicy): ResolvedPolicy {
  return {
    timeoutMs: boundedInteger(
      'timeoutMs',
      policy.timeoutMs ?? DEFAULT_POLICY.timeoutMs,
      1,
      30_000,
    ),
    maxAttempts: boundedInteger(
      'maxAttempts',
      policy.maxAttempts ?? DEFAULT_POLICY.maxAttempts,
      1,
      4,
    ),
    initialBackoffMs: boundedInteger(
      'initialBackoffMs',
      policy.initialBackoffMs ?? DEFAULT_POLICY.initialBackoffMs,
      0,
      10_000,
    ),
    maxBackoffMs: boundedInteger(
      'maxBackoffMs',
      policy.maxBackoffMs ?? DEFAULT_POLICY.maxBackoffMs,
      0,
      30_000,
    ),
    maxTotalBackoffMs: boundedInteger(
      'maxTotalBackoffMs',
      policy.maxTotalBackoffMs ?? DEFAULT_POLICY.maxTotalBackoffMs,
      0,
      60_000,
    ),
    maxResponseBytes: boundedInteger(
      'maxResponseBytes',
      policy.maxResponseBytes ?? DEFAULT_POLICY.maxResponseBytes,
      1,
      10_000_000,
    ),
  };
}

function createRequestUrl(origin: string, path: string): URL {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    throw new ProviderHttpError(
      'INVALID_REQUEST',
      'Provider origin must be a valid URL.',
    );
  }

  if (
    base.protocol !== 'https:' ||
    base.username.length > 0 ||
    base.password.length > 0 ||
    base.pathname !== '/' ||
    base.search.length > 0 ||
    base.hash.length > 0
  ) {
    throw new ProviderHttpError(
      'INVALID_REQUEST',
      'Provider origin must be a credential-free HTTPS origin.',
    );
  }

  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new ProviderHttpError(
      'INVALID_REQUEST',
      'Provider path must be an origin-relative path.',
    );
  }

  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    throw new ProviderHttpError(
      'INVALID_REQUEST',
      'Provider path may not change the configured origin.',
    );
  }
  return url;
}

function retryAfterMilliseconds(
  value: string | null,
  now: number,
): number | null {
  if (value === null) return null;
  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1_000;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : Math.max(0, parsed - now);
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readJson(
  response: Response,
  maxResponseBytes: number,
  attempts: number,
): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new ProviderHttpError(
      'RESPONSE_TOO_LARGE',
      'Provider response exceeded the configured size limit.',
      { status: response.status, attempts },
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxResponseBytes) {
    throw new ProviderHttpError(
      'RESPONSE_TOO_LARGE',
      'Provider response exceeded the configured size limit.',
      { status: response.status, attempts },
    );
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new ProviderHttpError(
      'INVALID_JSON',
      'Provider returned a successful response that was not valid JSON.',
      { status: response.status, attempts, cause: error },
    );
  }
}

export class ProviderHttpClient {
  readonly policy: ResolvedPolicy;
  private readonly fetchImplementation: FetchLike;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    policy: ProviderHttpPolicy = {},
    dependencies: ProviderHttpDependencies = {},
  ) {
    this.policy = resolvePolicy(policy);
    this.fetchImplementation = dependencies.fetch ?? globalThis.fetch;
    this.sleep = dependencies.sleep ?? defaultSleep;
    this.now = dependencies.now ?? Date.now;
  }

  async getJson<T = unknown>(
    request: ProviderGetRequest,
  ): Promise<ProviderJsonResponse<T>> {
    const url = createRequestUrl(request.origin, request.path);
    let totalBackoffMs = 0;
    let lastFailure: unknown;

    for (let attempt = 1; attempt <= this.policy.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.policy.timeoutMs);

      try {
        const response = await this.fetchImplementation(url, {
          method: 'GET',
          headers: request.headers,
          signal: controller.signal,
        });

        if (response.ok) {
          const data = (await readJson(
            response,
            this.policy.maxResponseBytes,
            attempt,
          )) as T;
          return {
            data,
            status: response.status,
            headers: response.headers,
            attempts: attempt,
          };
        }

        const retryable = isRetryableStatus(response.status);
        const retryAfterMs = retryAfterMilliseconds(
          response.headers.get('retry-after'),
          this.now(),
        );

        if (!retryable || attempt === this.policy.maxAttempts) {
          throw new ProviderHttpError(
            response.status === 429 ? 'RATE_LIMITED' : 'HTTP_STATUS',
            `Provider GET failed with HTTP ${response.status}.`,
            { status: response.status, attempts: attempt, retryAfterMs },
          );
        }

        const exponentialDelay = Math.min(
          this.policy.initialBackoffMs * 2 ** (attempt - 1),
          this.policy.maxBackoffMs,
        );
        const delayMs = retryAfterMs ?? exponentialDelay;

        if (totalBackoffMs + delayMs > this.policy.maxTotalBackoffMs) {
          throw new ProviderHttpError(
            response.status === 429 ? 'RATE_LIMITED' : 'HTTP_STATUS',
            'Provider requested a retry beyond the configured backoff budget.',
            {
              status: response.status,
              attempts: attempt,
              retryAfterMs: delayMs,
            },
          );
        }

        totalBackoffMs += delayMs;
        await this.sleep(delayMs);
      } catch (error) {
        if (error instanceof ProviderHttpError) throw error;
        lastFailure = error;

        if (attempt === this.policy.maxAttempts) {
          const timedOut = controller.signal.aborted;
          throw new ProviderHttpError(
            timedOut ? 'TIMEOUT' : 'NETWORK',
            timedOut
              ? 'Provider GET timed out.'
              : 'Provider GET failed before receiving a response.',
            { attempts: attempt, cause: error },
          );
        }

        const delayMs = Math.min(
          this.policy.initialBackoffMs * 2 ** (attempt - 1),
          this.policy.maxBackoffMs,
        );
        if (totalBackoffMs + delayMs > this.policy.maxTotalBackoffMs) {
          throw new ProviderHttpError(
            controller.signal.aborted ? 'TIMEOUT' : 'NETWORK',
            'Provider GET retry exceeded the configured backoff budget.',
            { attempts: attempt, cause: error },
          );
        }
        totalBackoffMs += delayMs;
        await this.sleep(delayMs);
      } finally {
        clearTimeout(timer);
      }
    }

    throw new ProviderHttpError(
      'NETWORK',
      'Provider GET exhausted its retry policy.',
      { attempts: this.policy.maxAttempts, cause: lastFailure },
    );
  }
}
