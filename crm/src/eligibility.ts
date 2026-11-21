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
