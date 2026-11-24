/** Canonical LVLUP and Go Ninja rank ladders.
 *  GymDesk names differ by school. Aliases are scoped to a program so
 *  "White" on Mini Tigers, Tigers, and Taekwondo stays three different ranks.
 */

export type CurriculumLevel =
  | 'mini_tigers'
  | 'tigers'
  | 'beginners'
  | 'intermediate'
  | 'advanced'
  | 'black_belt'
  | 'legacy'
  | 'go_ninja';

export type StripeSystem = 'color_belt' | 'red_black' | 'sessions' | 'degree' | 'none';

export type RankDef = {
  canonicalId: string;
  program: string;
  sortOrder: number;
  name: string;
  aliases: string[];
  beltColor: string;
  mascot: string | null;
  theme: string | null;
  sessionsRequired: number | null;
  /** Location override. null means that school does not offer the rank. */
  sessionsByLocation: Record<string, number | null>;
  curriculumLevel: CurriculumLevel | null;
  minAge: number | null;
  stripeSystem: StripeSystem;
  degreeBars: number | null;
};

export type ProgramDef = {
  code: string;
  name: string;
  ranked: boolean;
  ages: string | null;
};

export type StripeStep = {
  system: StripeSystem;
  sortOrder: number;
  name: string;
  credits: number | null;
  optional: boolean;
  meaning: string;
};

export type DegreeRequirement = {
  canonicalId: string;
  nextRank: string;
  passScore: string;
  minClasses: number | null;
  minYears: number | null;
  midtermPoints: number | null;
  stripes: string[];
  tournaments: string[];
  mustRegister: boolean;
  teamGate: string | null;
  notes: string | null;
};

export const PROGRAMS: ProgramDef[] = [
  { code: 'mini_tiger', name: 'Mini Tigers (Ages 3-4)', ranked: true, ages: '3-4' },
  { code: 'tiger', name: 'Tigers (Ages 5-7)', ranked: true, ages: '5-7' },
  { code: 'songahm', name: 'Taekwondo (Ages 8-Adult)', ranked: true, ages: '8-adult' },
  { code: 'legacy', name: 'LVLUP Legacy', ranked: true, ages: null },
  { code: 'ata_instructor', name: 'ATA Instructor Certification', ranked: true, ages: null },
  { code: 'goninja', name: 'Go Ninja Movement Academy', ranked: true, ages: null },
  { code: 'adp', name: 'Athlete Development Program (Ages 8-Adult)', ranked: false, ages: '8-adult' },
  { code: 'mpk', name: 'MPK Ranks (DeForest legacy)', ranked: true, ages: null },
  { code: 'fitboxing', name: 'Fitboxing', ranked: false, ages: null },
  { code: 'competition', name: 'Competition Team', ranked: false, ages: null },
  { code: 'events_camps', name: 'Events & Camps', ranked: false, ages: null },
  { code: 'tiger_leaders', name: 'Tiger Leaders', ranked: false, ages: null },
  { code: 'birthday_parties', name: 'Birthday Parties', ranked: false, ages: null },
  { code: 'summer_camp', name: 'Summer Camp', ranked: false, ages: null },
  { code: 'trials', name: 'LVLUP Trials', ranked: false, ages: null },
];

const BELT = {
  white: '#f1f5f9',
  orange: '#f97316',
  yellow: '#facc15',
  camo: '#557142',
  green: '#16a34a',
  purple: '#7c3aed',
  blue: '#2563eb',
  brown: '#7c4a2d',
  red: '#dc2626',
  black: '#141414',
  ninja: '#b42318',
};

type JuniorStep = {
  key: string;
  name: string;
  shortBelt: string;
  belt: string;
  mascot: string | null;
  theme: string | null;
};

/** 18 GymDesk steps. Odd steps are belt colors. Even steps are ATA Tiger animals. */
const JUNIOR_STEPS: JuniorStep[] = [
  { key: 'white', name: 'White', shortBelt: 'White', belt: BELT.white, mascot: null, theme: null },
  { key: 'ara', name: 'Ara the Turtle', shortBelt: 'Ara', belt: BELT.white, mascot: 'Turtle', theme: 'Patience & First Steps' },
  { key: 'orange', name: 'Orange', shortBelt: 'Orange', belt: BELT.orange, mascot: null, theme: null },
  { key: 'baeoh', name: 'Baeoh the Tiger', shortBelt: 'Baeoh', belt: BELT.orange, mascot: 'Tiger', theme: 'Courage & Strength' },
  { key: 'yellow', name: 'Yellow', shortBelt: 'Yellow', belt: BELT.yellow, mascot: null, theme: null },
  { key: 'cheeri', name: 'Cheeri the Cheetah', shortBelt: 'Cheeri', belt: BELT.yellow, mascot: 'Cheetah', theme: 'Speed & Agility' },
  { key: 'camo', name: 'Camo', shortBelt: 'Camo', belt: BELT.camo, mascot: null, theme: null },
  { key: 'raon', name: 'Raon the Lion', shortBelt: 'Raon', belt: BELT.camo, mascot: 'Lion', theme: 'Leadership & Pride' },
  { key: 'green', name: 'Green', shortBelt: 'Green', belt: BELT.green, mascot: null, theme: null },
  { key: 'suri', name: 'Suri the Eagle', shortBelt: 'Suri', belt: BELT.green, mascot: 'Eagle', theme: 'Vision & Focus' },
  { key: 'purple', name: 'Purple', shortBelt: 'Purple', belt: BELT.purple, mascot: null, theme: null },
  { key: 'choa', name: 'Choa the Phoenix', shortBelt: 'Choa', belt: BELT.purple, mascot: 'Phoenix', theme: 'Resilience & Rebirth' },
  { key: 'blue', name: 'Blue', shortBelt: 'Blue', belt: BELT.blue, mascot: null, theme: null },
  { key: 'mir', name: 'Mir the Dragon', shortBelt: 'Mir', belt: BELT.blue, mascot: 'Dragon', theme: 'Power & Wisdom' },
  { key: 'brown', name: 'Brown', shortBelt: 'Brown', belt: BELT.brown, mascot: null, theme: null },
  { key: 'narsha', name: 'Narsha the Snake', shortBelt: 'Narsha', belt: BELT.brown, mascot: 'Snake', theme: 'Precision & Control' },
  { key: 'red', name: 'Red', shortBelt: 'Red', belt: BELT.red, mascot: null, theme: null },
  { key: 'baron', name: 'Baron the Panther', shortBelt: 'Baron', belt: BELT.red, mascot: 'Panther', theme: 'Stealth & Mastery' },
];

function juniorRanks(program: 'mini_tiger' | 'tiger', sessions: number, level: CurriculumLevel): RankDef[] {
  return JUNIOR_STEPS.map((step, i) => ({
    canonicalId: `${program}.${step.key}`,
    program,
    sortOrder: (i + 1) * 10,
    name: step.name,
    aliases: [step.name, `Tiger ${step.shortBelt} Belt`],
    beltColor: step.belt,
    mascot: step.mascot,
    theme: step.theme,
    sessionsRequired: sessions,
    sessionsByLocation: {},
    curriculumLevel: level,
    minAge: null,
    stripeSystem: 'sessions' as const,
    degreeBars: null,
  }));
}

type ColorSpec = {
  key: string;
  name: string;
  belt: string;
  level: CurriculumLevel;
  split: boolean;
};

const COLOR_SPECS: ColorSpec[] = [
  { key: 'white', name: 'White', belt: BELT.white, level: 'beginners', split: false },
  { key: 'orange', name: 'Orange', belt: BELT.orange, level: 'beginners', split: false },
  { key: 'yellow', name: 'Yellow', belt: BELT.yellow, level: 'beginners', split: false },
  { key: 'camo', name: 'Camo', belt: BELT.camo, level: 'beginners', split: true },
  { key: 'green', name: 'Green', belt: BELT.green, level: 'intermediate', split: true },
  { key: 'purple', name: 'Purple', belt: BELT.purple, level: 'intermediate', split: true },
  { key: 'blue', name: 'Blue', belt: BELT.blue, level: 'intermediate', split: true },
  { key: 'brown', name: 'Brown', belt: BELT.brown, level: 'advanced', split: true },
  { key: 'red', name: 'Red', belt: BELT.red, level: 'advanced', split: true },
];

function songahmColorRanks(): RankDef[] {
  const out: RankDef[] = [];
  let sort = 10;
  for (const spec of COLOR_SPECS) {
    if (!spec.split) {
      out.push({
        canonicalId: `songahm.${spec.key}`,
        program: 'songahm',
        sortOrder: sort,
        name: spec.name,
        aliases: [spec.name],
        beltColor: spec.belt,
        mascot: null,
        theme: null,
        sessionsRequired: 12,
        sessionsByLocation: {},
        curriculumLevel: spec.level,
        minAge: null,
        stripeSystem: 'color_belt',
        degreeBars: null,
      });
      sort += 10;
      continue;
    }
    out.push({
      canonicalId: `songahm.${spec.key}_recommended`,
      program: 'songahm',
      sortOrder: sort,
      name: `${spec.name} - Recommended`,
      aliases: [
        `${spec.name} - Recommended`,
        `${spec.name} - R`,
        `${spec.name} Recommended`,
      ],
      beltColor: spec.belt,
      mascot: null,
      theme: null,
      sessionsRequired: 12,
      sessionsByLocation: {},
      curriculumLevel: spec.level,
      minAge: null,
      stripeSystem: 'color_belt',
      degreeBars: null,
    });
    sort += 5;
    out.push({
      canonicalId: `songahm.${spec.key}_decided`,
      program: 'songahm',
      sortOrder: sort,
      name: `${spec.name} - Decided`,
      aliases: [
        `${spec.name} - Decided`,
        `${spec.name} - D`,
        `${spec.name} Decided`,
        spec.name,
      ],
      beltColor: spec.belt,
      mascot: null,
      theme: null,
      sessionsRequired: 12,
      sessionsByLocation: {},
      curriculumLevel: spec.level,
      minAge: null,
      stripeSystem: 'color_belt',
      degreeBars: null,
    });
    sort += 5;
  }
  return out;
}

function blackBelt(n: number, sort: number, sessions: number | null, overrides: Record<string, number | null>): RankDef {
  const ordinals = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
  const label = `${ordinals[n]} Degree Black Belt`;
  return {
    canonicalId: `songahm.bb${n}`,
    program: 'songahm',
    sortOrder: sort,
    name: label,
    aliases: [label, `${ordinals[n]} Degree Black`, `Black (${ordinals[n]})`, `${ordinals[n]} Dan`],
    beltColor: BELT.black,
    mascot: null,
    theme: null,
    sessionsRequired: sessions,
    sessionsByLocation: overrides,
    curriculumLevel: 'black_belt',
    minAge: null,
    stripeSystem: 'degree',
    degreeBars: n,
  };
}

function songahmRanks(): RankDef[] {
  const colors = songahmColorRanks();
  const redBlack: RankDef = {
    canonicalId: 'songahm.red_black',
    program: 'songahm',
    sortOrder: 160,
    name: 'Red / Black',
    aliases: ['Red / Black', 'Red/Black', 'Red Black', 'Deputy', 'Black Belt Recommended'],
    beltColor: BELT.red,
    mascot: null,
    theme: null,
    sessionsRequired: 36,
    sessionsByLocation: { eastmad: 12 },
    curriculumLevel: 'black_belt',
    minAge: null,
    stripeSystem: 'red_black',
    degreeBars: null,
  };
  const degrees = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
    const sessions = n <= 5 ? n * 60 : null;
    const overrides: Record<string, number | null> = {};
    if (n <= 5) overrides.verona = 104;
    if (n === 1) overrides.eastmad = 12;
    if (n >= 2 && n <= 5) overrides.eastmad = null;
    return blackBelt(n, 160 + n * 10, sessions, overrides);
  });
  return [...colors, redBlack, ...degrees];
}

const LEGACY_NAMES = [
  'Level 1 - Connector',
  'Level 2 - Greeter & Outreach',
  'Level 3 - Warm-Up Leader',
  'Level 4 - Drill Leader',
  'Level 5 - Station Coach',
  'Level 6 - Class Leader',
  'Level 7 - Intro Coach',
  'Level 8 - Mentor',
  'Level 9 - Class Commander',
];

function legacyRanks(): RankDef[] {
  return LEGACY_NAMES.map((name, i) => ({
    canonicalId: `legacy.l${i + 1}`,
    program: 'legacy',
    sortOrder: (i + 1) * 10,
    name,
    aliases: [name, `Level ${i + 1}`],
    beltColor: '#0f172a',
    mascot: null,
    theme: null,
    sessionsRequired: null,
    sessionsByLocation: {},
    curriculumLevel: 'legacy',
    minAge: null,
    stripeSystem: 'none',
    degreeBars: null,
  }));
}

const INSTRUCTOR = [
  { key: 'red_collar', name: 'Red Collar', age: 10 },
  { key: 'red_black_collar', name: 'Red/Black Collar', age: 14 },
  { key: 'black_red_black_collar', name: 'Black/Red/Black Collar', age: 16 },
  { key: 'black_collar', name: 'Black Collar', age: 18 },
];

function instructorRanks(): RankDef[] {
  return INSTRUCTOR.map((row, i) => ({
    canonicalId: `ata_instructor.${row.key}`,
    program: 'ata_instructor',
    sortOrder: (i + 1) * 10,
    name: row.name,
    aliases: [row.name],
    beltColor: i === 3 ? BELT.black : BELT.red,
    mascot: null,
    theme: null,
    sessionsRequired: null,
    sessionsByLocation: {},
    curriculumLevel: null,
    minAge: row.age,
    stripeSystem: 'none' as const,
    degreeBars: null,
  }));
}

const GN_LEVELS = ['Recruit', 'Rookie', 'Ranger', 'Raider', 'Rover', 'Rebel', 'Ronin', 'Completed'];

function goNinjaRanks(): RankDef[] {
  return GN_LEVELS.map((name, i) => ({
    canonicalId: `goninja.${name.toLowerCase()}`,
    program: 'goninja',
    sortOrder: (i + 1) * 10,
    name,
    aliases: [name],
    beltColor: BELT.ninja,
    mascot: null,
    theme: null,
    sessionsRequired: null,
    sessionsByLocation: {},
    curriculumLevel: 'go_ninja' as const,
    minAge: null,
    stripeSystem: 'none' as const,
    degreeBars: null,
  }));
}

/** Grade-prefixed ADP names. They do not create a second belt. They point at Songahm. */
export const ADP_ALIASES: Array<{ alias: string; canonicalId: string }> = [
  { alias: '9th Grade White Belt', canonicalId: 'songahm.white' },
  { alias: '8th Grade Orange Belt', canonicalId: 'songahm.orange' },
  { alias: '7th Grade Yellow Belt', canonicalId: 'songahm.yellow' },
  { alias: '6th Grade Camo Belt - R', canonicalId: 'songahm.camo_recommended' },
  { alias: '6th Grade Camo Belt - D', canonicalId: 'songahm.camo_decided' },
  { alias: '5th Grade Green Belt - R', canonicalId: 'songahm.green_recommended' },
  { alias: '5th Grade Green Belt - D', canonicalId: 'songahm.green_decided' },
  { alias: '4th Grade Purple Belt - R', canonicalId: 'songahm.purple_recommended' },
  { alias: '4th Grade Purple Belt - D', canonicalId: 'songahm.purple_decided' },
  { alias: '3rd Grade Blue Belt - R', canonicalId: 'songahm.blue_recommended' },
  { alias: '3rd Grade Blue Belt - D', canonicalId: 'songahm.blue_decided' },
  { alias: '2nd Grade Brown Belt - R', canonicalId: 'songahm.brown_recommended' },
  { alias: '2nd Grade Brown Belt - D', canonicalId: 'songahm.brown_decided' },
  { alias: '1st Grade Red Belt - R', canonicalId: 'songahm.red_recommended' },
  { alias: '1st Grade Red Belt - D', canonicalId: 'songahm.red_decided' },
  { alias: '1st Degree Black Belt - R', canonicalId: 'songahm.red_black' },
  { alias: '1st Degree Black Belt - D', canonicalId: 'songahm.bb1' },
  { alias: '2nd Degree Black Belt', canonicalId: 'songahm.bb2' },
  { alias: '3rd Degree Black Belt', canonicalId: 'songahm.bb3' },
  { alias: '4th Degree Black Belt', canonicalId: 'songahm.bb4' },
  { alias: '5th Degree Black Belt', canonicalId: 'songahm.bb5' },
];

type MpkSpec = { key: string; name: string; belt: string; level: CurriculumLevel };

const MPK: MpkSpec[] = [
  { key: 'white', name: 'White', belt: BELT.white, level: 'beginners' },
  { key: 'white_black', name: 'White Black Stripe', belt: BELT.white, level: 'beginners' },
  { key: 'yellow', name: 'Yellow Solid', belt: BELT.yellow, level: 'beginners' },
  { key: 'yellow_white', name: 'Yellow White Stripe', belt: BELT.yellow, level: 'beginners' },
  { key: 'yellow_black', name: 'Yellow Black Stripe', belt: BELT.yellow, level: 'beginners' },
  { key: 'orange', name: 'Orange Solid', belt: BELT.orange, level: 'beginners' },
  { key: 'orange_white', name: 'Orange White Stripe', belt: BELT.orange, level: 'beginners' },
  { key: 'orange_black', name: 'Orange Black Stripe', belt: BELT.orange, level: 'beginners' },
  { key: 'green', name: 'Green Solid', belt: BELT.green, level: 'intermediate' },
  { key: 'green_white', name: 'Green White Stripe', belt: BELT.green, level: 'intermediate' },
  { key: 'green_black', name: 'Green Black Stripe', belt: BELT.green, level: 'intermediate' },
  { key: 'purple', name: 'Purple Solid', belt: BELT.purple, level: 'intermediate' },
  { key: 'purple_black', name: 'Purple Black Stripe', belt: BELT.purple, level: 'intermediate' },
  { key: 'blue', name: 'Blue Solid', belt: BELT.blue, level: 'intermediate' },
  { key: 'black_black', name: 'Black Black Stripe', belt: BELT.black, level: 'intermediate' },
  { key: 'red', name: 'Red Solid', belt: BELT.red, level: 'advanced' },
  { key: 'red_black_solid', name: 'Red Black Solid', belt: BELT.red, level: 'advanced' },
  { key: 'brown', name: 'Brown', belt: BELT.brown, level: 'advanced' },
  { key: 'brown_black', name: 'Brown Black Stripe', belt: BELT.brown, level: 'advanced' },
  { key: 'bb1', name: 'Black Belt 1st Level', belt: BELT.black, level: 'black_belt' },
  { key: 'bb2', name: 'Black Belt 2nd Level', belt: BELT.black, level: 'black_belt' },
];

function mpkRanks(): RankDef[] {
  return MPK.map((row, i) => ({
    canonicalId: `mpk.${row.key}`,
    program: 'mpk',
    sortOrder: (i + 1) * 10,
    name: row.name,
    aliases: [row.name],
    beltColor: row.belt,
    mascot: null,
    theme: null,
    sessionsRequired: null,
    sessionsByLocation: {},
    curriculumLevel: row.level,
    minAge: null,
    stripeSystem: 'none' as const,
    degreeBars: null,
  }));
}

export const RANKS: RankDef[] = [
  ...juniorRanks('mini_tiger', 6, 'mini_tigers'),
  ...juniorRanks('tiger', 12, 'tigers'),
  ...songahmRanks(),
  ...legacyRanks(),
  ...instructorRanks(),
  ...goNinjaRanks(),
  ...mpkRanks(),
];

export const COLOR_BELT_STRIPES: StripeStep[] = [
  { system: 'color_belt', sortOrder: 1, name: 'White', credits: 4, optional: false, meaning: 'Foundational skills' },
  { system: 'color_belt', sortOrder: 2, name: 'Blue', credits: 8, optional: false, meaning: 'Weapons' },
  { system: 'color_belt', sortOrder: 3, name: 'Red', credits: 12, optional: false, meaning: 'Forms' },
  { system: 'color_belt', sortOrder: 4, name: 'Gold', credits: null, optional: true, meaning: 'Bonus' },
  { system: 'color_belt', sortOrder: 5, name: 'Silver', credits: null, optional: true, meaning: 'Leadership' },
  { system: 'color_belt', sortOrder: 6, name: 'Green', credits: null, optional: true, meaning: 'Set to Test' },
];

export const RED_BLACK_STRIPES: StripeStep[] = [
  { system: 'red_black', sortOrder: 1, name: 'Blue', credits: null, optional: false, meaning: 'Weapons Form' },
  { system: 'red_black', sortOrder: 2, name: 'Black', credits: null, optional: false, meaning: 'Board Breaks' },
  { system: 'red_black', sortOrder: 3, name: 'Silver', credits: null, optional: false, meaning: 'Forms Mastery' },
  { system: 'red_black', sortOrder: 4, name: 'Gold', credits: null, optional: false, meaning: 'Sparring' },
];

export const STRIPE_STEPS: StripeStep[] = [...COLOR_BELT_STRIPES, ...RED_BLACK_STRIPES];

export const DEGREE_REQUIREMENTS: DegreeRequirement[] = [
  {
    canonicalId: 'songahm.red_black',
    nextRank: '1st Degree Black Belt',
    passScore: '7/10',
    minClasses: 32,
    minYears: null,
    midtermPoints: null,
    stripes: ['Blue Weapons Form', 'Black Board Breaks', 'Silver Forms Mastery', 'Gold Sparring'],
    tournaments: ['LVLUP in-school tournament'],
    mustRegister: true,
    teamGate: null,
    notes: null,
  },
  {
    canonicalId: 'songahm.bb1',
    nextRank: '2nd Degree Black Belt',
    passScore: '8/10',
    minClasses: null,
    minYears: 1,
    midtermPoints: 36,
    stripes: [],
    tournaments: ['Class B+ x1', 'Class C (in-school) x1', 'Champion division'],
    mustRegister: true,
    teamGate: null,
    notes: null,
  },
  {
    canonicalId: 'songahm.bb2',
    nextRank: '3rd Degree Black Belt',
    passScore: '8/10',
    minClasses: null,
    minYears: 2,
    midtermPoints: 70,
    stripes: [],
    tournaments: ['Class B+ ATA x1', 'Class C x2', 'Champion division'],
    mustRegister: true,
    teamGate: null,
    notes: null,
  },
  {
    canonicalId: 'songahm.bb3',
    nextRank: '4th Degree Black Belt',
    passScore: '8/10',
    minClasses: null,
    minYears: 3,
    midtermPoints: 100,
    stripes: [],
    tournaments: ['Class AA (Nationals/Worlds) x1', 'Class C+ x2'],
    mustRegister: true,
    teamGate: 'Athlete Development or Legacy',
    notes: null,
  },
  {
    canonicalId: 'songahm.bb4',
    nextRank: '5th Degree Black Belt',
    passScore: '8/10',
    minClasses: null,
    minYears: null,
    midtermPoints: null,
    stripes: [],
    tournaments: [],
    mustRegister: false,
    teamGate: null,
    notes: 'Set with the instructor. No coded requirements.',
  },
];

export type AliasRow = { program: string; alias: string; canonicalId: string };

export function aliasKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ');
}

const byId = new Map(RANKS.map(rank => [rank.canonicalId, rank]));

export function rankById(canonicalId: string) {
  return byId.get(canonicalId) || null;
}

function indexAliases() {
  const map = new Map<string, RankDef>();
  const rows: AliasRow[] = [];
  const add = (program: string, alias: string, rank: RankDef) => {
    const key = program + '\0' + aliasKey(alias);
    const prev = map.get(key);
    if (prev && prev.canonicalId !== rank.canonicalId) {
      throw new Error(`Ambiguous alias ${program} "${alias}"`);
    }
    if (!prev) {
      map.set(key, rank);
      rows.push({ program, alias, canonicalId: rank.canonicalId });
    }
  };
  for (const rank of RANKS) {
    add(rank.program, rank.canonicalId, rank);
    add(rank.program, rank.name, rank);
    for (const alias of rank.aliases) add(rank.program, alias, rank);
  }
  for (const row of ADP_ALIASES) {
    const rank = byId.get(row.canonicalId);
    if (!rank) throw new Error('Missing ADP target ' + row.canonicalId);
    add('adp', row.alias, rank);
    add('adp', row.canonicalId, rank);
  }
  return { map, rows };
}

const aliasIndex = indexAliases();

export const ALIASES: AliasRow[] = aliasIndex.rows;

export type ResolvedRank = {
  inputProgram: string;
  rank: RankDef | null;
  curriculumLevel: CurriculumLevel | null;
  rankedProgram: boolean;
};

export function programByCode(code: string) {
  return PROGRAMS.find(p => p.code === code) || null;
}

/** Resolve a GymDesk name or canonical id inside one program. Never guesses across programs. */
export function resolveRank(program: string, name: string): ResolvedRank | null {
  const prog = programByCode(program);
  if (!prog) return null;
  if (!prog.ranked && !name) {
    return { inputProgram: program, rank: null, curriculumLevel: null, rankedProgram: false };
  }
  if (!prog.ranked && program !== 'adp') {
    return name ? null : { inputProgram: program, rank: null, curriculumLevel: null, rankedProgram: false };
  }
  const rank = aliasIndex.map.get(program + '\0' + aliasKey(name)) || null;
  if (!rank) return null;
  return {
    inputProgram: program,
    rank,
    curriculumLevel: rank.curriculumLevel,
    rankedProgram: program !== 'adp',
  };
}

export function ranksForProgram(program: string) {
  return RANKS.filter(rank => rank.program === program).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sessionsFor(rank: RankDef, locationId?: string | null) {
  if (locationId && Object.prototype.hasOwnProperty.call(rank.sessionsByLocation, locationId)) {
    return rank.sessionsByLocation[locationId];
  }
  return rank.sessionsRequired;
}

export function stripeStepsFor(rank: RankDef) {
  return STRIPE_STEPS.filter(step => step.system === rank.stripeSystem);
}

export function degreeRequirementFor(canonicalId: string) {
  return DEGREE_REQUIREMENTS.find(row => row.canonicalId === canonicalId) || null;
}

export function countByProgram() {
  const counts: Record<string, number> = {};
  for (const rank of RANKS) counts[rank.program] = (counts[rank.program] || 0) + 1;
  return counts;
}
