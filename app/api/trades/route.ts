import { api, json, readJson, textField } from '../../../server/http';
import { requireActor } from '../../../server/identity';
import { repository } from '../../../server/data';
import { evaluateAsync } from '../../../server/service';
export async function POST(request: Request) {
  return api(async () => {
    const actor = await requireActor();
    const body = await readJson(request);
    const result = await evaluateAsync(body.request, actor.id);
    const title = textField(body.title, 'Title', 100) || 'New trade idea';
    const notes = textField(body.notes, 'Notes', 2000);
    return json(
      {
        trade: await repository().create(
          actor.id,
          result.request,
          result.analysis,
          title,
          notes,
        ),
      },
      201,
    );
  });
}
