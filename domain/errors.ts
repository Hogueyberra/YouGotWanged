export type DomainErrorCode =
  | 'DUPLICATE_PLAYER_ID'
  | 'DUPLICATE_SLOT_ID'
  | 'DUPLICATE_TEAM_ID'
  | 'INVALID_LEAGUE'
  | 'INVALID_TEAM'
  | 'INVALID_TIMESTAMP'
  | 'SAME_TEAM'
  | 'EMPTY_TRADE'
  | 'PLAYER_ON_BOTH_SIDES'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_OWNERSHIP'
  | 'INVALID_LEAGUE_SNAPSHOT';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
