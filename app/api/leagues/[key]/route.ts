import { api, json } from '../../../../server/http';
import { requireActor } from '../../../../server/identity';
import { AppError } from '../../../../server/errors';
import {
  fetchYahooLeagueDetail,
  requireYahooAdapter,
} from '../../../../server/yahooLeagues';
import { convertYahooLeagueToDomain } from '../../../../server/yahooLeagueConvert';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ key: string }> };

const LEAGUE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * GET /api/leagues/[key]
 *
 * Full domain League for one Yahoo league, converted from a fresh read-only
 * snapshot (settings, standings, teams, rosters). Powers the trade analyzer
 * for real Yahoo leagues. Requires the authenticated actor and a linked
 * Yahoo account; returns 409 NOT_CONNECTED when Yahoo isn't linked.
 */
export async function GET(request: Request, context: Context) {
  return api(async () => {
    const actor = await requireActor();
    const { key } = await context.params;
    if (!LEAGUE_KEY_PATTERN.test(key)) {
      throw new AppError(
        'INVALID_LEAGUE_KEY',
        'That is not a valid league key.',
        400,
      );
    }

    const adapter = await requireYahooAdapter(actor.id);
    const detail = await fetchYahooLeagueDetail(adapter, key);
    const converted = convertYahooLeagueToDomain(detail);
    if (!converted.ok) {
      throw new AppError(
        'YAHOO_LEAGUE_UNAVAILABLE',
        converted.issues[0] ?? 'Could not convert Yahoo league data.',
        502,
      );
    }
    return json({ league: converted.league });
  });
}
