import { api, json, readJson } from '../../../../server/http';
import { requireActor } from '../../../../server/identity';
import { evaluate } from '../../../../server/service';
export async function POST(request: Request) {
  return api(async () => {
    await requireActor();
    return json({ analysis: evaluate(await readJson(request)).analysis });
  });
}
