import { env } from 'cloudflare:workers';

const YAHOO_ENV_KEYS = [
  'YAHOO_CLIENT_ID',
  'YAHOO_CLIENT_SECRET',
  'YAHOO_REDIRECT_URI',
  'YAHOO_TOKEN_ENCRYPTION_KEY',
  'YAHOO_APPLICATION_APPROVED',
  'YAHOO_LIVE_CONTRACT_VALIDATED',
] as const;

type YahooEnvKey = (typeof YAHOO_ENV_KEYS)[number];

/**
 * Reads Yahoo-related server secrets from the Workers env binding.
 * Values are never logged by this helper.
 */
export function readYahooEnvironment(): Record<
  YahooEnvKey,
  string | undefined
> {
  const record = env as unknown as Record<string, string | undefined>;
  const result = {} as Record<YahooEnvKey, string | undefined>;
  for (const key of YAHOO_ENV_KEYS) {
    result[key] = record[key];
  }
  return result;
}
