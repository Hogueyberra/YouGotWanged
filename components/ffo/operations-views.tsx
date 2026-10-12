'use client';

import type { ReactNode } from 'react';

import type { League } from '@/domain/types';
import {
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  Check,
  CircleDashed,
  Clock3,
  CloudOff,
  Database,
  Download,
  ExternalLink,
  FileWarning,
  Goal,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
  WalletCards,
  Zap,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  compactNumber,
  formatDateTime,
  formatProjection,
  getTeam,
  getTeamPlayers,
  initials,
  lineupTotal,
  optimizeLineup,
  rosterSpend,
  rosterStrengths,
} from './model';

type LeagueViewProps = {
  league: League;
};

function ViewIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ffo-view-intro">
      <div>
        <p className="ffo-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'ink',
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  detail: string;
  tone?: 'ink' | 'green' | 'lime';
}) {
  return (
    <Card className={`ffo-metric-card ffo-metric-${tone}`}>
      <CardHeader>
        <div className="ffo-metric-icon">
          <Icon aria-hidden="true" />
        </div>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <strong>{value}</strong>
        <span>{detail}</span>
      </CardContent>
    </Card>
  );
}

export function OverviewView({
  league,
  onOpenTrade,
}: LeagueViewProps & { onOpenTrade: () => void }) {
  const team = getTeam(league, league.myTeamId);
  const players = getTeamPlayers(league, league.myTeamId);
  const lineup = optimizeLineup(players, league.startingSlots);
  const projected = lineupTotal(lineup);
  const spend = rosterSpend(players);
  const strengths = rosterStrengths(players);
  const standings = [...league.teams].sort(
    (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor,
  );
  const rank = Math.max(
    1,
    standings.findIndex((candidate) => candidate.id === team?.id) + 1,
  );
  const starters = lineup.assignments.filter((assignment) => assignment.player);
  const isDemo = league.source === 'demo';
  const sportName = league.sport === 'basketball' ? 'NBA' : 'NFL';

  return (
    <div className="ffo-view-stack">
      <ViewIntro
        eyebrow={`Week ${league.week} command center`}
        title="Your front office."
        description={
          isDemo
            ? 'Your roster, league position, and next decision—organized from one frozen demo snapshot.'
            : 'Your roster, league position, and next decision—organized from your live Yahoo league data.'
        }
        action={
          <Button className="ffo-accent-button" size="lg" onClick={onOpenTrade}>
            Open Trade Center <ArrowRight data-icon="inline-end" />
          </Button>
        }
      />

      <div className="ffo-demo-banner" role="note">
        <Sparkles aria-hidden="true" />
        <div>
          <strong>
            {isDemo ? 'Demo league workspace' : 'Yahoo league workspace'}
          </strong>
          <span>
            {isDemo
              ? 'Every player, projection, score, and auction result shown here is synthetic—not current NFL information.'
              : `Roster data comes from your Yahoo ${sportName} league (read-only). Projections are unavailable through Yahoo's API, so lineup values show as incomplete.`}
          </span>
        </div>
        <time dateTime={league.snapshotAt}>
          Snapshot {formatDateTime(league.snapshotAt)}
        </time>
      </div>

      <section className="ffo-metric-grid" aria-label="Team snapshot">
        <MetricCard
          icon={Trophy}
          label="League position"
          value={`#${rank}`}
          detail={`${team?.wins ?? 0}–${team?.losses ?? 0} record`}
          tone="lime"
        />
        <MetricCard
          icon={Zap}
          label="Starting projection"
          value={formatProjection(projected)}
          detail={projected === null ? 'Projection coverage incomplete' : `${starters.length}/${league.startingSlots.length} slots filled`}
          tone="green"
        />
        {league.draftType === 'auction' && (
          <MetricCard
            icon={WalletCards}
            label="Draft capital used"
            value={`$${spend}`}
            detail={`of $${league.budget} auction budget`}
          />
        )}
        <MetricCard
          icon={BadgeDollarSign}
          label="FAAB remaining"
          value={`$${team?.faabRemaining ?? 0}`}
          detail={isDemo ? 'Demo waiver budget' : 'Yahoo waiver budget'}
        />
      </section>

      <div className="ffo-overview-grid">
        <Card className="ffo-lineup-card">
          <CardHeader>
            <div>
              <p className="ffo-eyebrow">Week {league.week} operations board</p>
              <CardTitle>Best legal lineup</CardTitle>
              <CardDescription>
                {isDemo
                  ? 'Highest projected demo lineup using current slot eligibility.'
                  : 'Best legal lineup using current slot eligibility. Projections unavailable.'}
              </CardDescription>
            </div>
            <div className="ffo-score-lockup">
              <span>Projected</span>
              <strong>{formatProjection(projected)}</strong>
              <small>PTS</small>
            </div>
          </CardHeader>
          <CardContent>
            <div className="ffo-lineup-list">
              {lineup.assignments.map((assignment) => (
                <div className="ffo-lineup-row" key={assignment.slotId}>
                  <span className="ffo-slot-label">{assignment.slotLabel}</span>
                  {assignment.player ? (
                    <>
                      <span className="ffo-player-avatar">
                        {initials(assignment.player.name)}
                      </span>
                      <div>
                        <strong>{assignment.player.name}</strong>
                        <small>
                          {assignment.player.teamAbbr} · {assignment.player.position}
                        </small>
                      </div>
                      <span className="ffo-mono-value">
                        {formatProjection(assignment.player.weeklyProjection)}
                      </span>
                    </>
                  ) : (
                    <div className="ffo-empty-slot">
                      <AlertCircle /> No projected legal assignment
                    </div>
                  )}
                </div>
              ))}
            </div>
            {lineup.missing.length > 0 && (
              <div className="ffo-lineup-incomplete" role="note">
                <AlertCircle aria-hidden="true" />
                <div>
                  <strong>Projection total unavailable</strong>
                  <span>
                    {lineup.missing[0]}
                    {lineup.missing.length > 1 ? ` +${lineup.missing.length - 1} more coverage issue${lineup.missing.length === 2 ? '' : 's'}` : ''}
                  </span>
                </div>
              </div>
            )}
            <div className="ffo-matchup-unavailable">
              <CloudOff aria-hidden="true" />
              <div>
                <strong>Opponent matchup feed not connected</strong>
                <span>
                  Yahoo access is pending, so the demo does not fabricate an
                  opponent or win probability.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="ffo-side-stack">
          <Card className="ffo-strength-card">
            <CardHeader>
            <CardTitle>Demo ROS averages</CardTitle>
              <CardDescription>Raw average fictional ROS points by position.</CardDescription>
            </CardHeader>
            <CardContent>
              {strengths.slice(0, 4).map((strength, index) => {
                const max = strengths.find((candidate) => candidate.score !== null)?.score ?? 1;
                return (
                  <div className="ffo-strength-row" key={strength.position}>
                    <div>
                      <span>{strength.position}</span>
                      <small>{strength.count} rostered</small>
                    </div>
                    <Progress
                      aria-label={`${strength.position} fictional rest-of-season average display`}
                      value={strength.score === null ? 0 : Math.round((strength.score / max) * 100)}
                      className={index === 0 ? 'is-leading' : undefined}
                    />
                    <strong>{formatProjection(strength.score)}</strong>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="ffo-priority-card">
            <CardHeader>
              <div className="ffo-priority-icon"><Goal /></div>
              <CardTitle>Decision desk</CardTitle>
              <CardDescription>
                Compare a real lineup exchange using server-side math.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul>
                <li><Check /> Legal-lineup impact for both teams</li>
                <li><Check /> Rest-of-season projection delta</li>
                <li><Check /> Immutable evidence timestamp</li>
              </ul>
              <Button className="ffo-dark-button" onClick={onOpenTrade}>
                Build a trade <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="ffo-table-card">
        <CardHeader>
          <div>
            <p className="ffo-eyebrow">League room</p>
            <CardTitle>Standings</CardTitle>
          </div>
          <Badge variant="outline">{league.teamCount} teams</Badge>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Club</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead className="text-right">Record</TableHead>
                <TableHead className="text-right">Points for</TableHead>
                <TableHead className="text-right">FAAB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((standing, index) => (
                <TableRow
                  key={standing.id}
                  className={standing.id === league.myTeamId ? 'is-current-team' : undefined}
                >
                  <TableCell className="ffo-table-rank">{index + 1}</TableCell>
                  <TableCell>
                    <div className="ffo-team-cell">
                      <span>{standing.abbreviation}</span>
                      <strong>{standing.name}</strong>
                    </div>
                  </TableCell>
                  <TableCell>{standing.manager}</TableCell>
                  <TableCell className="text-right ffo-mono-value">
                    {standing.wins}–{standing.losses}
                  </TableCell>
                  <TableCell className="text-right ffo-mono-value">
                    {compactNumber.format(standing.pointsFor)}
                  </TableCell>
                  <TableCell className="text-right ffo-mono-value">
                    ${standing.faabRemaining}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function RosterView({ league }: LeagueViewProps) {
  const team = getTeam(league, league.myTeamId);
  const players = getTeamPlayers(league, league.myTeamId);
  const lineup = optimizeLineup(players, league.startingSlots);
  const startingIds = new Set(
    lineup.assignments.flatMap((assignment) => assignment.player?.id ?? []),
  );
  const sortedPlayers = [...players].sort(
    (a, b) =>
      Number(startingIds.has(b.id)) - Number(startingIds.has(a.id)) ||
      (b.weeklyProjection ?? -Infinity) - (a.weeklyProjection ?? -Infinity),
  );
  const spend = rosterSpend(players);
  const isDemo = league.source === 'demo';

  return (
    <div className="ffo-view-stack">
      <ViewIntro
        eyebrow={`${team?.abbreviation ?? 'TEAM'} · ${league.scoringLabel}`}
        title="My roster"
        description={
          isDemo
            ? 'A legal-lineup view of your synthetic demo squad. Auction cost is draft history—not current player value.'
            : 'A legal-lineup view of your Yahoo roster (read-only). Projections are unavailable through Yahoo\u2019s API.'
        }
      />

      <div className="ffo-roster-summary">
        <div>
          <span>Projected starters</span>
          <strong>{formatProjection(lineupTotal(lineup))}</strong>
          <small>{lineup.total === null ? 'coverage incomplete' : isDemo ? 'demo points' : 'points unavailable'}</small>
        </div>
        <div>
          <span>Roster occupancy</span>
          <strong>{players.length}/{league.rosterLimit}</strong>
          <small>{Math.max(0, league.rosterLimit - players.length)} open</small>
        </div>
        {league.draftType === 'auction' && (
          <div>
            <span>Auction spend</span>
            <strong>${spend}</strong>
            <small>of ${league.budget}</small>
          </div>
        )}
        <div>
          <span>Source state</span>
          <strong className={isDemo ? 'ffo-source-demo' : 'ffo-source-yahoo'}>
            {isDemo ? 'Demo' : 'Yahoo'}
          </strong>
          <small>{formatDateTime(league.snapshotAt)}</small>
        </div>
      </div>

      <Card className="ffo-table-card">
        <CardHeader>
          <CardTitle>Depth chart</CardTitle>
          <CardDescription>
            Starters are assigned deterministically from eligible positions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Week proj.</TableHead>
                <TableHead className="text-right">ROS proj.</TableHead>
                <TableHead className="text-right">Draft cost</TableHead>
                <TableHead className="text-right">Bye</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlayers.map((player) => {
                const slot = lineup.assignments.find((assignment) => assignment.player?.id === player.id);
                return (
                  <TableRow key={player.id}>
                    <TableCell>
                      <Badge variant={slot ? 'default' : 'secondary'} className={slot ? 'ffo-starter-badge' : undefined}>
                        {slot?.slotLabel ?? 'Bench'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="ffo-player-cell">
                        <span>{initials(player.name)}</span>
                        <div>
                          <strong>{player.name}</strong>
                          <small>{player.teamAbbr}</small>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{player.eligiblePositions.join(' / ')}</TableCell>
                    <TableCell>
                      <span className={`ffo-status-dot ffo-status-${player.status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                        {player.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right ffo-mono-value">
                      {formatProjection(player.weeklyProjection)}
                    </TableCell>
                    <TableCell className="text-right ffo-mono-value">
                      {formatProjection(player.rosProjection)}
                    </TableCell>
                    <TableCell className="text-right ffo-mono-value">${player.auctionCost}</TableCell>
                    <TableCell className="text-right ffo-mono-value">{player.byeWeek}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function DraftBoardView({ league }: LeagueViewProps) {
  // The draft board visualizes auction spend, which only exists for demo
  // auction leagues. Yahoo's read-only API exposes no draft costs, and snake
  // drafts have no auction ledger.
  if (league.source !== 'demo' || league.draftType !== 'auction') {
    return (
      <div className="ffo-view-stack">
        <ViewIntro
          eyebrow={`${league.season} draft board`}
          title="Draft board"
          description="Auction spend is only available for demo auction leagues."
        />
        <div className="ffo-ledger-callout" role="note">
          <BadgeDollarSign />
          <div>
            <strong>No auction ledger for this league</strong>
            <span>
              {league.source === 'yahoo'
                ? "Yahoo's read-only API does not expose draft costs, so there is nothing to chart here. Roster construction lives under My Roster."
                : 'This league was not drafted by auction, so there is no spend map to show.'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const ownership = new Map<string, League['teams'][number]>();
  for (const team of league.teams) {
    for (const playerId of team.playerIds) ownership.set(playerId, team);
  }
  const players = [...league.players].sort(
    (a, b) => b.auctionCost - a.auctionCost || (b.weeklyProjection ?? -Infinity) - (a.weeklyProjection ?? -Infinity),
  );
  const positionSpend = [...new Set(players.map((player) => player.position))]
    .map((position) => ({
      position,
      cost: getTeamPlayers(league, league.myTeamId)
        .filter((player) => player.position === position)
        .reduce((total, player) => total + player.auctionCost, 0),
    }))
    .sort((a, b) => b.cost - a.cost);

  return (
    <div className="ffo-view-stack">
      <ViewIntro
        eyebrow={`${league.season} auction ledger`}
        title="Draft board"
        description="Review fictional auction outcomes and roster construction. Dollar amounts are historical demo costs, never trade values."
      />

      <div className="ffo-ledger-callout" role="note">
        <BadgeDollarSign />
        <div>
          <strong>Cost is not value</strong>
          <span>
            The board deliberately keeps auction spend separate from Trade Center
            projections and lineup deltas.
          </span>
        </div>
      </div>

      <div className="ffo-draft-grid">
        <Card className="ffo-position-spend">
          <CardHeader>
            <CardTitle>Your spend map</CardTitle>
            <CardDescription>Demo auction dollars by primary position.</CardDescription>
          </CardHeader>
          <CardContent>
            {positionSpend.map((row) => (
              <div key={row.position}>
                <span>{row.position}</span>
                <Progress
                  aria-label={`${row.position} share of fictional auction budget`}
                  value={(row.cost / Math.max(1, league.budget)) * 100}
                />
                <strong>${row.cost}</strong>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="ffo-draft-context">
          <CardHeader>
            <CardTitle>Auction context</CardTitle>
          </CardHeader>
          <CardContent>
            <div><span>Format</span><strong>Superflex auction</strong></div>
            <div><span>Budget</span><strong>${league.budget}</strong></div>
            <div><span>Roster size</span><strong>{league.rosterLimit}</strong></div>
            <div><span>Source</span><strong>Fictional demo</strong></div>
          </CardContent>
        </Card>
      </div>

      <Card className="ffo-table-card">
        <CardHeader>
          <CardTitle>League auction ledger</CardTitle>
          <CardDescription>All players included in this synthetic snapshot.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Drafted by</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Week proj.</TableHead>
                <TableHead className="text-right">Bye</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player) => {
                const team = ownership.get(player.id);
                return (
                  <TableRow key={player.id}>
                    <TableCell>
                      <div className="ffo-player-cell">
                        <span>{initials(player.name)}</span>
                        <div><strong>{player.name}</strong><small>{player.teamAbbr}</small></div>
                      </div>
                    </TableCell>
                    <TableCell>{player.position}</TableCell>
                    <TableCell>{team?.name ?? 'Free agent'}</TableCell>
                    <TableCell className="text-right ffo-cost-value">${player.auctionCost}</TableCell>
                    <TableCell className="text-right ffo-mono-value">{formatProjection(player.weeklyProjection)}</TableCell>
                    <TableCell className="text-right ffo-mono-value">{player.byeWeek}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function ConnectionsView({
  providerMessage,
  yahooConnected,
  yahooConnectEnabled,
  onDeleteData,
  deleting,
}: {
  providerMessage: string;
  yahooConnected: boolean;
  yahooConnectEnabled: boolean;
  onDeleteData: () => Promise<void>;
  deleting: boolean;
}) {
  return (
    <div className="ffo-view-stack">
      <ViewIntro
        eyebrow="Data & privacy"
        title="Connections"
        description="Provider access, capability boundaries, and controls for your private workspace."
      />

      <Card className="ffo-provider-card">
        <CardHeader>
          <div className="ffo-yahoo-mark">Y!</div>
          <div>
            <CardTitle>Yahoo Fantasy Sports</CardTitle>
            <CardDescription>{providerMessage}</CardDescription>
          </div>
          {yahooConnected ? (
            <Badge className="ffo-connected-badge"><Check /> Connected</Badge>
          ) : (
            <Badge className="ffo-pending-badge"><CircleDashed /> Pending approval</Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="ffo-provider-facts">
            <div><Database /><span>League, roster, standings, and transaction reads</span><strong>Pending</strong></div>
            <div><LockKeyhole /><span>Lineup, waiver, and trade writes</span><strong>Unavailable</strong></div>
            <div><Clock3 /><span>Long-term Yahoo data retention</span><strong>Unverified</strong></div>
          </div>
          <a
            className="ffo-external-button"
            href="https://sports.yahoo.com/developer/access/"
            target="_blank"
            rel="noreferrer"
          >
            Open Yahoo access application <ExternalLink />
          </a>
          {yahooConnected ? (
            <p className="ffo-connection-note">
              Your Yahoo account is linked. Live reads stay disabled until the
              provider contract is validated.
            </p>
          ) : yahooConnectEnabled ? (
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = '/api/integrations/yahoo/authorize';
              }}
            >
              Connect Yahoo <ArrowRight />
            </Button>
          ) : (
            <p className="ffo-connection-note">
              Connecting a Yahoo account needs the owner to install the Yahoo
              credentials on this deployment first.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="ffo-connection-grid" aria-label="Planned data connections">
        <Card>
          <CardHeader>
            <div className="ffo-connection-icon"><Radio /></div>
            <CardTitle>News + injuries</CardTitle>
            <Badge variant="secondary">Planned</Badge>
          </CardHeader>
          <CardContent>
            <p>
              No live news is shown. A licensed source and timestamped ingestion
              policy must be selected before this pipeline can turn on.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="ffo-connection-icon"><TrendingUp /></div>
            <CardTitle>Projection pipeline</CardTitle>
            <Badge variant="secondary">Planned</Badge>
          </CardHeader>
          <CardContent>
            <p>
              Current projections are fictional demo inputs. Production needs a
              licensed weekly and rest-of-season provider with historical snapshots.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="ffo-privacy-card">
        <CardHeader>
          <div>
            <p className="ffo-eyebrow">Workspace controls</p>
            <CardTitle>Your private data</CardTitle>
            <CardDescription>
              Export your saved workspace or remove personal saved demo trades.
            </CardDescription>
          </div>
          <ShieldCheck />
        </CardHeader>
        <CardContent>
          <div className="ffo-privacy-action">
            <div><Download /><span><strong>Export workspace</strong><small>Download your private data as JSON.</small></span></div>
            <Button
              variant="outline"
              render={
                <a href="/api/export" download>
                  Export <Download />
                </a>
              }
            />
          </div>
          <div className="ffo-privacy-action is-destructive">
            <div><FileWarning /><span><strong>Delete saved data</strong><small>Clears personal saved demo trades. Demo league fixtures remain.</small></span></div>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive" disabled={deleting} />}>
                {deleting ? 'Deleting…' : 'Delete saved data'} <Trash2 />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia><Trash2 /></AlertDialogMedia>
                  <AlertDialogTitle>Delete your saved demo trades?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes your personal saved trade ideas and event history.
                    It does not remove the shared fictional demo league fixtures.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void onDeleteData()}>
                    Delete permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function EmptyLeagueView({ onConnections }: { onConnections: () => void }) {
  return (
    <div className="ffo-empty-state">
      <div><Users /></div>
      <p className="ffo-eyebrow">No leagues available</p>
      <h1>Your front office is waiting for a league.</h1>
      <p>
        Yahoo access is still pending. Open Connections for the real provider
        status; this workspace will not pretend a sync succeeded.
      </p>
      <Button onClick={onConnections}>View connections <ArrowRight /></Button>
    </div>
  );
}

export { ViewIntro };
