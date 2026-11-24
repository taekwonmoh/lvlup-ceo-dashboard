/** Cycle curriculum. A program and a rank pick one level. The active cycle picks the lessons.
 *  Mini Tigers and Go Ninja are starter cards: the members site does not publish those videos yet.
 *  Other levels name the real lesson slots. Vimeo ids stay empty until the members catalog is imported.
 *  Any player URL this module builds sets texttrack=false.
 */

import { activeCycle, type ActiveCycle } from './cycles.ts';
import {
  degreeRequirementFor,
  resolveRank,
  sessionsFor,
  stripeStepsFor,
  type CurriculumLevel,
  type RankDef,
} from './ranks.ts';

export type CurriculumVideo = {
  title: string;
  vimeoId: string;
  cycleTheme: string;
  rankName?: string | null;
};

export type LessonCategory = 'kick' | 'one_step' | 'form' | 'weapon' | 'sparring' | 'board_break' | 'stripe';

export type Lesson = {
  level: CurriculumLevel;
  cycleNo: number;
  slot: number;
  category: LessonCategory;
  title: string;
  meta: string;
  vimeoId: string | null;
  sample: boolean;
  note: string | null;
};

export type CurriculumSection = {
  level: CurriculumLevel;
  sample: boolean;
  overlay: boolean;
  lessons: Lesson[];
};

export type MemberCurriculum = {
  inputProgram: string;
  rank: RankDef;
  curriculumLevel: CurriculumLevel;
  cycle: ActiveCycle;
  sessionsRequired: number | null;
  stripeSteps: ReturnType<typeof stripeStepsFor>;
  degree: ReturnType<typeof degreeRequirementFor>;
  sections: CurriculumSection[];
};

const SAMPLE_NOTE = 'Starter sample. The members site does not define this video yet.';
const SLOT_NOTE = 'Lesson slot. The Vimeo id stays on the members site until that catalog is imported.';

export function videosByCycleTheme(videos: CurriculumVideo[]): Record<string, CurriculumVideo[]> {
  const out: Record<string, CurriculumVideo[]> = {};
  for (const video of videos) {
    const theme = video.cycleTheme || 'Unassigned';
    if (!out[theme]) out[theme] = [];
    out[theme].push(video);
  }
  return out;
}

/** Every player URL includes texttrack=false. Optional unlisted hashes stay on the query string. */
export function vimeoPlayerUrl(vimeoId: string, hash?: string | null) {
  const id = encodeURIComponent(vimeoId);
  const extra = hash ? `&h=${encodeURIComponent(hash)}` : '';
  return `https://player.vimeo.com/video/${id}?badge=0&autopause=0&player_id=0&texttrack=false${extra}`;
}

function lesson(
  level: CurriculumLevel,
  cycleNo: number,
  slot: number,
  category: LessonCategory,
  title: string,
  meta: string,
  sample: boolean,
  note: string | null = null,
): Lesson {
  return {
    level,
    cycleNo,
    slot,
    category,
    title,
    meta,
    vimeoId: null,
    sample,
    note: note || (sample ? SAMPLE_NOTE : SLOT_NOTE),
  };
}

function themed(level: CurriculumLevel, cycleNo: number, theme: string, rows: Array<[LessonCategory, string, string]>, sample = false) {
  return rows.map(([category, title, meta], i) => lesson(
    level,
    cycleNo,
    i + 1,
    category,
    `${theme} · ${title}`,
    meta,
    sample,
  ));
}

export function lessonsFor(level: CurriculumLevel, cycleNo: number, theme: string): Lesson[] {
  if (level === 'mini_tigers') {
    return themed(level, cycleNo, theme, [
      ['kick', 'Animal walks and first kicks', 'Mini Tigers · kicks'],
      ['one_step', 'Partner tap and step-back', 'Mini Tigers · one-step'],
      ['form', 'Color-belt animal form', 'Mini Tigers · form'],
      ['weapon', 'Foam noodle strikes', 'Mini Tigers · weapon'],
      ['sparring', 'Bubble-tag control', 'Mini Tigers · sparring'],
      ['board_break', 'Pad tap, one break', 'Mini Tigers · board break'],
    ], true);
  }
  if (level === 'tigers') {
    return themed(level, cycleNo, theme, [
      ['kick', 'Side kicks', 'Tigers · kicks'],
      ['one_step', 'Self-defense', 'Tigers · one-step'],
      ['weapon', 'Bo staff form', 'Tigers · weapon'],
      ['form', 'Raon the Lion form', 'Tigers · form'],
      ['sparring', 'Tiger tag sparring', 'Tigers · sparring'],
      ['board_break', 'One board, your options', 'Tigers · board break'],
      ['stripe', 'Red stripe Baeoh form', 'Tigers · stripe bonus'],
    ]);
  }
  if (level === 'beginners') {
    return themed(level, cycleNo, theme, [
      ['sparring', 'Sparring kick combo (side kick and round kick)', 'Beginners · sparring'],
      ['weapon', 'Beginner bo staff', 'Beginners · weapon'],
      ['form', 'Songahm 3B', 'Beginners · form'],
      ['one_step', 'One-step self-defense', 'Beginners · one-step'],
      ['board_break', 'One board, your options', 'Beginners · board break'],
      ['stripe', 'White stripe kicks', 'Beginners · stripe'],
    ]);
  }
  if (level === 'intermediate') {
    return themed(level, cycleNo, theme, [
      ['sparring', 'Sliding side, round kick, reverse side', 'Intermediate · sparring'],
      ['weapon', 'Bo staff, partial', 'Intermediate · weapon'],
      ['form', 'Inwha 1B', 'Intermediate · form'],
      ['one_step', 'One-step self-defense', 'Intermediate · one-step'],
      ['board_break', 'One board, your options', 'Intermediate · board break'],
      ['stripe', 'Blue stripe bo staff', 'Intermediate · stripe'],
    ]);
  }
  if (level === 'advanced') {
    return themed(level, cycleNo, theme, [
      ['sparring', 'Advanced sparring combo', 'Advanced · sparring'],
      ['weapon', 'Bo staff', 'Advanced · weapon'],
      ['form', 'Choong Jung 2B', 'Advanced · form'],
      ['one_step', 'One-step self-defense', 'Advanced · one-step'],
      ['board_break', 'One board, your options', 'Advanced · board break'],
      ['stripe', 'Red stripe traditional form', 'Advanced · stripe'],
    ]);
  }
  if (level === 'black_belt') {
    return [
      lesson(level, cycleNo, 1, 'form', 'Shim Jun', 'Black Belt · 1st dan form', false),
      lesson(level, cycleNo, 2, 'form', 'Jung Yul', 'Black Belt · 2nd dan form', false),
      lesson(level, cycleNo, 3, 'form', 'Chung Jung', 'Black Belt · 3rd dan form', false),
      lesson(level, cycleNo, 4, 'weapon', 'Black belt weapons', 'Black Belt · weapons', false),
      lesson(level, cycleNo, 5, 'sparring', 'Black belt sparring', 'Black Belt · sparring', false),
      lesson(level, cycleNo, 6, 'one_step', 'Black belt one-step', 'Black Belt · one-step', false),
      lesson(level, cycleNo, 7, 'board_break', 'Board breaks', 'Black Belt · board break', false),
    ];
  }
  if (level === 'legacy') {
    return [
      lesson(level, cycleNo, 1, 'form', 'Legacy Songahm 1–5', 'Legacy · forms', false),
      lesson(level, cycleNo, 2, 'form', 'Legacy In Wha 1–2', 'Legacy · forms', false),
      lesson(level, cycleNo, 3, 'form', 'Legacy Choong Jung 1–2', 'Legacy · forms', false),
      lesson(level, cycleNo, 4, 'one_step', 'Legacy one-step', 'Legacy · one-step', false),
      lesson(level, cycleNo, 5, 'weapon', 'Legacy weapons', 'Legacy · weapon', false),
    ];
  }
  if (level === 'go_ninja') {
    return themed(level, cycleNo, theme, [
      ['kick', 'Movement circuit', 'Movement Academy'],
      ['form', 'Level flow', 'Movement Academy'],
      ['sparring', 'Partner challenge', 'Movement Academy'],
      ['board_break', 'Skill station', 'Movement Academy'],
    ], true);
  }
  return [];
}

const OVERLAY_LEVEL: Record<string, CurriculumLevel> = {
  legacy: 'legacy',
  competition: 'advanced',
  xma: 'advanced',
  go_ninja: 'go_ninja',
};

export function curriculumForRank(input: {
  program: string;
  rank: string;
  asOf?: string;
  locationId?: string | null;
  overlays?: Array<'legacy' | 'competition' | 'xma' | 'go_ninja'>;
}): MemberCurriculum | null {
  const resolved = resolveRank(input.program, input.rank);
  if (!resolved?.rank || !resolved.curriculumLevel) return null;
  const cycle = activeCycle(input.asOf || '2026-11-24');
  const primary = resolved.curriculumLevel;
  const sections: CurriculumSection[] = [{
    level: primary,
    sample: primary === 'mini_tigers' || primary === 'go_ninja',
    overlay: false,
    lessons: lessonsFor(primary, cycle.cycleNo, cycle.theme),
  }];
  for (const overlay of input.overlays || []) {
    const level = OVERLAY_LEVEL[overlay];
    if (!level || level === primary) continue;
    sections.push({
      level,
      sample: level === 'go_ninja',
      overlay: true,
      lessons: overlay === 'xma'
        ? [lesson(level, cycle.cycleNo, 1, 'weapon', 'Creative weapons', 'XMA · overlay', false)]
        : overlay === 'competition'
          ? [lesson(level, cycle.cycleNo, 1, 'form', 'Competition forms and weapons', 'Competition · overlay', false)]
          : lessonsFor(level, cycle.cycleNo, cycle.theme),
    });
  }
  return {
    inputProgram: input.program,
    rank: resolved.rank,
    curriculumLevel: primary,
    cycle,
    sessionsRequired: sessionsFor(resolved.rank, input.locationId),
    stripeSteps: stripeStepsFor(resolved.rank),
    degree: degreeRequirementFor(resolved.rank.canonicalId),
    sections,
  };
}
