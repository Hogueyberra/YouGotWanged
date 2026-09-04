import { env } from 'cloudflare:workers';
import { TradeRepository, type Database } from './repository';

export function repository(): TradeRepository {
  if (!env.DB) throw new Error('Database binding is unavailable.');
  return new TradeRepository(env.DB as unknown as Database);
}
