import type { League, Player, Position, StartingSlot, Team } from './types.ts';

export const DEMO_TIMESTAMP = '2026-09-04T12:00:00.000Z';

const FIRST_NAMES = [
  'Alden',
  'Brenner',
  'Cairo',
  'Daxen',
  'Eamon',
  'Farris',
  'Galen',
  'Hollis',
  'Iver',
  'Jory',
  'Keaton',
  'Lennox',
  'Marlow',
  'Nico',
  'Orson',
  'Perrin',
  'Quade',
  'Riven',
  'Stellan',
  'Tobin',
];

const LAST_NAMES = [
  'Ashby',
  'Briar',
  'Cinder',
  'Darrow',
  'Everly',
  'Fenn',
  'Graves',
  'Hale',
  'Iverson',
  'Jett',
  'Kestrel',
  'Lark',
  'Morrow',
  'North',
  'Orchard',
  'Pryor',
  'Quill',
  'Rook',
  'Sterling',
  'Thorne',
];

const PLAYER_BLUEPRINT: ReadonlyArray<{
  position: Position;
  weekly: number;
  auctionCost: number;
}> = [
  { position: 'QB', weekly: 23, auctionCost: 27 },
  { position: 'QB', weekly: 17.5, auctionCost: 8 },
  { position: 'RB', weekly: 17, auctionCost: 34 },
  { position: 'RB', weekly: 14, auctionCost: 25 },
  { position: 'RB', weekly: 10, auctionCost: 12 },
  { position: 'RB', weekly: 7, auctionCost: 4 },
  { position: 'WR', weekly: 16.5, auctionCost: 31 },
  { position: 'WR', weekly: 13.5, auctionCost: 22 },
  { position: 'WR', weekly: 9.5, auctionCost: 10 },
  { position: 'WR', weekly: 6.5, auctionCost: 3 },
  { position: 'TE', weekly: 11, auctionCost: 15 },
  { position: 'TE', weekly: 6.5, auctionCost: 5 },
  { position: 'K', weekly: 8, auctionCost: 1 },
  { position: 'DEF', weekly: 7.5, auctionCost: 1 },
];

const STARTING_SLOTS: StartingSlot[] = [
  { id: 'qb', label: 'QB', eligible: ['QB'] },
  { id: 'rb-1', label: 'RB 1', eligible: ['RB'] },
  { id: 'rb-2', label: 'RB 2', eligible: ['RB'] },
  { id: 'wr-1', label: 'WR 1', eligible: ['WR'] },
  { id: 'wr-2', label: 'WR 2', eligible: ['WR'] },
  { id: 'te', label: 'TE', eligible: ['TE'] },
  { id: 'flex', label: 'FLEX', eligible: ['RB', 'WR', 'TE'] },
  {
    id: 'superflex',
    label: 'SUPERFLEX',
    eligible: ['QB', 'RB', 'WR', 'TE'],
  },
];

const CLUB_ABBREVIATIONS = [
  'ARC',
  'BLF',
  'CRN',
  'DUS',
  'ELM',
  'FRO',
  'GLN',
  'HBR',
  'ION',
  'JDE',
  'KNG',
  'LUM',
  'MST',
  'NVA',
  'ORB',
  'PNR',
  'QRY',
  'RGE',
  'SLT',
  'TRC',
];

const NEIGHBORHOOD_TEAMS = [
  'Cedar Street Captains',
  'Juniper Yard Owls',
  'Lantern Park Foxes',
  'Maple Court Meteors',
  'Orchard Lane Union',
  'Pinecrest Pilots',
  'Riverview Rooks',
  'Willow Bend Waves',
];

const FRIDAY_TEAMS = [
  'Alumni Hall Comets',
  'Blue Note Bisons',
  'Campus Loop Knights',
  'Fourth Period Forge',
  'Gym Annex Giants',
  'Homecoming Heralds',
  'Locker Row Legends',
  'Pep Rally Phantoms',
  'Study Hall Sparks',
  'Varsity Way Voyagers',
];

const MANAGERS = [
  'Morgan Vale',
  'Riley Arden',
  'Casey Rowan',
  'Jordan Flint',
  'Taylor Lark',
  'Cameron Briar',
  'Avery Rook',
  'Parker North',
  'Reese Hollis',
  'Quinn Marlow',
  'Skyler Fenn',
  'Dakota Pryor',
  'Emerson Jett',
  'Finley Quill',
  'Hayden Sterling',
  'Kendall Thorne',
  'Logan Kestrel',
  'Micah Darrow',
];

function playerName(sequence: number): string {
  const first = FIRST_NAMES[sequence % FIRST_NAMES.length];
  const last =
    LAST_NAMES[Math.floor(sequence / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last}`;
}

function buildRoster(
  leagueSlug: string,
  teamIndex: number,
  globalOffset: number,
): Player[] {
  const teamAdjustment = ((teamIndex % 5) - 2) * 0.25;

  return PLAYER_BLUEPRINT.map((blueprint, rosterIndex) => {
    const sequence =
      globalOffset + teamIndex * PLAYER_BLUEPRINT.length + rosterIndex;
    const weeklyProjection = Number(
      (blueprint.weekly + teamAdjustment + (rosterIndex % 3) * 0.1).toFixed(1),
    );

    return {
      id: `${leagueSlug}-player-${teamIndex + 1}-${rosterIndex + 1}`,
      name: playerName(sequence),
      teamAbbr: CLUB_ABBREVIATIONS[sequence % CLUB_ABBREVIATIONS.length],
      position: blueprint.position,
      eligiblePositions: [blueprint.position],
      weeklyProjection,
      rosProjection: Number((weeklyProjection * 14).toFixed(1)),
      auctionCost: blueprint.auctionCost,
      status:
        rosterIndex === 8 && teamIndex % 4 === 1
          ? ('questionable' as const)
          : ('healthy' as const),
      byeWeek: 5 + ((sequence + rosterIndex) % 10),
      projectedAt: DEMO_TIMESTAMP,
    };
  });
}

function buildLeague(options: {
  id: string;
  name: string;
  scoringLabel: string;
  teamNames: string[];
  globalPlayerOffset: number;
  managerOffset: number;
}): League {
  const players: Player[] = [];
  const teams: Team[] = options.teamNames.map((name, teamIndex) => {
    const roster = buildRoster(
      options.id,
      teamIndex,
      options.globalPlayerOffset,
    );
    players.push(...roster);

    return {
      id: `${options.id}-team-${teamIndex + 1}`,
      name,
      manager: MANAGERS[(options.managerOffset + teamIndex) % MANAGERS.length],
      abbreviation: `T${String(teamIndex + 1).padStart(2, '0')}`,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      faabRemaining: 100,
      playerIds: roster.map((player) => player.id),
    };
  });

  return {
    id: options.id,
    name: options.name,
    sport: 'football',
    season: 2026,
    week: 1,
    teamCount: teams.length,
    scoringLabel: options.scoringLabel,
    draftType: 'auction',
    superflex: true,
    budget: 200,
    rosterLimit: PLAYER_BLUEPRINT.length,
    startingSlots: STARTING_SLOTS.map((slot) => ({
      ...slot,
      eligible: [...slot.eligible],
    })),
    myTeamId: teams[0].id,
    teams,
    players,
    source: 'demo',
    snapshotAt: DEMO_TIMESTAMP,
  };
}

export const DEMO_LEAGUES: League[] = [
  buildLeague({
    id: 'demo-neighborhood-2026',
    name: 'Neighborhood League',
    scoringLabel: 'Half-PPR · 6-point passing TD',
    teamNames: NEIGHBORHOOD_TEAMS,
    globalPlayerOffset: 0,
    managerOffset: 0,
  }),
  buildLeague({
    id: 'demo-friday-night-2026',
    name: 'Friday Night Lights',
    scoringLabel: 'Full PPR · 4-point passing TD',
    teamNames: FRIDAY_TEAMS,
    globalPlayerOffset: NEIGHBORHOOD_TEAMS.length * PLAYER_BLUEPRINT.length,
    managerOffset: NEIGHBORHOOD_TEAMS.length,
  }),
];
