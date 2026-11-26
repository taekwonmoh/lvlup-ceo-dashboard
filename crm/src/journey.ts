/**
 * Belt and career paths.
 * Belt names come from ranks.ts (the catalog seeded in migration 005 / PR 62).
 * This file does not invent belt names.
 * Instructor, Master, and School Owner criteria that are not in that catalog
 * are flagged needsSignoff so Mike can fill them in the career_milestones table.
 */
import {
  degreeRequirementFor,
  rankById,
  ranksForProgram,
  stripeStepsFor,
  type RankDef,
} from './ranks.ts';

const PROGRAM_JUMPS: Record<string, string> = {
  'mini_tiger.baron': 'tiger.white',
  'tiger.baron': 'songahm.white',
};

export type RoadStep = {
  canonicalId: string;
  name: string;
  program: string;
  via: 'start' | 'next' | 'program_transition';
};

export function martialRoadmap(): RoadStep[] {
  const steps: RoadStep[] = [];
  const push = (program: string, viaFirst: RoadStep['via']) => {
    const ranks = ranksForProgram(program);
    ranks.forEach((rank, index) => {
      steps.push({
        canonicalId: rank.canonicalId,
        name: rank.name,
        program,
        via: index === 0 ? viaFirst : 'next',
      });
    });
  };
  push('mini_tiger', 'start');
  push('tiger', 'program_transition');
  push('songahm', 'program_transition');
  return steps;
}

export function nextBelt(canonicalId: string): { rank: RankDef; via: 'next' | 'program_transition' } | null {
  const jump = PROGRAM_JUMPS[canonicalId];
  if (jump) {
    const rank = rankById(jump);
    if (!rank) return null;
    return { rank, via: 'program_transition' };
  }
  const current = rankById(canonicalId);
  if (!current) return null;
  const ladder = ranksForProgram(current.program);
  const index = ladder.findIndex(rank => rank.canonicalId === canonicalId);
  if (index < 0 || index >= ladder.length - 1) return null;
  return { rank: ladder[index + 1], via: 'next' };
}

export type CareerMilestone = {
  id: string;
  pathwayCode: string;
  sortOrder: number;
  title: string;
  needsSignoff: boolean;
  minAge: number | null;
  minRankCanonicalId: string | null;
  minClasses: number | null;
  minYears: number | null;
  note: string;
};

export type CareerPathway = {
  code: string;
  title: string;
  needsSignoff: boolean;
  note: string;
  milestones: CareerMilestone[];
};

const LEGACY = ranksForProgram('legacy');
const COLLARS = ranksForProgram('ata_instructor');

/** Rows Mike can edit in career_milestones. Belt names are not rewritten here. */
export function careerPathways(): CareerPathway[] {
  return [
    {
      code: 'legacy_leadership',
      title: 'LVLUP Legacy',
      needsSignoff: true,
      note: 'These nine titles are the Legacy program already in the rank catalog. Class counts are not in that catalog. Confirm this is the Leadership track before anyone is promoted on it.',
      milestones: LEGACY.map((rank, index) => ({
        id: rank.canonicalId,
        pathwayCode: 'legacy_leadership',
        sortOrder: index + 1,
        title: rank.name,
        needsSignoff: true,
        minAge: null,
        minRankCanonicalId: rank.canonicalId,
        minClasses: null,
        minYears: null,
        note: 'Name is from the catalog. Classes, time in rank, and age are not. Leave them blank until Mike sets them.',
      })),
    },
    {
      code: 'ata_instructor',
      title: 'ATA Instructor Certification',
      needsSignoff: true,
      note: 'Collar names and minimum ages are in the catalog. Junior Instructor and Certified Instructor are not rank names in that file. Map those titles here before they are shown as earned ranks.',
      milestones: COLLARS.map((rank, index) => ({
        id: rank.canonicalId,
        pathwayCode: 'ata_instructor',
        sortOrder: index + 1,
        title: rank.name,
        needsSignoff: true,
        minAge: rank.minAge,
        minRankCanonicalId: rank.canonicalId,
        minClasses: null,
        minYears: null,
        note: 'Minimum age is from the catalog. Class and time-in-rank requirements are not.',
      })),
    },
    {
      code: 'master',
      title: 'Master',
      needsSignoff: true,
      note: 'The belt catalog ends at 9th Degree Black Belt. It does not define a separate Master rank.',
      milestones: [{
        id: 'master',
        pathwayCode: 'master',
        sortOrder: 1,
        title: 'Master',
        needsSignoff: true,
        minAge: null,
        minRankCanonicalId: 'songahm.bb9',
        minClasses: null,
        minYears: null,
        note: 'Suggested link is 9th Degree only so the roadmap can point at the last catalog belt. Mike sets the real Master rule.',
      }],
    },
    {
      code: 'school_owner',
      title: 'School Owner',
      needsSignoff: true,
      note: 'The rank catalog has no School Owner rank.',
      milestones: [{
        id: 'school_owner',
        pathwayCode: 'school_owner',
        sortOrder: 1,
        title: 'School Owner',
        needsSignoff: true,
        minAge: null,
        minRankCanonicalId: null,
        minClasses: null,
        minYears: null,
        note: 'Rank, age, classes, and time in rank are unset until Mike writes them on this row.',
      }],
    },
  ];
}

export const PROPOSED_TITLES = [
  {
    title: 'Leadership',
    milestoneId: 'legacy.l1',
    needsSignoff: true,
    note: 'Proposed label. The catalog name at this step is Level 1 - Connector. Confirm or replace the mapping.',
  },
  {
    title: 'Junior Instructor',
    milestoneId: null,
    needsSignoff: true,
    note: 'Not a rank name in the catalog. Map it to a collar or a Legacy level before it is used.',
  },
  {
    title: 'Certified Instructor',
    milestoneId: null,
    needsSignoff: true,
    note: 'Not a rank name in the catalog. Map it to a collar before it is used.',
  },
];

export function pathAhead(currentId: string | null) {
  const roadmap = martialRoadmap();
  const index = currentId ? roadmap.findIndex(step => step.canonicalId === currentId) : -1;
  const rank = currentId ? rankById(currentId) : null;
  const upcoming = nextBelt(currentId || '');
  return {
    current: rank
      ? {
          canonicalId: rank.canonicalId,
          name: rank.name,
          program: rank.program,
          stripes: stripeStepsFor(rank).map(step => ({
            name: step.name,
            sortOrder: step.sortOrder,
            credits: step.credits,
            optional: step.optional,
          })),
        }
      : null,
    next: currentId && upcoming
      ? {
          canonicalId: upcoming.rank.canonicalId,
          name: upcoming.rank.name,
          program: upcoming.rank.program,
          via: upcoming.via,
        }
      : null,
    degreeRequirement: currentId ? degreeRequirementFor(currentId) : null,
    roadmap: roadmap.map((step, stepIndex) => ({
      ...step,
      state: index < 0 ? 'unplaced' : stepIndex < index ? 'completed' : stepIndex === index ? 'current' : 'ahead',
    })),
    pathways: careerPathways(),
    proposedTitles: PROPOSED_TITLES,
  };
}
