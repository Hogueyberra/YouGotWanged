import { env as workerEnv } from 'cloudflare:workers';

/**
 * Server environment for Yahoo OAuth configuration.
 *
 * Merges the Cloudflare Workers `env` binding (production secrets) with
 * `process.env` (local dotenv files loaded by vinext dev). Worker bindings
 * take precedence. Never import this module from client components.
 */
export function getServerEnv(): Record<string, string | undefined> {
  const proc = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  const worker = workerEnv as unknown as
    | Record<string, string | undefined>
    | undefined;
  return { ...proc?.env, ...worker };
}
