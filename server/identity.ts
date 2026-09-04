import { getChatGPTUser } from '../app/chatgpt-auth';
import { AppError } from './errors';

export interface Actor {
  id: string;
  displayName: string;
}

export async function getActor(): Promise<Actor | null> {
  const user = await getChatGPTUser();
  if (user)
    return {
      id: user.userId,
      displayName: user.fullName ?? 'Your front office',
    };
  return null;
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor)
    throw new AppError(
      'UNAUTHENTICATED',
      'Sign in to open your private workspace.',
      401,
    );
  return actor;
}
