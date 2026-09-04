import { api, json } from '../../../server/http';
import { requireActor } from '../../../server/identity';
import { repository } from '../../../server/data';
import { overview } from '../../../server/service';
export const dynamic = 'force-dynamic';
export async function GET() {
  return api(async () =>
    json(await overview(repository(), await requireActor())),
  );
}
