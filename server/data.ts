import { env } from 'cloudflare:workers';
import { TradeRepository, type Database } from './repository';
import { YahooOAuthRepository } from './yahoo-oauth-repository';

function database(): Database {
  if (!env.DB) throw new Error('Database binding is unavailable.');
  return env.DB as unknown as Database;
}

export function repository(): TradeRepository {
  return new TradeRepository(database());
}

export function yahooOAuthRepository(): YahooOAuthRepository {
  return new YahooOAuthRepository(database());
}
