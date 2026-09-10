declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    YAHOO_CLIENT_ID?: string;
    YAHOO_CLIENT_SECRET?: string;
    YAHOO_REDIRECT_URI?: string;
    YAHOO_TOKEN_ENCRYPTION_KEY?: string;
    YAHOO_APPLICATION_APPROVED?: string;
    YAHOO_LIVE_CONTRACT_VALIDATED?: string;
  }
}
