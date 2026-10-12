import {
  fetchLeagueSnapshot,
  requireYahooAdapter,
  valuesOrThrow,
} from '../../../../../server/yahooLeagues';
import { api, json } from '../../../../../server/http';
import { requireActor } from '../../../../../server/identity';

/**
 * GET /api/integrations/yahoo/snapshot
 *
 * Read-only snapshot of the authenticated user's Yahoo fantasy football
 * leagues: teams (+ FAAB balances), full rosters, recent transactions, and
 * the top available players per league. Powers the FAAB battle plan.
 * Requires the authenticated actor; never exposes tokens.
 */
export async function GET() {
  return api(async () => {
    const actor = await requireActor();
    const adapter = await requireYahooAdapter(actor.id);
    const userLeagues = await adapter.fetchUserLeagues();
    const leagues = valuesOrThrow(userLeagues.normalization).filter(
      (league) => league.season !== null && league.season >= 2025,
    );

    const snapshots = [];
    for (const league of leagues) {
      try {
        snapshots.push(
          await fetchLeagueSnapshot(adapter, league.providerLeagueKey),
        );
      } catch (error) {
        snapshots.push({
          key: league.providerLeagueKey,
          name: league.name,
          error:
            error instanceof Error ? error.message : 'League snapshot failed.',
        });
      }
    }

    return json({ leagues: snapshots });
  });
}
