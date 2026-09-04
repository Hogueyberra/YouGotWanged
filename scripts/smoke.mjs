import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = new URL(process.env.FFO_SMOKE_URL || 'http://localhost:3000');
if (!['localhost', '127.0.0.1'].includes(base.hostname))
  throw new Error(
    'This smoke script is limited to the local development server.',
  );
const headers = {
  Cookie: '__sites_local_auth=1',
  'Content-Type': 'application/json',
  Origin: base.origin,
};
async function call(path, init = {}, expected = 200) {
  const response = await fetch(new URL(path, base), {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { message: raw.slice(0, 200) };
  }
  assert.equal(response.status, expected, JSON.stringify(payload));
  return payload;
}
const anonymous = await fetch(new URL('/api/overview', base));
assert.equal(anonymous.status, 401);
const initial = await call('/api/overview');
assert.equal(initial.leagues.length, 2);
assert.equal(initial.provider.status, 'pending_approval');
const league = initial.leagues[0];
const from = league.teams.find((team) => team.id === league.myTeamId);
const to = league.teams.find((team) => team.id !== league.myTeamId);
const request = {
  leagueId: league.id,
  fromTeamId: from.id,
  toTeamId: to.id,
  givePlayerIds: [from.playerIds[0]],
  receivePlayerIds: [to.playerIds[0]],
  asOf: league.snapshotAt,
};
await call(
  '/api/trades/analyze',
  {
    method: 'POST',
    body: JSON.stringify(request),
    headers: { Origin: 'https://untrusted.example' },
  },
  403,
);
const { analysis } = await call('/api/trades/analyze', {
  method: 'POST',
  body: JSON.stringify(request),
});
assert.equal(analysis.leagueId, league.id);
let created;
try {
  ({ trade: created } = await call(
    '/api/trades',
    {
      method: 'POST',
      body: JSON.stringify({
        request,
        title: `Smoke verification ${randomUUID()}`,
        notes: 'Temporary local integration test.',
      }),
    },
    201,
  ));
  assert.deepEqual(created.analysis, analysis);
  assert.equal(created.events.length, 1);
  const afterSave = await call('/api/overview');
  assert.ok(afterSave.trades.some((trade) => trade.id === created.id));
  const update = {
    leagueId: league.id,
    status: 'proposed',
    revision: 1,
    note: 'Local journal test only.',
  };
  const { trade: updated } = await call(`/api/trades/${created.id}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.events.length, 2);
  assert.deepEqual(updated.analysis, analysis);
  await call(
    `/api/trades/${created.id}`,
    { method: 'PATCH', body: JSON.stringify(update) },
    409,
  );
  await call(
    `/api/trades/${created.id}?leagueId=${initial.leagues[1].id}`,
    { method: 'DELETE' },
    404,
  );
  const exported = await call('/api/export');
  assert.ok(exported.trades.some((trade) => trade.id === created.id));
  await call(
    '/api/account/data',
    { method: 'DELETE', body: JSON.stringify({ confirmation: 'WRONG' }) },
    400,
  );
} finally {
  if (created)
    await call(`/api/trades/${created.id}?leagueId=${league.id}`, {
      method: 'DELETE',
    });
}
const final = await call('/api/overview');
assert.ok(!final.trades.some((trade) => trade.id === created?.id));
console.log(
  'HTTP smoke passed: authentication, two leagues, analysis, save/read-back, revision history, stale update, cross-league rejection, export, deletion confirmation, and isolated cleanup.',
);
