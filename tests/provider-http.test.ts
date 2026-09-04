import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ProviderHttpClient,
  ProviderHttpError,
  type FetchLike,
} from '../integrations/providers/http.ts';

void test('GETs JSON from a credential-free HTTPS origin', async () => {
  let requestedUrl = '';
  let requestedMethod = '';
  const fetch: FetchLike = (input, init) => {
    requestedUrl = String(input);
    requestedMethod = init?.method ?? '';
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  const client = new ProviderHttpClient({}, { fetch });

  const response = await client.getJson<{ ok: boolean }>({
    origin: 'https://example.test',
    path: '/resource?format=json',
  });

  assert.equal(requestedMethod, 'GET');
  assert.equal(requestedUrl, 'https://example.test/resource?format=json');
  assert.deepEqual(response.data, { ok: true });
  assert.equal(response.attempts, 1);
});

void test('honors Retry-After for 429 before retrying', async () => {
  let calls = 0;
  const delays: number[] = [];
  const fetch: FetchLike = () => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve(
        new Response(null, {
          status: 429,
          headers: { 'retry-after': '2' },
        }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify({ ok: true })));
  };
  const client = new ProviderHttpClient(
    { maxAttempts: 2, maxTotalBackoffMs: 3_000 },
    {
      fetch,
      sleep(milliseconds) {
        delays.push(milliseconds);
        return Promise.resolve();
      },
    },
  );

  const response = await client.getJson({
    origin: 'https://example.test',
    path: '/resource',
  });

  assert.equal(response.attempts, 2);
  assert.deepEqual(delays, [2_000]);
});

void test('does not retry earlier than a Retry-After beyond its budget', async () => {
  let calls = 0;
  const client = new ProviderHttpClient(
    { maxAttempts: 3, maxTotalBackoffMs: 500 },
    {
      fetch() {
        calls += 1;
        return Promise.resolve(
          new Response(null, {
            status: 429,
            headers: { 'retry-after': '2' },
          }),
        );
      },
      sleep() {
        throw new Error('sleep should not run');
      },
    },
  );

  await assert.rejects(
    client.getJson({
      origin: 'https://example.test',
      path: '/resource',
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderHttpError);
      assert.equal(error.code, 'RATE_LIMITED');
      assert.equal(error.retryAfterMs, 2_000);
      return true;
    },
  );
  assert.equal(calls, 1);
});

void test('does not retry authentication failures', async () => {
  let calls = 0;
  const client = new ProviderHttpClient(
    { maxAttempts: 4 },
    {
      fetch() {
        calls += 1;
        return Promise.resolve(new Response(null, { status: 401 }));
      },
    },
  );

  await assert.rejects(
    client.getJson({
      origin: 'https://example.test',
      path: '/resource',
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderHttpError);
      assert.equal(error.code, 'HTTP_STATUS');
      assert.equal(error.status, 401);
      return true;
    },
  );
  assert.equal(calls, 1);
});

void test('rejects origins with credentials and scheme-relative paths', async () => {
  const client = new ProviderHttpClient(
    {},
    {
      fetch() {
        throw new Error('fetch should not run');
      },
    },
  );

  await assert.rejects(
    client.getJson({
      origin: 'https://user:secret@example.test',
      path: '/resource',
    }),
    { code: 'INVALID_REQUEST' },
  );
  await assert.rejects(
    client.getJson({
      origin: 'https://example.test',
      path: '//attacker.test/resource',
    }),
    { code: 'INVALID_REQUEST' },
  );
});
