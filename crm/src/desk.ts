/**
 * Front-desk task sheets and clock-in payroll preview.
 * Nothing here is sent to QuickBooks. Charged stays false.
 */
import { assertStaff, type Actor } from './auth.ts';
import { findCardPayload } from './charge-gate.ts';
import { chicagoToday } from './dates.ts';
import { CrmError } from './errors.ts';
import { assertQboOffline, type QboEnv } from './qbo.ts';
import { LOCATION_NAMES } from './pro-shop.ts';

export type DeskPhase = 'opening' | 'mid' | 'closing';

export type DeskTask = {
  id: string;
  phase: DeskPhase;
  title: string;
};

export const DESK_PHASES: Array<{ id: DeskPhase; title: string }> = [
  { id: 'opening', title: 'Opening' },
  { id: 'mid', title: 'Mid-Shift' },
  { id: 'closing', title: 'Closing' },
];

export const DESK_TASKS: DeskTask[] = [
  { id: 'open-door', phase: 'opening', title: 'Unlock the front door and turn on the lights' },
  { id: 'open-computer', phase: 'opening', title: 'Start the front desk computer' },
  { id: 'open-pickup', phase: 'opening', title: 'Check the Pro Shop pickup shelf' },
  { id: 'open-roster', phase: 'opening', title: 'Review today\'s class roster' },
  { id: 'open-sheet', phase: 'opening', title: 'Set out the sign-in sheet' },
  { id: 'open-walk', phase: 'opening', title: 'Walk the lobby and the mats' },
  { id: 'mid-stock', phase: 'mid', title: 'Restock the front desk' },
  { id: 'mid-wipe', phase: 'mid', title: 'Wipe the check-in counter' },
  { id: 'mid-roster', phase: 'mid', title: 'Confirm the next class roster' },
  { id: 'mid-lost', phase: 'mid', title: 'Check the lost-and-found bin' },
  { id: 'mid-towels', phase: 'mid', title: 'Refill paper towels' },
  { id: 'mid-billing', phase: 'mid', title: 'Note billing alerts for the lead' },
  { id: 'close-cabinet', phase: 'closing', title: 'Lock the Pro Shop cabinet' },
  { id: 'close-trash', phase: 'closing', title: 'Empty the front desk trash' },
  { id: 'close-lights', phase: 'closing', title: 'Turn off the lobby lights' },
  { id: 'close-lockset', phase: 'closing', title: 'Confirm the door is set to lock' },
  { id: 'close-note', phase: 'closing', title: 'Write the next-shift note' },
  { id: 'close-door', phase: 'closing', title: 'Lock the front door' },
];

export type DeskEnv = QboEnv & { BILLING_CHARGES_ENABLED?: string };

const PHASES = new Set<DeskPhase>(['opening', 'mid', 'closing']);

function rejectUnsafe(body: Record<string, unknown>) {
  if (findCardPayload(body)) throw new CrmError(400, 'card_not_allowed', 'Card numbers are not accepted.');
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/phone|sms|^tel$/i.test(key)) throw new CrmError(400, 'contact_not_allowed', 'This form does not take a phone number.');
      walk(child);
    }
  };
  walk(body);
}

export function assertDeskSchool(id: string) {
  if (!LOCATION_NAMES[id]) throw new CrmError(400, 'bad_location', 'Pick a school.');
  return id;
}

export function deskSheet(locationId: string) {
  const school = assertDeskSchool(locationId);
  return {
    locationId: school,
    locationName: LOCATION_NAMES[school],
    phases: DESK_PHASES,
    tasks: DESK_TASKS,
    charges: false as const,
    qbo: '0' as const,
    persisted: false as const,
  };
}

export function phaseProgress(tasks: DeskTask[], doneIds: string[]) {
  const done = new Set(doneIds);
  return DESK_PHASES.map(phase => {
    const rows = tasks.filter(task => task.phase === phase.id);
    const complete = rows.filter(task => done.has(task.id)).length;
    return {
      id: phase.id,
      title: phase.title,
      done: complete,
      total: rows.length,
      label: complete + ' of ' + rows.length + ' complete',
    };
  });
}

export function cleanInitials(value: unknown) {
  const initials = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{1,4}$/.test(initials)) throw new CrmError(400, 'bad_initials', 'Add 1 to 4 initials.');
  return initials;
}

export function cleanTaskTitle(value: unknown) {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  if (title.length < 2 || title.length > 80) throw new CrmError(400, 'bad_task', 'Name the task in a short sentence.');
  if (/tel:|sms:|\d{10,}/i.test(title)) throw new CrmError(400, 'bad_task', 'Name the task in a short sentence.');
  return title;
}

export function payPeriod(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new CrmError(400, 'bad_date', 'Use a calendar date.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new CrmError(400, 'bad_date', 'Use a calendar date.');
  const pad = (n: number) => String(n).padStart(2, '0');
  if (day <= 15) {
    return { start: `${match[1]}-${match[2]}-01`, end: `${match[1]}-${match[2]}-15` };
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${match[1]}-${match[2]}-16`, end: `${match[1]}-${match[2]}-${pad(last)}` };
}

export type ClockPunch = {
  locationId: string;
  initials: string;
  inAt: string;
  outAt: string | null;
  onBreak: boolean;
  breakStartedAt: string | null;
  breakMinutes: number;
};

function parseInstant(value: unknown, label: string) {
  const text = String(value || '');
  const ms = Date.parse(text);
  if (!text || Number.isNaN(ms)) throw new CrmError(400, 'bad_time', label);
  return new Date(ms).toISOString();
}

export function clockMinutes(punch: ClockPunch, nowMs: number) {
  const start = Date.parse(punch.inAt);
  const end = punch.outAt ? Date.parse(punch.outAt) : nowMs;
  let breakMs = Math.max(0, Number(punch.breakMinutes) || 0) * 60_000;
  if (punch.onBreak && punch.breakStartedAt) breakMs += Math.max(0, nowMs - Date.parse(punch.breakStartedAt));
  return Math.max(0, Math.round((end - start - breakMs) / 60_000));
}

export function applyClock(punch: ClockPunch | null, action: string, locationId: string, initials: string, atIso: string): ClockPunch {
  const at = parseInstant(atIso, 'Add a time.');
  if (action === 'in') {
    if (punch && !punch.outAt) throw new CrmError(409, 'already_in', 'Clock out before starting another shift.');
    return {
      locationId,
      initials,
      inAt: at,
      outAt: null,
      onBreak: false,
      breakStartedAt: null,
      breakMinutes: 0,
    };
  }
  if (!punch || punch.outAt) throw new CrmError(409, 'not_in', 'Clock in first.');
  if (action === 'out') {
    if (punch.onBreak && punch.breakStartedAt) {
      const extra = Math.max(0, Math.round((Date.parse(at) - Date.parse(punch.breakStartedAt)) / 60_000));
      punch = { ...punch, onBreak: false, breakStartedAt: null, breakMinutes: punch.breakMinutes + extra };
    }
    return { ...punch, outAt: at, onBreak: false, breakStartedAt: null };
  }
  if (action === 'break_start') {
    if (punch.onBreak) throw new CrmError(409, 'on_break', 'You are already on break.');
    return { ...punch, onBreak: true, breakStartedAt: at };
  }
  if (action === 'break_end') {
    if (!punch.onBreak || !punch.breakStartedAt) throw new CrmError(409, 'not_on_break', 'You are not on break.');
    const extra = Math.max(0, Math.round((Date.parse(at) - Date.parse(punch.breakStartedAt)) / 60_000));
    return { ...punch, onBreak: false, breakStartedAt: null, breakMinutes: punch.breakMinutes + extra };
  }
  throw new CrmError(400, 'bad_action', 'Choose clock in, clock out, or break.');
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

export function payrollCsv(rows: Array<{ date: string; initials: string; school: string; inAt: string; outAt: string; breakMinutes: number; hours: string }>) {
  const header = 'Date,Initials,School,Clock in,Clock out,Break minutes,Hours,Memo';
  const memo = 'Dry-run preview. QuickBooks was not updated.';
  const lines = rows.map(row => [row.date, row.initials, row.school, row.inAt, row.outAt, String(row.breakMinutes), row.hours, memo].map(csvCell).join(','));
  return [header, ...lines].join('\n') + '\n';
}

type PayrollRow = {
  date?: unknown;
  initials?: unknown;
  locationId?: unknown;
  inAt?: unknown;
  outAt?: unknown;
  breakMinutes?: unknown;
};

export function buildPayroll(locationId: string, rows: PayrollRow[], asOf: string, env: DeskEnv) {
  assertQboOffline(env);
  if (env.BILLING_CHARGES_ENABLED === '1') throw new CrmError(403, 'charges_disabled', 'Charging is off.');
  const school = assertDeskSchool(locationId);
  const period = payPeriod(asOf);
  const built = [];
  for (const row of rows) {
    const date = String(row.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < period.start || date > period.end) continue;
    if (String(row.locationId || school) !== school) continue;
    const initials = cleanInitials(row.initials);
    const inAt = parseInstant(row.inAt, 'Add a clock-in time.');
    const outAt = parseInstant(row.outAt, 'Add a clock-out time.');
    const breakMinutes = Math.max(0, Math.round(Number(row.breakMinutes) || 0));
    const minutes = clockMinutes({
      locationId: school,
      initials,
      inAt,
      outAt,
      onBreak: false,
      breakStartedAt: null,
      breakMinutes,
    }, Date.parse(outAt));
    const hours = (minutes / 60).toFixed(2);
    built.push({
      date,
      initials,
      school: LOCATION_NAMES[school],
      inAt,
      outAt,
      breakMinutes,
      hours,
    });
  }
  return {
    csv: payrollCsv(built),
    rows: built,
    period,
    submitted: false as const,
    charged: false as const,
    qbo: '0' as const,
    dryRun: true as const,
  };
}

export function handleDesk(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor;
  body: Record<string, unknown>;
  env: DeskEnv;
  now?: Date;
}): { status: number; body: unknown } {
  assertStaff(input.actor);
  rejectUnsafe(input.body);
  const now = input.now || new Date();
  const { method, parts, search, body, env } = input;
  if (method === 'GET' && parts[2] === 'tasks' && parts.length === 3) {
    const locationId = assertDeskSchool(search.get('locationId') || '');
    const sheet = deskSheet(locationId);
    return { status: 200, body: { ...sheet, progress: phaseProgress(sheet.tasks, []) } };
  }
  if (method === 'POST' && parts[2] === 'tasks' && parts.length === 3) {
    const locationId = assertDeskSchool(String(body.locationId || ''));
    const initials = cleanInitials(body.initials);
    const at = new Date(now).toISOString();
    if (body.action === 'add') {
      const phase = String(body.phase || '');
      if (!PHASES.has(phase as DeskPhase)) throw new CrmError(400, 'bad_phase', 'Pick Opening, Mid-Shift, or Closing.');
      return {
        status: 201,
        body: {
          id: 'extra-' + createTaskId(body.title, at),
          locationId,
          phase,
          title: cleanTaskTitle(body.title),
          oneOff: true,
          initials,
          at,
          charges: false,
          qbo: '0',
          persisted: false,
        },
      };
    }
    if (body.action === 'complete' || body.action === 'reopen') {
      const taskId = String(body.taskId || '');
      const known = DESK_TASKS.some(task => task.id === taskId) || /^extra-[a-z0-9-]{6,40}$/i.test(taskId);
      if (!known) throw new CrmError(404, 'not_found', 'That task is not on this sheet.');
      return {
        status: 200,
        body: {
          taskId,
          locationId,
          done: body.action === 'complete',
          initials,
          at,
          charges: false,
          qbo: '0',
          persisted: false,
        },
      };
    }
    throw new CrmError(400, 'bad_action', 'Complete a task or add a one-off.');
  }
  if (method === 'POST' && parts[2] === 'clock' && parts.length === 3) {
    const locationId = assertDeskSchool(String(body.locationId || ''));
    const initials = cleanInitials(body.initials);
    const current = body.punch && typeof body.punch === 'object' ? body.punch as ClockPunch : null;
    const punch = applyClock(current, String(body.action || ''), locationId, initials, String(body.at || now.toISOString()));
    return {
      status: 200,
      body: {
        punch,
        minutes: clockMinutes(punch, now.getTime()),
        charges: false,
        qbo: '0',
        persisted: false,
      },
    };
  }
  if (method === 'POST' && parts[2] === 'payroll' && parts[3] === 'preview' && parts.length === 4) {
    const rows = Array.isArray(body.rows) ? body.rows as PayrollRow[] : [];
    const asOf = String(body.asOf || chicagoToday(now));
    const preview = buildPayroll(String(body.locationId || ''), rows, asOf, env);
    return { status: 200, body: preview };
  }
  return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
}

function createTaskId(title: unknown, at: string) {
  const slug = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  return (slug || 'task') + '-' + at.slice(11, 19).replace(/:/g, '');
}
