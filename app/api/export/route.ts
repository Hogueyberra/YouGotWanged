import { api, json } from '../../../server/http';
import { requireActor } from '../../../server/identity';
import { repository } from '../../../server/data';
export const dynamic = 'force-dynamic';
export async function GET() {
  return api(async () => {
    const actor = await requireActor();
    const response = json({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: 'fictional_demo',
      trades: await repository().list(actor.id),
    });
    response.headers.set(
      'Content-Disposition',
      'attachment; filename="fantasy-front-office-export.json"',
    );
    return response;
  });
}
