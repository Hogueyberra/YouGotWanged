import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../domain/errors.ts';
import { AppError } from '../server/errors.ts';
import {
  api,
  json,
  readJson,
  requireSameOrigin,
  textField,
} from '../server/http.ts';

const URL = 'https://front-office.example/api/trades';

function expectAppError(
  code: string,
  status: number,
  action: () => unknown,
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

async function expectRejectedAppError(
  code: string,
  status: number,
  action: Promise<unknown>,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

function jsonRequest(body: string, headers: HeadersInit = {}): Request {
  const requestHeaders = new Headers({
    'content-type': 'application/json',
    origin: 'https://front-office.example',
  });
  new Headers(headers).forEach((value, name) =>
    requestHeaders.set(name, value),
  );
  return new Request(URL, {
    method: 'POST',
    headers: requestHeaders,
    body,
  });
}

void test('json responses are private, non-sniffable, and correctly typed', async () => {
  const response = json({ ok: true }, 201);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(
    response.headers.get('content-type') ?? '',
    /^application\/json/,
  );
  assert.deepEqual(await response.json(), { ok: true });
});

void test('same-origin checks reject conflicting Origin and fetch metadata', () => {
  assert.doesNotThrow(() =>
    requireSameOrigin(
      new Request(URL, {
        headers: {
          origin: 'https://front-office.example',
          'sec-fetch-site': 'same-origin',
        },
      }),
    ),
  );
  assert.doesNotThrow(() => requireSameOrigin(new Request(URL)));

  expectAppError('CROSS_ORIGIN', 403, () =>
    requireSameOrigin(
      new Request(URL, { headers: { origin: 'https://attacker.example' } }),
    ),
  );
  expectAppError('CROSS_ORIGIN', 403, () =>
    requireSameOrigin(
      new Request(URL, {
        headers: {
          origin: 'https://front-office.example',
          'sec-fetch-site': 'cross-site',
        },
      }),
    ),
  );
});

void test('readJson validates origin before accepting the request body', async () => {
  await expectRejectedAppError(
    'CROSS_ORIGIN',
    403,
    readJson(
      jsonRequest('{"private":"payload"}', {
        origin: 'https://attacker.example',
      }),
    ),
  );
});

void test('readJson requires an application/json content type', async () => {
  await expectRejectedAppError(
    'CONTENT_TYPE',
    415,
    readJson(
      new Request(URL, {
        method: 'POST',
        headers: {
          origin: 'https://front-office.example',
          'content-type': 'text/plain',
        },
        body: '{"ok":true}',
      }),
    ),
  );
  await expectRejectedAppError(
    'CONTENT_TYPE',
    415,
    readJson(
      new Request(URL, {
        method: 'POST',
        headers: { origin: 'https://front-office.example' },
        body: '{"ok":true}',
      }),
    ),
  );
  await expectRejectedAppError(
    'CONTENT_TYPE',
    415,
    readJson(
      new Request(URL, {
        method: 'POST',
        headers: {
          origin: 'https://front-office.example',
          'content-type': 'application/jsonp',
        },
        body: '{"ok":true}',
      }),
    ),
  );

  assert.deepEqual(
    await readJson(
      jsonRequest('{"ok":true}', {
        'content-type': 'application/json; charset=utf-8',
      }),
    ),
    { ok: true },
  );
});

void test('readJson rejects absent, malformed, scalar, and array bodies', async () => {
  await expectRejectedAppError(
    'INVALID_BODY',
    400,
    readJson(
      new Request(URL, {
        method: 'POST',
        headers: {
          origin: 'https://front-office.example',
          'content-type': 'application/json',
        },
      }),
    ),
  );
  await expectRejectedAppError('INVALID_JSON', 400, readJson(jsonRequest('{')));
  await expectRejectedAppError(
    'INVALID_JSON',
    400,
    readJson(jsonRequest('null')),
  );
  await expectRejectedAppError(
    'INVALID_JSON',
    400,
    readJson(jsonRequest('[]')),
  );
});

void test('readJson accepts 64 KiB exactly and rejects the next byte', async () => {
  const prefix = '{"value":"';
  const suffix = '"}';
  const exact = `${prefix}${'x'.repeat(65_536 - prefix.length - suffix.length)}${suffix}`;
  const oversized = `${prefix}${'x'.repeat(65_537 - prefix.length - suffix.length)}${suffix}`;
  assert.equal(new TextEncoder().encode(exact).byteLength, 65_536);
  assert.equal(new TextEncoder().encode(oversized).byteLength, 65_537);

  const parsed = await readJson(jsonRequest(exact));
  assert.equal((parsed.value as string).length, 65_524);
  await expectRejectedAppError(
    'TOO_LARGE',
    413,
    readJson(jsonRequest(oversized)),
  );
});

void test('api maps application, domain, and unexpected failures safely', async () => {
  const appResponse = await api(async () => {
    throw new AppError('EXPECTED', 'Expected failure', 409);
  });
  assert.equal(appResponse.status, 409);
  assert.deepEqual(await appResponse.json(), {
    error: { code: 'EXPECTED', message: 'Expected failure' },
  });

  const domainResponse = await api(async () => {
    throw new DomainError('INVALID_OWNERSHIP', 'Wrong roster');
  });
  assert.equal(domainResponse.status, 422);
  assert.deepEqual(await domainResponse.json(), {
    error: { code: 'INVALID_TRADE', message: 'Wrong roster' },
  });

  const originalConsoleError = console.error;
  let logCalls = 0;
  console.error = () => {
    logCalls += 1;
  };
  try {
    const unknownResponse = await api(async () => {
      throw new Error('Sensitive database detail');
    });
    assert.equal(unknownResponse.status, 503);
    const body = (await unknownResponse.json()) as {
      error: { code: string; message: string };
    };
    assert.equal(body.error.code, 'UNAVAILABLE');
    assert.doesNotMatch(body.error.message, /database/i);
    assert.equal(logCalls, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

void test('textField trims values, applies defaults, and enforces limits', () => {
  assert.equal(textField('  title  ', 'Title', 20), 'title');
  assert.equal(textField(undefined, 'Title', 20, 'fallback'), 'fallback');
  expectAppError('INVALID_FIELD', 400, () => textField(3, 'Title', 20));
  expectAppError('INVALID_FIELD', 400, () => textField('too long', 'Title', 3));
});
