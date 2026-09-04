'use client';

import { useMemo, useState } from 'react';
import type {
  League,
  SavedTrade,
  TradeAnalysis,
  TradeRequest,
} from '@/domain/types';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileClock,
  Info,
  LoaderCircle,
  Minus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  UsersRound,
  XCircle,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  compactNumber,
  formatDateTime,
  formatShortDate,
  getPlayer,
  getTeam,
  getTeamPlayers,
  initials,
  verdictLabel,
} from './model';
import { ViewIntro } from './operations-views';

type TradeCenterProps = {
  league: League;
  savedTrades: SavedTrade[];
  onSavedTradesChange: (trades: SavedTrade[]) => void;
  announce: (message: string) => void;
};

type ApiEnvelope = {
  error?: { code?: string; message?: string };
};

const transitions: Record<SavedTrade['status'], SavedTrade['status'][]> = {
  idea: ['proposed', 'withdrawn'],
  proposed: ['accepted', 'rejected', 'withdrawn'],
  accepted: ['completed', 'withdrawn'],
  rejected: [],
  withdrawn: [],
  completed: [],
};

const statusLabels: Record<SavedTrade['status'], string> = {
  idea: 'Idea',
  proposed: 'Proposed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  completed: 'Completed',
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(url, {
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiEnvelope;
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Request failed (${response.status})`);
  }
  return payload;
}

function projection(value: number | null, suffix = '') {
  return value === null ? 'Unavailable' : `${compactNumber.format(value)}${suffix}`;
}

function delta(value: number | null) {
  if (value === null) return 'Unavailable';
  if (value === 0) return '0.0';
  return `${value > 0 ? '+' : ''}${compactNumber.format(value)}`;
}

function PlayerPicker({
  title,
  caption,
  players,
  selected,
  search,
  onSearch,
  onToggle,
  disabled,
}: {
  title: string;
  caption: string;
  players: League['players'];
  selected: string[];
  search: string;
  onSearch: (value: string) => void;
  onToggle: (playerId: string, checked: boolean) => void;
  disabled: boolean;
}) {
  const normalized = search.trim().toLowerCase();
  const filtered = players.filter((player) =>
    `${player.name} ${player.teamAbbr} ${player.position}`
      .toLowerCase()
      .includes(normalized),
  );

  return (
    <section className="ffo-player-picker" aria-label={title}>
      <header>
        <div>
          <h3>{title}</h3>
          <p>{caption}</p>
        </div>
        <Badge variant="secondary">{selected.length} selected</Badge>
      </header>
      <label className="ffo-search-field">
        <Search aria-hidden="true" />
        <span className="sr-only">Search {title.toLowerCase()}</span>
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search player or position"
          disabled={disabled}
        />
      </label>
      <div className="ffo-picker-list">
        {filtered.length ? (
          filtered.map((player) => {
            const checked = selected.includes(player.id);
            return (
              <label className="ffo-picker-row" key={player.id}>
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => onToggle(player.id, next === true)}
                  disabled={disabled}
                  aria-label={`${checked ? 'Remove' : 'Add'} ${player.name}`}
                />
                <span className="ffo-player-avatar">{initials(player.name)}</span>
                <span className="ffo-picker-identity">
                  <strong>{player.name}</strong>
                  <small>{player.teamAbbr} · {player.eligiblePositions.join(' / ')}</small>
                </span>
                <span className="ffo-picker-projection">
                  <strong>{projection(player.weeklyProjection)}</strong>
                  <small>WEEK</small>
                </span>
              </label>
            );
          })
        ) : (
          <div className="ffo-picker-empty">No players match that search.</div>
        )}
      </div>
    </section>
  );
}

function DeltaMetric({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const Icon = value === null || value === 0 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={`ffo-delta-metric ${value === null ? 'is-missing' : value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : ''}`}>
      <span>{label}</span>
      <strong><Icon /> {delta(value)}</strong>
    </div>
  );
}

function AnalysisPanel({
  league,
  analysis,
  onSave,
  saving,
  title,
  setTitle,
  notes,
  setNotes,
}: {
  league: League;
  analysis: TradeAnalysis;
  onSave: () => Promise<void>;
  saving: boolean;
  title: string;
  setTitle: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
}) {
  const myTeam = getTeam(league, analysis.fromTeamId);
  const otherTeam = getTeam(league, analysis.toTeamId);
  const verdictIcon = analysis.verdict === 'unavailable' ? ShieldAlert : analysis.verdict === 'weakens' ? AlertTriangle : CheckCircle2;
  const VerdictIcon = verdictIcon;

  return (
    <Card className={`ffo-analysis-card is-${analysis.verdict}`}>
      <CardHeader>
        <div className="ffo-verdict-icon"><VerdictIcon /></div>
        <div>
          <p className="ffo-eyebrow">Server analysis · {analysis.version}</p>
          <CardTitle>{verdictLabel(analysis.verdict)}</CardTitle>
          <CardDescription>{analysis.summary}</CardDescription>
        </div>
        <Badge variant="outline">As of {formatDateTime(analysis.asOf)}</Badge>
      </CardHeader>
      <CardContent>
        <div className="ffo-analysis-sides">
          {([
            [myTeam?.name ?? 'Your team', analysis.from],
            [otherTeam?.name ?? 'Trade partner', analysis.to],
          ] as const).map(([name, side]) => (
            <section key={name}>
              <header>
                <span>{name}</span>
                <strong>{projection(side.before)} <ArrowRight /> {projection(side.after)}</strong>
              </header>
              <div>
                <DeltaMetric label="Lineup delta" value={side.lineupDelta} />
                <DeltaMetric label="ROS delta" value={side.rosDelta} />
                <div className="ffo-delta-metric">
                  <span>Open roster slots</span>
                  <strong>{side.openRosterSlots}</strong>
                </div>
              </div>
            </section>
          ))}
        </div>

        {(analysis.warnings.length > 0 || analysis.missingSignals.length > 0) && (
          <div className="ffo-analysis-notices">
            {analysis.warnings.map((warning) => (
              <div key={warning}><AlertTriangle /><span><strong>Guardrail</strong>{warning}</span></div>
            ))}
            {analysis.missingSignals.map((signal) => (
              <div key={signal}><Info /><span><strong>Missing coverage</strong>{signal}</span></div>
            ))}
          </div>
        )}

        <div className="ffo-evidence-strip">
          <ClipboardCheck />
          <span>
            <strong>Evidence</strong>
            {analysis.evidence.source} · captured {formatDateTime(analysis.evidence.capturedAt)}
          </span>
          <small>Frozen inputs</small>
        </div>

        <div className="ffo-save-trade">
          <div>
            <label htmlFor="trade-title">Idea title</label>
            <Input
              id="trade-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={100}
              placeholder="e.g. Add receiver depth"
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor="trade-notes">Private notes</label>
            <Textarea
              id="trade-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              placeholder="Optional context for this idea"
              disabled={saving}
            />
          </div>
          <Button
            className="ffo-accent-button"
            onClick={() => void onSave()}
            disabled={saving || !title.trim()}
          >
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {saving ? 'Saving…' : 'Save trade idea'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TradeAssets({ league, trade }: { league: League; trade: SavedTrade }) {
  const give = trade.request.givePlayerIds.map((id) => getPlayer(league, id)).filter(Boolean);
  const receive = trade.request.receivePlayerIds.map((id) => getPlayer(league, id)).filter(Boolean);
  return (
    <div className="ffo-trade-assets">
      <span>{give.map((player) => player?.name).join(', ') || 'No outgoing players'}</span>
      <ArrowRight />
      <span>{receive.map((player) => player?.name).join(', ') || 'No incoming players'}</span>
    </div>
  );
}

function SavedTradeDialog({
  league,
  trade,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
  announce,
}: {
  league: League;
  trade: SavedTrade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (trade: SavedTrade) => void;
  onDeleted: (id: string) => void;
  announce: (message: string) => void;
}) {
  const [nextStatus, setNextStatus] = useState<SavedTrade['status'] | null>(null);
  const [note, setNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  if (!trade) return null;
  const allowed = transitions[trade.status];

  async function updateStatus() {
    if (!nextStatus || !trade) return;
    setUpdating(true);
    setError('');
    try {
      const payload = await apiJson<{ trade: SavedTrade }>(`/api/trades/${encodeURIComponent(trade.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          leagueId: league.id,
          status: nextStatus,
          revision: trade.revision,
          note: note.trim() || undefined,
        }),
      });
      if (!payload.trade) throw new Error('The server returned an incomplete trade update.');
      onUpdated(payload.trade);
      setNextStatus(null);
      setNote('');
      announce(`Trade status updated to ${statusLabels[payload.trade.status]}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the trade.');
    } finally {
      setUpdating(false);
    }
  }

  async function deleteTrade() {
    if (!trade) return;
    setDeleting(true);
    setError('');
    try {
      const payload = await apiJson<{ ok: boolean }>(
        `/api/trades/${encodeURIComponent(trade.id)}?leagueId=${encodeURIComponent(league.id)}`,
        { method: 'DELETE' },
      );
      if (payload.ok !== true) throw new Error('The server did not confirm deletion.');
      onDeleted(trade.id);
      onOpenChange(false);
      announce('Saved trade deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the trade.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ffo-trade-dialog">
        <DialogHeader>
          <div className="ffo-dialog-heading">
            <Badge className={`ffo-trade-status is-${trade.status}`}>{statusLabels[trade.status]}</Badge>
            <span>Revision {trade.revision}</span>
          </div>
          <DialogTitle>{trade.title}</DialogTitle>
          <DialogDescription>
            Created {formatDateTime(trade.createdAt)} · private to this workspace
          </DialogDescription>
        </DialogHeader>

        <TradeAssets league={league} trade={trade} />
        {trade.notes && <p className="ffo-dialog-notes">{trade.notes}</p>}

        <section className="ffo-dialog-analysis">
          <div>
            <span>Your lineup</span>
            <strong>{delta(trade.analysis.from.lineupDelta)}</strong>
          </div>
          <div>
            <span>Partner lineup</span>
            <strong>{delta(trade.analysis.to.lineupDelta)}</strong>
          </div>
          <div>
            <span>Evidence</span>
            <strong>{formatShortDate(trade.analysis.evidence.capturedAt)}</strong>
          </div>
        </section>

        <section className="ffo-timeline" aria-label="Trade history">
          <h3>Event timeline</h3>
          {trade.events.map((event) => (
            <div key={event.id}>
              <span aria-hidden="true" />
              <div>
                <strong>{statusLabels[event.status]}</strong>
                <p>{event.note}</p>
                <time dateTime={event.at}>{formatDateTime(event.at)}</time>
              </div>
            </div>
          ))}
        </section>

        {allowed.length > 0 ? (
          <section className="ffo-status-update">
            <h3>Move this idea forward</h3>
            <div>
              <Select
                value={nextStatus}
                onValueChange={(value) => setNextStatus(value as SavedTrade['status'] | null)}
              >
                <SelectTrigger className="ffo-status-select" aria-label="Next trade status">
                  <SelectValue placeholder="Choose next status" />
                </SelectTrigger>
                <SelectContent>
                  {allowed.map((status) => (
                    <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input aria-label="Optional status note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional event note" maxLength={240} />
              <Button onClick={() => void updateStatus()} disabled={!nextStatus || updating}>
                {updating && <LoaderCircle className="animate-spin" />}
                Update
              </Button>
            </div>
          </section>
        ) : (
          <div className="ffo-terminal-status"><CheckCircle2 /> This trade is in a terminal state.</div>
        )}

        {error && <div className="ffo-form-error" role="alert"><XCircle />{error}</div>}

        <DialogFooter className="ffo-dialog-footer">
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" className="ffo-delete-ghost" disabled={deleting} />}>
              <Trash2 /> {deleting ? 'Deleting…' : 'Delete idea'}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia><Trash2 /></AlertDialogMedia>
                <AlertDialogTitle>Delete this saved trade?</AlertDialogTitle>
                <AlertDialogDescription>
                  The idea, frozen analysis, and event history will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void deleteTrade()}>
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TradeCenter({
  league,
  savedTrades,
  onSavedTradesChange,
  announce,
}: TradeCenterProps) {
  const otherTeams = league.teams.filter((team) => team.id !== league.myTeamId);
  const [partnerId, setPartnerId] = useState(otherTeams[0]?.id ?? '');
  const [giveIds, setGiveIds] = useState<string[]>([]);
  const [receiveIds, setReceiveIds] = useState<string[]>([]);
  const [giveSearch, setGiveSearch] = useState('');
  const [receiveSearch, setReceiveSearch] = useState('');
  const [analysis, setAnalysis] = useState<TradeAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTrade, setSelectedTrade] = useState<SavedTrade | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<'analyzer' | 'saved'>('analyzer');

  const myPlayers = useMemo(() => getTeamPlayers(league, league.myTeamId), [league]);
  const partnerPlayers = useMemo(() => getTeamPlayers(league, partnerId), [league, partnerId]);
  const leagueTrades = savedTrades.filter((trade) => trade.leagueId === league.id);
  const canAnalyze = Boolean(partnerId && giveIds.length && receiveIds.length);
  const inputsLocked = analyzing || saving;

  function resetResult() {
    setAnalysis(null);
    setError('');
  }

  function toggle(list: string[], id: string, checked: boolean) {
    return checked ? [...new Set([...list, id])] : list.filter((candidate) => candidate !== id);
  }

  function changePartner(value: string | null) {
    setPartnerId(value ?? '');
    setReceiveIds([]);
    setReceiveSearch('');
    resetResult();
  }

  async function analyze() {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setAnalysis(null);
    setError('');
    const request: TradeRequest = {
      leagueId: league.id,
      fromTeamId: league.myTeamId,
      toTeamId: partnerId,
      givePlayerIds: giveIds,
      receivePlayerIds: receiveIds,
      asOf: league.snapshotAt,
    };
    try {
      const payload = await apiJson<{ analysis: TradeAnalysis }>('/api/trades/analyze', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (!payload.analysis) throw new Error('The server returned an incomplete analysis.');
      setAnalysis(payload.analysis);
      if (!title) {
        const partner = getTeam(league, partnerId);
        setTitle(`Trade idea with ${partner?.abbreviation ?? 'partner'}`);
      }
      announce('Trade analysis complete.');
    } catch (cause) {
      setAnalysis(null);
      setError(cause instanceof Error ? cause.message : 'Could not analyze this trade.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    if (!analysis || !title.trim()) return;
    setSaving(true);
    setError('');
    const request: TradeRequest = {
      leagueId: league.id,
      fromTeamId: league.myTeamId,
      toTeamId: partnerId,
      givePlayerIds: giveIds,
      receivePlayerIds: receiveIds,
      asOf: analysis.asOf,
    };
    try {
      const payload = await apiJson<{ trade: SavedTrade }>('/api/trades', {
        method: 'POST',
        body: JSON.stringify({ request, title: title.trim(), notes: notes.trim() }),
      });
      if (!payload.trade) throw new Error('The server returned an incomplete saved trade.');
      onSavedTradesChange([payload.trade, ...savedTrades]);
      announce('Trade idea saved to your private workspace.');
      setAnalysis(null);
      setGiveIds([]);
      setReceiveIds([]);
      setTitle('');
      setNotes('');
      setTab('saved');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the trade.');
    } finally {
      setSaving(false);
    }
  }

  function updateSaved(updated: SavedTrade) {
    onSavedTradesChange(savedTrades.map((trade) => trade.id === updated.id ? updated : trade));
    setSelectedTrade(updated);
  }

  function deleteSaved(id: string) {
    onSavedTradesChange(savedTrades.filter((trade) => trade.id !== id));
    setSelectedTrade(null);
  }

  return (
    <div className="ffo-view-stack">
      <ViewIntro
        eyebrow={`Week ${league.week} decision room`}
        title="Trade Center"
        description="Model a two-team exchange against a frozen demo snapshot, then keep the evidence and decision history together."
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as 'analyzer' | 'saved')}
        className="ffo-trade-tabs"
      >
        <TabsList variant="line">
          <TabsTrigger value="analyzer">Analyzer</TabsTrigger>
          <TabsTrigger value="saved">Saved ideas <Badge variant="secondary">{leagueTrades.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="analyzer" className="ffo-trade-tab-content">
          <Card className="ffo-builder-card">
            <CardHeader>
              <div>
                <p className="ffo-eyebrow">Exchange builder</p>
                <CardTitle>Construct a legal two-team trade</CardTitle>
                <CardDescription>
                  Select at least one player from each roster. Changing inputs clears the prior result.
                </CardDescription>
              </div>
              <div className="ffo-demo-chip"><FileClock /> Frozen demo inputs</div>
            </CardHeader>
            <CardContent>
              <div className="ffo-partner-select">
                <label id="partner-label" htmlFor="trade-partner">Trade partner</label>
                <Select value={partnerId} onValueChange={changePartner} disabled={inputsLocked}>
                  <SelectTrigger id="trade-partner" aria-labelledby="partner-label">
                    <UsersRound />
                    <SelectValue placeholder="Choose a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name} · {team.manager}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="ffo-picker-grid">
                <PlayerPicker
                  title="You give"
                  caption={getTeam(league, league.myTeamId)?.name ?? 'Your roster'}
                  players={myPlayers}
                  selected={giveIds}
                  search={giveSearch}
                  onSearch={setGiveSearch}
                  onToggle={(id, checked) => {
                    setGiveIds((current) => toggle(current, id, checked));
                    resetResult();
                  }}
                  disabled={inputsLocked}
                />
                <div className="ffo-exchange-mark"><RefreshCw /><span>FOR</span></div>
                <PlayerPicker
                  title="You receive"
                  caption={getTeam(league, partnerId)?.name ?? 'Choose a partner'}
                  players={partnerPlayers}
                  selected={receiveIds}
                  search={receiveSearch}
                  onSearch={setReceiveSearch}
                  onToggle={(id, checked) => {
                    setReceiveIds((current) => toggle(current, id, checked));
                    resetResult();
                  }}
                  disabled={inputsLocked || !partnerId}
                />
              </div>

              <div className="ffo-analyze-bar">
                <div>
                  <strong>{giveIds.length + receiveIds.length} assets selected</strong>
                  <span>Server recalculates legal lineups for both teams.</span>
                </div>
                <Button
                  size="lg"
                  className="ffo-accent-button"
                  onClick={() => void analyze()}
                  disabled={!canAnalyze || inputsLocked}
                >
                  {analyzing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  {analyzing ? 'Analyzing…' : 'Analyze trade'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {error && <div className="ffo-form-error" role="alert"><XCircle />{error}</div>}

          {analysis && (
            <AnalysisPanel
              league={league}
              analysis={analysis}
              onSave={save}
              saving={saving}
              title={title}
              setTitle={setTitle}
              notes={notes}
              setNotes={setNotes}
            />
          )}
        </TabsContent>

        <TabsContent value="saved" className="ffo-trade-tab-content">
          {leagueTrades.length ? (
            <div className="ffo-saved-grid">
              {leagueTrades.map((trade) => (
                <button
                  type="button"
                  className="ffo-saved-card"
                  key={trade.id}
                  onClick={() => {
                    setSelectedTrade(trade);
                    setDialogOpen(true);
                  }}
                >
                  <header>
                    <Badge className={`ffo-trade-status is-${trade.status}`}>{statusLabels[trade.status]}</Badge>
                    <time dateTime={trade.updatedAt}>{formatShortDate(trade.updatedAt)}</time>
                  </header>
                  <h3>{trade.title}</h3>
                  <TradeAssets league={league} trade={trade} />
                  <footer>
                    <span>{verdictLabel(trade.analysis.verdict)}</span>
                    <ChevronRight />
                  </footer>
                </button>
              ))}
            </div>
          ) : (
            <Card className="ffo-saved-empty">
              <CardContent>
                <div><FileClock /></div>
                <h2>No saved trade ideas</h2>
                <p>Analyze an exchange, name it, and save its frozen evidence here.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <SavedTradeDialog
        key={selectedTrade ? `${selectedTrade.id}-${selectedTrade.revision}` : 'none'}
        league={league}
        trade={selectedTrade}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdated={updateSaved}
        onDeleted={deleteSaved}
        announce={announce}
      />
    </div>
  );
}
