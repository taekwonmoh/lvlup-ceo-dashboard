/** ATA testing eligibility. The numbers come from rank_requirements, not from this file. */

export type RankRule = {
  minClasses: number;
  minDaysInRank: number;
  requiresInstructorSignoff: boolean;
};

export type Eligibility = {
  eligible: boolean;
  classesAttended: number;
  classesRequired: number;
  daysInRank: number;
  daysRequired: number;
  signedOff: boolean;
  signoffRequired: boolean;
  reasons: string[];
};

export function daysBetween(from: string, to: string) {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

export function testingEligibility(input: {
  rule: RankRule;
  classesAttended: number;
  rankAwardedOn: string;
  asOf: string;
  signedOff: boolean;
}): Eligibility {
  const daysInRank = Math.max(0, daysBetween(input.rankAwardedOn, input.asOf));
  const reasons: string[] = [];
  if (input.classesAttended < input.rule.minClasses) reasons.push('classes');
  if (daysInRank < input.rule.minDaysInRank) reasons.push('time_in_rank');
  if (input.rule.requiresInstructorSignoff && !input.signedOff) reasons.push('signoff');
  return {
    eligible: reasons.length === 0,
    classesAttended: input.classesAttended,
    classesRequired: input.rule.minClasses,
    daysInRank,
    daysRequired: input.rule.minDaysInRank,
    signedOff: input.signedOff,
    signoffRequired: input.rule.requiresInstructorSignoff,
    reasons,
  };
}

/** One attendance row counts toward every program attached to that session. */
export function programsCredited(programs: string[]): string[] {
  const seen = new Set<string>();
  for (const code of programs) {
    const trimmed = String(code || '').trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

export function attendanceCountsFor(programs: string[], targetProgram: string): boolean {
  return programsCredited(programs).includes(targetProgram);
}

export function classCountForProgram(rows: Array<{ programs: string[] }>, targetProgram: string): number {
  return rows.filter(row => attendanceCountsFor(row.programs, targetProgram)).length;
}

/** Seat count stays on the session. Extra programs do not add seats. */
export function sessionSeatCapacity(capacity: number): number {
  return capacity;
}
