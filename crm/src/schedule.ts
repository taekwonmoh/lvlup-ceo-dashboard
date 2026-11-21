/** Map the live scheduler snapshot into CRM rows and add up hours. No Firebase writes. */

export type ShiftInput = { start: string; end: string; loc: string; role?: string | null };
export type TimeOffInput = {
  id: string;
  empId: string;
  start: string;
  end: string;
  type: 'pto' | 'unpaid';
  status: 'pending' | 'approved' | 'denied';
  note?: string;
};
export type PunchInput = { inAt?: number | null; outAt?: number | null; inLoc?: string | null };

export type ScheduleExport = {
  clockStaffId: string;
  schedule: Record<string, Record<string, ShiftInput>>;
  timeoff?: TimeOffInput[];
  entries?: Record<string, Record<string, PunchInput>>;
  published?: Record<string, { publishedAt: number; label?: string }>;
};

export function shiftMinutes(start: string, end: string) {
  const p = (t: string) => {
    const a = t.split(':');
    return (parseInt(a[0], 10) || 0) * 60 + (parseInt(a[1], 10) || 0);
  };
  let m = p(end) - p(start);
  if (m < 0) m += 1440;
  return m;
}

export function shiftsFromFirebase(exp: ScheduleExport) {
  const shifts = [];
  for (const [date, day] of Object.entries(exp.schedule || {})) {
    for (const [sid, sh] of Object.entries(day || {})) {
      shifts.push({
        clockStaffId: exp.clockStaffId,
        locationId: sh.loc,
        shiftDate: date,
        startLocal: sh.start.length === 5 ? sh.start : sh.start.padStart(5, '0'),
        endLocal: sh.end,
        role: sh.role || null,
        firebaseShiftId: sid,
        minutes: shiftMinutes(sh.start, sh.end),
      });
    }
  }
  return shifts;
}

export function timeOffFromFirebase(exp: ScheduleExport) {
  return (exp.timeoff || []).map(t => ({
    clockStaffId: t.empId,
    startOn: t.start,
    endOn: t.end,
    kind: t.type,
    status: t.status,
    note: t.note || null,
    firebaseId: t.id,
  }));
}

export function punchesFromFirebase(exp: ScheduleExport) {
  const rows = [];
  for (const [date, day] of Object.entries(exp.entries || {})) {
    for (const [eid, en] of Object.entries(day || {})) {
      rows.push({
        clockStaffId: exp.clockStaffId,
        locationId: en.inLoc || null,
        punchDate: date,
        inAt: en.inAt ? new Date(en.inAt).toISOString() : null,
        outAt: en.outAt ? new Date(en.outAt).toISOString() : null,
        firebaseEntryId: eid,
        minutes: en.inAt && en.outAt ? Math.round((en.outAt - en.inAt) / 60000) : 0,
      });
    }
  }
  return rows;
}

export function scheduledMinutes(shifts: { minutes: number }[]) {
  return shifts.reduce((s, sh) => s + sh.minutes, 0);
}

/**
 * Pay hours are punched clock-in to clock-out.
 * Scheduled shift length is returned only so a screen can compare the two.
 */
export function payHours(punches: { minutes: number }[], shifts: { minutes: number }[] = []) {
  const payMinutes = punches.reduce((s, p) => s + (p.minutes || 0), 0);
  const scheduled = scheduledMinutes(shifts);
  return {
    payMinutes,
    scheduledMinutes: scheduled,
    source: 'punches' as const,
  };
}

export function shiftOnApprovedTimeOff(shiftDate: string, timeOff: { startOn: string; endOn: string; status: string }[]) {
  return timeOff.some(t => t.status === 'approved' && shiftDate >= t.startOn && shiftDate <= t.endOn);
}
