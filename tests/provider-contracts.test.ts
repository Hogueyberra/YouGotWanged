import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DisabledNewsSocialProvider,
  NewsProviderDisabledError,
} from '../integrations/news/provider.ts';

void test('news and social provider remains explicitly disabled', async () => {
  const provider = new DisabledNewsSocialProvider();

  assert.equal(provider.status.readiness, 'disabled');
  assert.equal(provider.status.liveContractValidated, false);
  await assert.rejects(
    provider.collect({
      asOf: '2026-09-04T12:00:00.000Z',
      since: null,
    }),
    NewsProviderDisabledError,
  );
});
