import type { SavedTrade } from '../../../../domain/types';
import {
  api,
  json,
  readJson,
  requireSameOrigin,
  textField,
} from '../../../../server/http';
import { AppError } from '../../../../server/errors';
import { requireActor } from '../../../../server/identity';
import { repository } from '../../../../server/data';
import { leagueById } from '../../../../server/service';
import { STATUS_TRANSITIONS } from '../../../../server/repository';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const actor = await requireActor();
    const { id } = await context.params;
    const body = await readJson(request);
    const league = leagueById(body.leagueId);
    if (
      typeof body.status !== 'string' ||
      !Object.hasOwn(STATUS_TRANSITIONS, body.status)
    )
      throw new AppError('INVALID_STATUS', 'Select a valid trade status.');
    if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 1)
      throw new AppError(
        'INVALID_REVISION',
        'A current trade revision is required.',
      );
    return json({
      trade: await repository().transition(
        actor.id,
        league.id,
        id,
        body.status as SavedTrade['status'],
        body.revision as number,
        textField(body.note, 'Status note', 1000),
      ),
    });
  });
}
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    requireSameOrigin(request);
    const actor = await requireActor();
    const league = leagueById(
      new URL(request.url).searchParams.get('leagueId'),
    );
    await repository().delete(actor.id, league.id, (await context.params).id);
    return json({ ok: true });
  });
}
