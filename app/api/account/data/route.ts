import { api, json, readJson } from '../../../../server/http';
import { AppError } from '../../../../server/errors';
import { requireActor } from '../../../../server/identity';
import { repository } from '../../../../server/data';
export async function DELETE(request: Request) {
  return api(async () => {
    const actor = await requireActor();
    if ((await readJson(request)).confirmation !== 'DELETE')
      throw new AppError(
        'CONFIRMATION_REQUIRED',
        'Type DELETE to erase your saved trade data.',
      );
    await repository().deleteAll(actor.id);
    return json({ ok: true });
  });
}
