import { redirect } from 'next/navigation';
import { FrontOffice } from '../components/ffo/front-office';
import { getActor } from '../server/identity';
import { repository } from '../server/data';
import { overview } from '../server/service';
import { chatGPTSignInPath } from './chatgpt-auth';
import './office.css';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const actor = await getActor();
  if (!actor) redirect(chatGPTSignInPath('/'));
  return <FrontOffice initial={await overview(repository(), actor)} />;
}
