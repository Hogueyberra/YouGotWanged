import { api, json } from '../../../server/http';
import { requireActor } from '../../../server/identity';
import {
  requireYahooAdapter,
  valuesOrThrow,
} from '../../../server/yahooLeagues';
import { detectYahooSport } from '../../../server/yahooLeagueConvert';

export const dynamic = 'force-dynamic';

const MIN_SEASON = 2025;

export interface YahooLeagueSummary {
  key: string;
  name: string;
  sport: 'football' | 'basketball' | 'unknown';
  season: number | null;
  teamCount: number | null;
  myTeamName: string | null;
  error?: string;
}

/**
 * GET /api/leagues
 *
 * Lightweight summaries of the authenticated user's Yahoo fantasy leagues
 * (football and basketball). Requires the authenticated actor and a linked
 * Yahoo account; returns 409 NOT_CONNECTED when Yahoo isn't linked.
 * One bad league never kills the list.
 */
export async function GET() {
  return api(async () => {
    const actor = await requireActor();
    const adapter = await requireYahooAdapter(actor.id);

    const leagues = valuesOrThrow(
      (await adapter.fetchUserLeagues()).normalization,
    ).filter((league) => league.season !== null && league.season >= MIN_SEASON);

    const summaries: YahooLeagueSummary[] = [];
    for (const league of leagues) {
      try {
        const [teamsRes, settingsRes] = await Promise.all([
          adapter.fetchTeams(league.providerLeagueKey),
          adapter.fetchSettings(league.providerLeagueKey),
        ]);
        const teams = valuesOrThrow(teamsRes.normalization);
        const settings = valuesOrThrow(settingsRes.normalization);
        const myTeam =
          teams.find((team) => team.isCurrentLogin === true) ?? null;
        summaries.push({
          key: league.providerLeagueKey,
          name: league.name,
          sport: detectYahooSport({
            leagueKey: league.providerLeagueKey,
            gameKey: league.gameKey,
            url: league.url,
            rosterPositions: settings.rosterPositions.map((p) => p.position),
          }),
          season: league.season,
          teamCount: teams.length,
          myTeamName: myTeam?.name ?? null,
        });
      } catch (error) {
        summaries.push({
          key: league.providerLeagueKey,
          name: league.name,
          sport: detectYahooSport({
            leagueKey: league.providerLeagueKey,
            gameKey: league.gameKey,
            url: league.url,
            rosterPositions: [],
          }),
          season: league.season,
          teamCount: null,
          myTeamName: null,
          error:
            error instanceof Error
              ? error.message
              : 'League details unavailable.',
        });
      }
    }

    return json({ leagues: summaries });
  });
}
