/** Instructor private-lesson profit share. Pure. Does not pay anyone. */

export type PayRule = {
  staffId: string;
  locationId: string | null;
  lessonType: string | null;
  percentBps: number;
  effectiveOn: string;
  endsOn: string | null;
};

export type TaughtLesson = {
  staffId: string;
  staffName: string;
  locationId: string;
  lessonType: string;
  on: string;
  priceCents: number;
  paid: boolean;
  status: string;
  durationMin: number;
};

export function ruleFor(rules: PayRule[], lesson: { staffId: string; locationId: string; lessonType: string; on: string }) {
  const matching = rules.filter(rule => {
    if (rule.staffId !== lesson.staffId) return false;
    if (rule.effectiveOn > lesson.on) return false;
    if (rule.endsOn && rule.endsOn < lesson.on) return false;
    if (rule.locationId && rule.locationId !== lesson.locationId) return false;
    if (rule.lessonType && rule.lessonType !== lesson.lessonType) return false;
    return true;
  });
  matching.sort((a, b) => {
    const score = (rule: PayRule) => (rule.locationId ? 2 : 0) + (rule.lessonType ? 1 : 0);
    return score(b) - score(a) || b.effectiveOn.localeCompare(a.effectiveOn);
  });
  return matching[0] || null;
}

export function shareCents(priceCents: number, percentBps: number) {
  return Math.round(priceCents * percentBps / 10000);
}

export type PayoutCompany = {
  companyId: string;
  legalName: string;
  lessonCount: number;
  revenueCents: number;
  unpaidCents: number;
  shareCents: number;
};

export type PayoutRow = {
  staffId: string;
  staffName: string;
  taughtMinutes: number;
  clockMinutes: number;
  totalMinutes: number;
  shareCents: number;
  companies: PayoutCompany[];
};

export function payoutReport(input: {
  lessons: TaughtLesson[];
  rules: PayRule[];
  clockMinutes: { staffId: string; minutes: number }[];
  companyFor: (locationId: string) => { id: string; legalName: string };
}): PayoutRow[] {
  const byStaff = new Map<string, PayoutRow>();
  const ensure = (lesson: { staffId: string; staffName: string }) => {
    let row = byStaff.get(lesson.staffId);
    if (!row) {
      row = {
        staffId: lesson.staffId,
        staffName: lesson.staffName,
        taughtMinutes: 0,
        clockMinutes: 0,
        totalMinutes: 0,
        shareCents: 0,
        companies: [],
      };
      byStaff.set(lesson.staffId, row);
    }
    return row;
  };
  for (const lesson of input.lessons) {
    if (lesson.status !== 'taught') continue;
    const row = ensure(lesson);
    row.taughtMinutes += lesson.durationMin;
    const company = input.companyFor(lesson.locationId);
    let bucket = row.companies.find(c => c.companyId === company.id);
    if (!bucket) {
      bucket = {
        companyId: company.id,
        legalName: company.legalName,
        lessonCount: 0,
        revenueCents: 0,
        unpaidCents: 0,
        shareCents: 0,
      };
      row.companies.push(bucket);
    }
    bucket.lessonCount += 1;
    if (!lesson.paid) {
      bucket.unpaidCents += lesson.priceCents;
      continue;
    }
    const rule = ruleFor(input.rules, lesson);
    const share = rule ? shareCents(lesson.priceCents, rule.percentBps) : 0;
    bucket.revenueCents += lesson.priceCents;
    bucket.shareCents += share;
    row.shareCents += share;
  }
  for (const clock of input.clockMinutes) {
    const row = byStaff.get(clock.staffId);
    if (!row) continue;
    row.clockMinutes += clock.minutes;
  }
  for (const row of byStaff.values()) row.totalMinutes = row.taughtMinutes + row.clockMinutes;
  return [...byStaff.values()].sort((a, b) => a.staffName.localeCompare(b.staffName));
}
