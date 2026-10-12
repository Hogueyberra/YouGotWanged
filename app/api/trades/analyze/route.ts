import { api, json, readJson } from '../../../../server/http';
import { requireActor } from '../../../../server/identity';
import { evaluateAsync } from '../../../../server/service';
export async function POST(request: Request) {
  return api(async () => {
    const actor = await requireActor();
    return json({
      analysis: (await evaluateAsync(await readJson(request), actor.id))
        .analysis,
    });
  });
}
