'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { League, OverviewPayload, SavedTrade } from '@/domain/types';
import {
  ArrowLeftRight,
  BarChart3,
  CircleUserRound,
  Coins,
  LayoutDashboard,
  PanelTop,
  PlugZap,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  ConnectionsView,
  DraftBoardView,
  EmptyLeagueView,
  OverviewView,
  RosterView,
} from './operations-views';
import { TradeCenter } from './trade-center';

type ViewKey = 'overview' | 'roster' | 'trades' | 'draft' | 'connections';

type YahooLeagueSummary = {
  key: string;
  name: string;
  sport: 'football' | 'basketball' | 'unknown';
  season: number | null;
  teamCount: number | null;
  myTeamName: string | null;
  error?: string;
};

/** Yahoo league keys look like "449.l.12345"; demo ids never contain a dot. */
function isYahooLeagueId(id: string) {
  return id.includes('.');
}

function sportLabel(sport: League['sport']) {
  return sport === 'basketball' ? 'Basketball' : 'Football';
}

type RegisteredWebTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute(input: unknown): unknown;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool(
        tool: RegisteredWebTool,
        options?: { signal?: AbortSignal },
      ): void | Promise<void>;
    };
  }
}

const views: Array<{
  id: ViewKey;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'roster', label: 'My Roster', icon: UsersRound },
  { id: 'trades', label: 'Trade Center', icon: ArrowLeftRight },
  { id: 'draft', label: 'Draft Board', icon: Coins },
  { id: 'connections', label: 'Connections', icon: PlugZap },
];

const viewIds = new Set<ViewKey>(views.map((view) => view.id));

function SidebarNavigation({
  activeView,
  onNavigate,
  savedCount,
  yahooConnected,
}: {
  activeView: ViewKey;
  onNavigate: (view: ViewKey) => void;
  savedCount: number;
  yahooConnected: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Front office</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {views.slice(0, 4).map(({ id, label, icon: Icon }) => (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton
                  isActive={activeView === id}
                  tooltip={label}
                  onClick={() => {
                    onNavigate(id);
                    setOpenMobile(false);
                  }}
                >
                  <Icon />
                  <span>{label}</span>
                  {id === 'trades' && savedCount > 0 && (
                    <span className="ffo-nav-count">{savedCount}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="ffo-sidebar-manage">
        <SidebarGroupLabel>Manage</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeView === 'connections'}
                tooltip="Connections"
                onClick={() => {
                  onNavigate('connections');
                  setOpenMobile(false);
                }}
              >
                <PlugZap />
                <span>Connections</span>
                {!yahooConnected && (
                  <span className="ffo-pending-dot" title="Yahoo approval pending" />
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}

function Brand() {
  return (
    <div className="ffo-brand">
      <span className="ffo-brand-mark"><PanelTop /></span>
      <span>
        <strong>FRONT OFFICE</strong>
        <small>Fantasy operations</small>
      </span>
    </div>
  );
}

function FrontOfficeChrome({ initial }: { initial: OverviewPayload }) {
  const [activeView, setActiveView] = useState<ViewKey>('overview');
  const [selectedId, setSelectedId] = useState(initial.leagues[0]?.id ?? '');
  const [savedTrades, setSavedTrades] = useState<SavedTrade[]>(initial.trades);
  const [announcement, setAnnouncement] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [yahooSummaries, setYahooSummaries] = useState<
    YahooLeagueSummary[] | null
  >(null);
  const [yahooListError, setYahooListError] = useState('');
  const [yahooLeagues, setYahooLeagues] = useState<Record<string, League>>({});
  const [yahooLoading, setYahooLoading] = useState(false);
  const [yahooLoadError, setYahooLoadError] = useState('');

  const league = useMemo(() => {
    if (isYahooLeagueId(selectedId)) return yahooLeagues[selectedId] ?? null;
    return (
      initial.leagues.find((candidate) => candidate.id === selectedId) ?? null
    );
  }, [initial.leagues, selectedId, yahooLeagues]);
  const leagueTradeCount = savedTrades.filter(
    (trade) => trade.leagueId === selectedId,
  ).length;

  const footballSummaries = (yahooSummaries ?? []).filter(
    (summary) => summary.sport === 'football',
  );
  const basketballSummaries = (yahooSummaries ?? []).filter(
    (summary) => summary.sport === 'basketball',
  );
  const unknownSummaries = (yahooSummaries ?? []).filter(
    (summary) => summary.sport === 'unknown',
  );
  const selectedSummary =
    yahooSummaries?.find((summary) => summary.key === selectedId) ?? null;
  const selectedLabel = isYahooLeagueId(selectedId)
    ? (selectedSummary
        ? `${selectedSummary.name} · ${selectedSummary.season ?? ''}`.trim()
        : selectedId)
    : league
      ? `${league.name} · ${league.season}`
      : 'Choose a league';
  const webContextRef = useRef({ activeView, league, savedTrades });

  useEffect(() => {
    webContextRef.current = { activeView, league, savedTrades };
  }, [activeView, league, savedTrades]);

  // Load the user's real Yahoo leagues once Yahoo is connected. Demo leagues
  // always stay available; Yahoo leagues load on demand when selected.
  useEffect(() => {
    if (!initial.provider.connected) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/leagues');
        const payload = (await response.json().catch(() => ({}))) as {
          leagues?: YahooLeagueSummary[];
          error?: { message?: string };
        };
        if (!response.ok || payload.error) {
          throw new Error(
            payload.error?.message || 'Could not load your Yahoo leagues.',
          );
        }
        if (!cancelled) setYahooSummaries(payload.leagues ?? []);
      } catch (error) {
        if (!cancelled) {
          setYahooListError(
            error instanceof Error
              ? error.message
              : 'Could not load your Yahoo leagues.',
          );
          setYahooSummaries([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.provider.connected]);

  async function selectLeague(id: string) {
    setSelectedId(id);
    setActiveView('overview');
    setYahooLoadError('');
    if (!isYahooLeagueId(id) || yahooLeagues[id]) {
      announce('League changed. Trade builder reset.');
      return;
    }
    setYahooLoading(true);
    try {
      const response = await fetch(`/api/leagues/${encodeURIComponent(id)}`);
      const payload = (await response.json().catch(() => ({}))) as {
        league?: League;
        error?: { message?: string };
      };
      if (!response.ok || payload.error || !payload.league) {
        throw new Error(
          payload.error?.message || 'Could not load this Yahoo league.',
        );
      }
      setYahooLeagues((cache) => ({ ...cache, [id]: payload.league as League }));
      announce('Yahoo league loaded. Trade builder reset.');
    } catch (error) {
      setYahooLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load this Yahoo league.',
      );
    } finally {
      setYahooLoading(false);
    }
  }

  function announce(message: string) {
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(message), 10);
  }

  function navigate(view: ViewKey) {
    setActiveView(view);
  }

  useEffect(() => {
    const context = typeof document === 'undefined' ? undefined : document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const reportRegistrationFailure = (error: unknown) => {
      // Optional browser capability: keep the visible app usable if registration fails.
      console.warn('Front Office WebMCP registration was unavailable.', error);
    };
    const waitForVisibleUpdate = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'get_front_office_context',
            title: 'Get front office context',
            description:
              'Read a concise summary of the selected fantasy league (demo or Yahoo) and its saved trade ideas.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute(input) {
              if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input as object).length > 0) {
                throw new Error('Input must be an empty object.');
              }
              const current = webContextRef.current;
              if (!current.league) return { selectedLeague: null, savedTrades: [] };
              return {
                selectedLeague: {
                  id: current.league.id,
                  name: current.league.name,
                  season: current.league.season,
                  week: current.league.week,
                  source: current.league.source,
                  snapshotAt: current.league.snapshotAt,
                  teamCount: current.league.teamCount,
                },
                activeView: current.activeView,
                savedTrades: current.savedTrades
                  .filter((trade) => trade.leagueId === current.league?.id)
                  .map((trade) => ({
                    id: trade.id,
                    title: trade.title,
                    status: trade.status,
                    updatedAt: trade.updatedAt,
                  })),
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(reportRegistrationFailure);

      void Promise.resolve(
        context.registerTool(
          {
            name: 'navigate_front_office',
            title: 'Navigate front office',
            description:
              'Open one of the visible Front Office views: overview, roster, trades, draft, or connections.',
            inputSchema: {
              type: 'object',
              properties: {
                view: { type: 'string', enum: ['overview', 'roster', 'trades', 'draft', 'connections'] },
              },
              required: ['view'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            async execute(input) {
              if (!input || typeof input !== 'object' || Array.isArray(input)) {
                throw new Error('Input must contain a valid view.');
              }
              const keys = Object.keys(input);
              if (keys.length !== 1 || keys[0] !== 'view') {
                throw new Error('Input must contain only the view property.');
              }
              const candidate = (input as { view?: unknown }).view;
              if (typeof candidate !== 'string' || !viewIds.has(candidate as ViewKey)) {
                throw new Error('View must be one of: overview, roster, trades, draft, connections.');
              }
              setActiveView(candidate as ViewKey);
              await waitForVisibleUpdate();
              return { view: candidate };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(reportRegistrationFailure);
    } catch (error) {
      reportRegistrationFailure(error);
    }

    return () => lifecycle.abort();
  }, []);

  async function deleteSavedData() {
    setDeleting(true);
    setAccountError('');
    try {
      const response = await fetch('/api/account/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: { message?: string };
      };
      if (!response.ok || payload.error) {
        throw new Error(payload.error?.message || 'Could not delete saved data.');
      }
      if (payload.ok !== true) throw new Error('The server did not confirm deletion.');
      setSavedTrades([]);
      announce('Your saved demo trades were deleted.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not delete saved data.';
      setAccountError(message);
      announce(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="ffo-shell">
      <Sidebar collapsible="icon" className="ffo-sidebar">
        <SidebarHeader>
          <Brand />
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarNavigation
          activeView={activeView}
          onNavigate={navigate}
          savedCount={leagueTradeCount}
          yahooConnected={initial.provider.connected}
        />
        <SidebarFooter>
          <div className="ffo-provider-mini">
            <span><ShieldCheck /></span>
            <div><strong>Private workspace</strong><small>{initial.provider.connected ? 'Yahoo connected' : 'Yahoo access pending'}</small></div>
          </div>
          <SidebarSeparator />
          <button type="button" className="ffo-user-mini" onClick={() => navigate('connections')}>
            <span><CircleUserRound /></span>
            <div><strong>{initial.user.displayName}</strong><small>General manager</small></div>
            <Settings2 />
          </button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="ffo-main">
        <header className="ffo-topbar">
          <div className="ffo-mobile-brand"><SidebarTrigger /><Brand /></div>
          <div className="ffo-league-switcher">
            <span>Active league</span>
            <Select value={selectedId} onValueChange={(value) => void selectLeague(value ?? '')}>
              <SelectTrigger aria-label="Active league">
                <BarChart3 />
                <SelectValue>{selectedLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {footballSummaries.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Yahoo · Football</SelectLabel>
                    {footballSummaries.map((summary) => (
                      <SelectItem key={summary.key} value={summary.key}>
                        {summary.name} · {summary.season}
                        {summary.myTeamName ? ` · ${summary.myTeamName}` : ''}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {basketballSummaries.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Yahoo · Basketball</SelectLabel>
                    {basketballSummaries.map((summary) => (
                      <SelectItem key={summary.key} value={summary.key}>
                        {summary.name} · {summary.season}
                        {summary.myTeamName ? ` · ${summary.myTeamName}` : ''}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {unknownSummaries.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Yahoo · Other</SelectLabel>
                    {unknownSummaries.map((summary) => (
                      <SelectItem key={summary.key} value={summary.key}>
                        {summary.name} · {summary.season}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                <SelectGroup>
                  <SelectLabel>Demo leagues</SelectLabel>
                  {initial.leagues.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.season}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {!initial.provider.connected && (
                  <>
                    <SelectSeparator />
                    <div className="ffo-connect-nudge">
                      <PlugZap aria-hidden="true" />
                      <button
                        type="button"
                        onClick={() => navigate('connections')}
                      >
                        Connect Yahoo to see your real leagues
                      </button>
                    </div>
                  </>
                )}
                {yahooListError && (
                  <>
                    <SelectSeparator />
                    <div className="ffo-connect-nudge ffo-connect-error" role="note">
                      {yahooListError}
                    </div>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="ffo-topbar-actions">
            {league?.source === 'yahoo' ? (
              <Badge className="ffo-yahoo-top-badge">
                Yahoo · {sportLabel(league.sport)}
              </Badge>
            ) : (
              <Badge className="ffo-demo-top-badge"><Sparkles /> Demo league</Badge>
            )}
            <Button variant="ghost" size="icon" aria-label="Open connections" onClick={() => navigate('connections')}>
              <Settings2 />
            </Button>
          </div>
        </header>

        <div className="ffo-content" key={league?.id ?? 'empty'}>
          {yahooLoading ? (
            <output className="ffo-loading-league">
              <span>Loading your Yahoo league…</span>
            </output>
          ) : !league ? (
            <>
              {yahooLoadError && (
                <div className="ffo-form-error" role="alert">
                  {yahooLoadError}
                </div>
              )}
              <EmptyLeagueView onConnections={() => navigate('connections')} />
            </>
          ) : activeView === 'overview' ? (
            <OverviewView league={league} onOpenTrade={() => navigate('trades')} />
          ) : activeView === 'roster' ? (
            <RosterView league={league} />
          ) : activeView === 'trades' ? (
            <TradeCenter
              league={league}
              savedTrades={savedTrades}
              onSavedTradesChange={setSavedTrades}
              announce={announce}
            />
          ) : activeView === 'draft' ? (
            <DraftBoardView league={league} />
          ) : (
            <ConnectionsView
              providerMessage={initial.provider.message}
              yahooConnected={initial.provider.connected}
              yahooConnectEnabled={initial.provider.connectEnabled}
              onDeleteData={deleteSavedData}
              deleting={deleting}
            />
          )}
          {accountError && activeView === 'connections' && (
            <div className="ffo-form-error" role="alert">{accountError}</div>
          )}
        </div>
      </SidebarInset>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
    </div>
  );
}

export function FrontOffice({ initial }: { initial: OverviewPayload }) {
  return (
    <SidebarProvider defaultOpen>
      <FrontOfficeChrome initial={initial} />
    </SidebarProvider>
  );
}
