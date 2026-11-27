/**
 * Staff studio tools: owner pulse, miss-you queue, testing readiness,
 * lobby QR payloads, and curriculum quizzes.
 * Numbers are sandbox fixtures. Nothing here sends a message or charges a card.
 * Belt testing is included with tuition. The fee is always $0.
 */
import catalog from '../fixtures/studio-ops.json' with { type: 'json' };
import { assertStaff, type Actor } from './auth.ts';
import { gridFromRows, participationCsv, participationReport, signupTracker } from './testing-participation.ts';
import { findCardPayload } from './charge-gate.ts';
import { CrmError } from './errors.ts';
import type { SqlPool } from './query.ts';

export type StudioSchool = {
  id: string;
  brand: 'lvlup' | 'goninja';
  name: string;
  short: string;
  qr: string;
  active: number;
  trials: number;
  attendance: number;
  collectedCents: number;
  draftsCents: number;
};

export type StudioPerson = {
  id: string;
  first: string;
  last: string;
  role: 'student' | 'lead';
  status: 'active' | 'lead';
  program: string;
  belt: string;
  school: string;
  plan: string;
  classes: number;
  classesNeed: number;
  rankAwardedOn: string;
  daysNeed: number;
  lastCheckIn: string;
  stripes: number;
  stripesNeed: number;
};

export type QuizQuestion = { id: string; prompt: string; choices: string[]; answer: number };
export type StudioQuiz = {
  id: string;
  program: string;
  belt: string;
  cycle: string;
  title: string;
  questions: QuizQuestion[];
};

type Catalog = {
  passPct: number;
  feeModel: 'included_2027';
  beltTestFeeCents: 0;
  schools: StudioSchool[];
  people: StudioPerson[];
  quizzes: StudioQuiz[];
  attempts: Array<{ id: string; personId: string; quizId: string; scorePct: number; passed: boolean; takenOn: string }>;
};

const DATA = catalog as Catalog;

export const STUDIO_SCHOOLS = DATA.schools;
export const STUDIO_PEOPLE = DATA.people;
export const STUDIO_QUIZZES = DATA.quizzes;
export const STUDIO_ATTEMPTS = DATA.attempts;
export const PASS_PCT = DATA.passPct;

const SCHOOL_BY_ID = new Map(STUDIO_SCHOOLS.map(school => [school.id, school]));
const SCHOOL_BY_QR = new Map(STUDIO_SCHOOLS.map(school => [school.qr, school]));
const PEOPLE_BY_ID = new Map(STUDIO_PEOPLE.map(person => [person.id, person]));

const FEE = {
  beltTestFeeCents: 0 as const,
  feeModel: 'included_2027' as const,
  feeLabel: 'Included with tuition',
};

const OFF = { charges: false as const, sends: false as const, sent: false as const };

export type RetentionStatus = { status: 'open' | 'snoozed' | 'resolved'; snoozeUntil?: string };
export type RetentionState = Record<string, RetentionStatus>;

export function daysBetween(from: string, to: string) {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function addDays(iso: string, count: number) {
  const next = new Date(Date.parse(iso + 'T00:00:00Z') + count * 86400000);
  return next.toISOString().slice(0, 10);
}

export function schoolById(id: string) {
  return SCHOOL_BY_ID.get(id) || null;
}

export function personById(id: string) {
  return PEOPLE_BY_ID.get(id) || null;
}

function assertDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z'))) {
    throw new CrmError(400, 'bad_date', 'Use a calendar date.');
  }
  return value;
}

export function assertStudioSchool(id: string) {
  const school = schoolById(id);
  if (!school) throw new CrmError(400, 'bad_location', 'Pick a school.');
  return school;
}

function students() {
  return STUDIO_PEOPLE.filter(person => person.role === 'student' && person.status === 'active');
}

export type ReadinessBand = 'ready' | 'almost' | 'needs_classes';

export function testingReadiness(person: StudioPerson, asOf: string) {
  const daysInRank = Math.max(0, daysBetween(person.rankAwardedOn, asOf));
  const classGap = Math.max(0, person.classesNeed - person.classes);
  const dayGap = Math.max(0, person.daysNeed - daysInRank);
  const band: ReadinessBand = classGap === 0 && dayGap === 0
    ? 'ready'
    : classGap <= 3 && dayGap <= 14
      ? 'almost'
      : 'needs_classes';
  return {
    band,
    classesAttended: person.classes,
    classesRequired: person.classesNeed,
    daysInRank,
    daysRequired: person.daysNeed,
    classGap,
    dayGap,
    ...FEE,
  };
}

export function missBand(daysOut: number): '21' | '14' | '7' | null {
  if (daysOut >= 21) return '21';
  if (daysOut >= 14) return '14';
  if (daysOut >= 7) return '7';
  return null;
}

function hidden(person: StudioPerson, asOf: string, states: RetentionState) {
  const state = states[person.id];
  if (!state || state.status === 'open') return false;
  if (state.status === 'resolved') return true;
  return !!state.snoozeUntil && state.snoozeUntil >= asOf;
}

export function ownerPulse(asOf: string, states: RetentionState = {}) {
  assertDate(asOf);
  const schools = STUDIO_SCHOOLS.map(school => {
    const rows = students().filter(person => person.school === school.id && !hidden(person, asOf, states));
    return {
      locationId: school.id,
      name: school.name,
      short: school.short,
      brand: school.brand,
      activeMembers: school.active,
      trialsThisWeek: school.trials,
      missedClassRisk: rows.filter(person => missBand(daysBetween(person.lastCheckIn, asOf))).length,
      readyToTest: rows.filter(person => testingReadiness(person, asOf).band === 'ready').length,
      attendanceToday: school.attendance,
      mtdCollectedCents: school.collectedCents,
      mtdDraftsCents: school.draftsCents,
      ...FEE,
    };
  });
  return { asOf, ...OFF, ...FEE, schools };
}

function personCard(person: StudioPerson, asOf: string) {
  const school = schoolById(person.school);
  const daysOut = Math.max(0, daysBetween(person.lastCheckIn, asOf));
  return {
    id: person.id,
    first: person.first,
    last: person.last,
    role: person.role,
    status: person.status,
    program: person.program,
    belt: person.belt,
    plan: person.plan,
    school: person.school,
    locationName: school ? school.name : person.school,
    lastCheckIn: person.lastCheckIn,
    daysOut,
    stripes: person.stripes,
    stripesNeed: person.stripesNeed,
  };
}

export function retentionQueue(asOf: string, states: RetentionState = {}) {
  assertDate(asOf);
  const bands = [
    { id: '21' as const, title: '21+ days', tone: 'urgent' },
    { id: '14' as const, title: '14+ days', tone: 'soon' },
    { id: '7' as const, title: '7+ days', tone: 'watch' },
  ];
  const groups = bands.map(band => {
    const rows = students()
      .filter(person => !hidden(person, asOf, states))
      .map(person => ({ person, daysOut: daysBetween(person.lastCheckIn, asOf) }))
      .filter(row => missBand(row.daysOut) === band.id)
      .sort((a, b) => b.daysOut - a.daysOut || a.person.first.localeCompare(b.person.first));
    const schools = STUDIO_SCHOOLS.map(school => ({
      locationId: school.id,
      name: school.name,
      people: rows.filter(row => row.person.school === school.id).map(row => ({
        ...personCard(row.person, asOf),
        band: band.id,
        daysOut: row.daysOut,
      })),
    })).filter(school => school.people.length > 0);
    return { ...band, count: rows.length, schools };
  });
  return {
    asOf,
    ...OFF,
    total: groups.reduce((sum, group) => sum + group.count, 0),
    template: 'We miss you',
    groups,
  };
}

export function testingBoard(asOf: string, marks: Record<string, string> = {}) {
  assertDate(asOf);
  const bands = [
    { id: 'ready' as const, title: 'Ready' },
    { id: 'almost' as const, title: 'Almost Ready' },
    { id: 'needs_classes' as const, title: 'Needs Classes' },
  ];
  const scored = students().map(person => ({
    ...personCard(person, asOf),
    ...testingReadiness(person, asOf),
    roster: marks[person.id] || '',
  }));
  return {
    asOf,
    ...OFF,
    ...FEE,
    bands: bands.map(band => ({
      ...band,
      people: scored.filter(person => person.band === band.id),
    })),
  };
}

export function qrPayload(kind: 'trial' | 'checkin' | 'checkout', locationId: string) {
  const school = assertStudioSchool(locationId);
  const tag = kind === 'trial' ? 'TRIAL' : kind === 'checkin' ? 'CHECKIN' : 'CHECKOUT';
  return `LVLUP:${tag}:${school.qr}:DEMO`;
}

export function qrBoard(locationId: string) {
  const school = assertStudioSchool(locationId);
  const codes = [
    { kind: 'trial' as const, title: 'Walk-In Trial', detail: 'Lobby sign-up code. It saves a trial interest. It does not send a message.' },
    { kind: 'checkin' as const, title: 'Fast Class Check-In', detail: 'Class check-in code for the front desk. It does not store a phone number.' },
    { kind: 'checkout' as const, title: 'Pro Shop and Event Checkout', detail: 'Parent checkout preview. Nothing is charged.' },
  ];
  return {
    locationId: school.id,
    locationName: school.name,
    ...OFF,
    codes: codes.map(code => ({
      ...code,
      payload: qrPayload(code.kind, school.id),
      charged: false as const,
      sent: false as const,
    })),
  };
}

const PAYLOAD_RE = /^LVLUP:(TRIAL|CHECKIN|CHECKOUT):(WAUNAKEE|EASTMAD|VERONA|DEFOREST|GNW|GNV):DEMO$/;

export function interpretQr(payload: string) {
  const text = String(payload || '').trim().toUpperCase();
  const match = PAYLOAD_RE.exec(text);
  if (!match) throw new CrmError(400, 'bad_code', 'That code is not a lobby code.');
  const kind = match[1] === 'TRIAL' ? 'trial' : match[1] === 'CHECKIN' ? 'checkin' : 'checkout';
  const school = SCHOOL_BY_QR.get(match[2]);
  if (!school) throw new CrmError(400, 'bad_code', 'That code is not a lobby code.');
  const message = kind === 'trial'
    ? `Trial interest saved for ${school.name}. No message was sent.`
    : kind === 'checkin'
      ? `Class check-in recorded for ${school.name}. No card was used.`
      : `Pro Shop and event checkout preview for ${school.name}. Nothing was charged.`;
  return {
    kind,
    locationId: school.id,
    locationName: school.name,
    payload: text,
    message,
    charged: false as const,
    ...OFF,
  };
}

export function quizBoard(extraQuestions: QuizQuestion[] = [], extraAttempts: Catalog['attempts'] = []) {
  const quizzes = STUDIO_QUIZZES.map(quiz => ({
    ...quiz,
    questions: quiz.questions.concat(extraQuestions.filter(question => question.id.startsWith(quiz.id + '-'))),
  }));
  const attempts = STUDIO_ATTEMPTS.concat(extraAttempts).map(attempt => {
    const person = personById(attempt.personId);
    const quiz = STUDIO_QUIZZES.find(row => row.id === attempt.quizId);
    return {
      ...attempt,
      personName: person ? person.first + ' ' + person.last : attempt.personId,
      quizTitle: quiz ? quiz.title : attempt.quizId,
      belt: quiz ? quiz.belt : '',
      program: quiz ? quiz.program : '',
    };
  });
  return { ...OFF, passPct: PASS_PCT, ...FEE, quizzes, attempts };
}

export function scoreAttempt(quizId: string, answers: number[], extra: QuizQuestion[] = []) {
  const quiz = STUDIO_QUIZZES.find(row => row.id === quizId);
  if (!quiz) throw new CrmError(404, 'not_found', 'That quiz is not on the list.');
  const questions = quiz.questions.concat(extra.filter(question => question.id.startsWith(quiz.id + '-')));
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    throw new CrmError(400, 'bad_answers', 'Answer every question.');
  }
  let correct = 0;
  questions.forEach((question, index) => {
    const choice = answers[index];
    if (!Number.isInteger(choice) || choice < 0 || choice >= question.choices.length) {
      throw new CrmError(400, 'bad_answers', 'Pick one of the choices.');
    }
    if (choice === question.answer) correct += 1;
  });
  const scorePct = Math.round((correct / questions.length) * 100);
  return {
    quizId,
    scorePct,
    passed: scorePct >= PASS_PCT,
    correct,
    total: questions.length,
    passPct: PASS_PCT,
    ...OFF,
  };
}

function cleanText(value: unknown, label: string, max: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > max) throw new CrmError(400, 'bad_text', label);
  if (/tel:|sms:|\d{10,}/i.test(text)) throw new CrmError(400, 'bad_text', label);
  return text;
}

export function draftBody(input: {
  channel: 'sms' | 'email' | 'call' | 'note';
  person: StudioPerson;
  locationName: string;
  note?: string;
}) {
  const who = input.person.first;
  const where = input.locationName;
  if (input.channel === 'sms') {
    return {
      templateId: 'miss_you_sms',
      body: `We miss you at ${where}. ${who}, your next class is waiting whenever you are ready.`,
    };
  }
  if (input.channel === 'email') {
    return {
      templateId: 'miss_you_email',
      body: `Subject: We miss you at ${where}\n\nHi ${who}, we miss you at class. Your spot is saved. This note is a draft and was not sent.`,
    };
  }
  if (input.channel === 'call') {
    return {
      templateId: 'call_log',
      body: `Call logged for ${input.person.first} ${input.person.last} at ${where}. Nothing was dialed.`,
    };
  }
  return {
    templateId: 'quick_note',
    body: cleanText(input.note, 'Write a short note.', 1000),
  };
}

export function testingInvite(person: StudioPerson, locationName: string) {
  return {
    templateId: 'testing_invite',
    channel: 'email' as const,
    body: `${person.first} is ready to test at ${locationName}. Belt testing is included with tuition. This invite was saved as a draft and was not sent.`,
    ...FEE,
    ...OFF,
  };
}

function rejectUnsafe(body: Record<string, unknown>) {
  if (findCardPayload(body)) throw new CrmError(400, 'card_not_allowed', 'Card numbers are not accepted.');
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/phone|sms|^tel$/i.test(key)) throw new CrmError(400, 'contact_not_allowed', 'This form does not take a phone number.');
      if (typeof child === 'string' && /tel:|sms:/i.test(child)) {
        throw new CrmError(400, 'contact_not_allowed', 'This form does not take a phone number.');
      }
      walk(child);
    }
  };
  walk(body);
}

function dbOptional(err: unknown) {
  const code = err && typeof err === 'object' ? String((err as { code?: string }).code || '') : '';
  return code === '42P01' || code === '42703' || code === 'database_unconfigured' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === '3D000';
}

async function optionalQuery(pool: SqlPool, sql: string, params: unknown[] = []) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (dbOptional(err)) return null;
    throw err;
  }
}

async function loadStates(pool: SqlPool): Promise<RetentionState> {
  const res = await optionalQuery(pool, 'select person_key, status, snooze_until::text as snooze_until from studio_retention_status');
  const states: RetentionState = {};
  for (const row of res?.rows || []) {
    states[String(row.person_key)] = {
      status: row.status,
      snoozeUntil: row.snooze_until ? String(row.snooze_until).slice(0, 10) : undefined,
    };
  }
  return states;
}

async function loadMarks(pool: SqlPool) {
  const res = await optionalQuery(pool, 'select person_key, action from studio_testing_roster');
  const marks: Record<string, string> = {};
  for (const row of res?.rows || []) marks[String(row.person_key)] = String(row.action);
  return marks;
}

async function loadQuizExtras(pool: SqlPool) {
  const questions = await optionalQuery(pool, 'select id, quiz_id, prompt, choices, answer_index from curriculum_quiz_questions order by sort_order, id');
  const attempts = await optionalQuery(pool, 'select id::text as id, quiz_id, person_key, score_pct, passed, taken_on::text as taken_on from curriculum_quiz_attempts order by taken_on desc');
  const extraQuestions: QuizQuestion[] = (questions?.rows || []).map(row => ({
    id: String(row.id),
    prompt: String(row.prompt),
    choices: Array.isArray(row.choices) ? row.choices.map(String) : [],
    answer: Number(row.answer_index),
  }));
  const extraAttempts = (attempts?.rows || []).map(row => ({
    id: String(row.id),
    personId: String(row.person_key),
    quizId: String(row.quiz_id),
    scorePct: Number(row.score_pct),
    passed: row.passed === true,
    takenOn: String(row.taken_on).slice(0, 10),
  }));
  return { extraQuestions, extraAttempts };
}

function assertPerson(id: string) {
  const person = personById(id);
  if (!person) throw new CrmError(404, 'not_found', 'That student is not in the sample studio.');
  return person;
}

function assertChannel(value: unknown): 'sms' | 'email' | 'call' | 'note' {
  if (value === 'sms' || value === 'email' || value === 'call' || value === 'note') return value;
  throw new CrmError(400, 'bad_channel', 'Pick a draft, a call log, or a note.');
}

export async function handleStudio(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor;
  body: Record<string, unknown>;
  pool: SqlPool;
}): Promise<{ status: number; body: unknown; text?: string; contentType?: string }> {
  assertStaff(input.actor);
  rejectUnsafe(input.body);
  const { method, parts, search, body, pool } = input;
  const asOf = assertDate(search.get('asOf') || String(body.asOf || '2026-11-27'));
  const head = parts[2] || '';

  if (method === 'GET' && head === 'testing-signup' && parts.length === 3) {
    const res = await optionalQuery(pool, "select location_id, week_key, signed_up from testing_signups where cycle_id = '2026-c6'");
    const grid = gridFromRows(res?.rows || []);
    return { status: 200, body: { ...signupTracker(asOf, {}, grid || undefined), charges: false, sends: false } };
  }
  if (method === 'GET' && (head === 'testing-report' || head === 'testing-report.csv') && parts.length === 3) {
    const cycle = search.get('cycle') || '2026-c5';
    const compare = search.get('compare') || '';
    try {
      if (head === 'testing-report.csv') {
        return { status: 200, body: { charges: false, sends: false }, text: participationCsv(cycle), contentType: 'text/csv; charset=utf-8' };
      }
      return { status: 200, body: { ...participationReport(cycle, compare || undefined), charges: false, sends: false } };
    } catch (err) {
      if (err instanceof CrmError) throw err;
      throw err;
    }
  }

  if (method === 'GET' && (head === 'pulse' || head === 'overview') && parts.length === 3) {
    const states = await loadStates(pool);
    const marks = await loadMarks(pool);
    const extras = await loadQuizExtras(pool);
    const locationId = search.get('locationId') || 'waunakee';
    const pulse = ownerPulse(asOf, states);
    if (head === 'pulse') return { status: 200, body: pulse };
    return {
      status: 200,
      body: {
        ...OFF,
        ...FEE,
        asOf,
        pulse,
        retention: retentionQueue(asOf, states),
        testing: testingBoard(asOf, marks),
        quizzes: quizBoard(extras.extraQuestions, extras.extraAttempts),
        qr: qrBoard(schoolById(locationId) ? locationId : 'waunakee'),
        people: STUDIO_PEOPLE.map(person => personCard(person, asOf)),
      },
    };
  }
  if (method === 'GET' && head === 'retention' && parts.length === 3) {
    return { status: 200, body: retentionQueue(asOf, await loadStates(pool)) };
  }
  if (method === 'GET' && head === 'testing' && parts.length === 3) {
    return { status: 200, body: testingBoard(asOf, await loadMarks(pool)) };
  }
  if (method === 'GET' && head === 'qr' && parts.length === 3) {
    return { status: 200, body: qrBoard(search.get('locationId') || 'waunakee') };
  }
  if (method === 'GET' && head === 'quizzes' && parts.length === 3) {
    const extras = await loadQuizExtras(pool);
    return { status: 200, body: quizBoard(extras.extraQuestions, extras.extraAttempts) };
  }

  if (method === 'POST' && head === 'outreach' && parts.length === 3) {
    const person = assertPerson(String(body.personKey || body.personId || ''));
    const school = assertStudioSchool(String(body.locationId || person.school));
    const channel = assertChannel(body.channel);
    const draft = draftBody({ channel, person, locationName: school.name, note: String(body.note || body.body || '') });
    const saved = await optionalQuery(
      pool,
      `insert into studio_outreach_drafts (person_key, location_id, channel, body, template_id)
       values ($1, $2, $3, $4, $5) returning id::text as id`,
      [person.id, school.id, channel, draft.body, draft.templateId],
    );
    return {
      status: 201,
      body: {
        id: saved?.rows[0]?.id || null,
        personKey: person.id,
        locationId: school.id,
        channel,
        body: draft.body,
        templateId: draft.templateId,
        persisted: !!saved,
        ...OFF,
      },
    };
  }

  if (method === 'POST' && head === 'retention' && parts.length === 3) {
    const person = assertPerson(String(body.personKey || body.personId || ''));
    const school = assertStudioSchool(String(body.locationId || person.school));
    const action = String(body.action || '');
    if (action === 'miss_you') {
      const draft = draftBody({ channel: 'sms', person, locationName: school.name });
      const saved = await optionalQuery(
        pool,
        `insert into studio_outreach_drafts (person_key, location_id, channel, body, template_id)
         values ($1, $2, 'sms', $3, $4) returning id::text as id`,
        [person.id, school.id, draft.body, draft.templateId],
      );
      return { status: 201, body: { personKey: person.id, locationId: school.id, body: draft.body, persisted: !!saved, ...OFF } };
    }
    if (action !== 'snooze' && action !== 'resolved' && action !== 'open') {
      throw new CrmError(400, 'bad_action', 'Snooze, resolve, or draft a check-in.');
    }
    const status = action === 'snooze' ? 'snoozed' : action === 'resolved' ? 'resolved' : 'open';
    const until = action === 'snooze' ? addDays(asOf, 7) : null;
    const saved = await optionalQuery(
      pool,
      `insert into studio_retention_status (person_key, location_id, status, snooze_until, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (person_key) do update set status = excluded.status, snooze_until = excluded.snooze_until, location_id = excluded.location_id, updated_at = now()
       returning person_key`,
      [person.id, school.id, status, until],
    );
    return {
      status: 200,
      body: { personKey: person.id, locationId: school.id, status, snoozeUntil: until, persisted: !!saved, ...OFF },
    };
  }

  if (method === 'POST' && head === 'testing' && parts.length === 3) {
    const person = assertPerson(String(body.personKey || body.personId || ''));
    if (person.role !== 'student') throw new CrmError(400, 'bad_person', 'Testing is for active students.');
    const school = assertStudioSchool(String(body.locationId || person.school));
    const action = String(body.action || '');
    if (action !== 'invite' && action !== 'roster') throw new CrmError(400, 'bad_action', 'Send a testing invite or add them to the roster.');
    const invite = testingInvite(person, school.name);
    const saved = await optionalQuery(
      pool,
      `insert into studio_testing_roster (person_key, location_id, action, belt_test_fee_cents, fee_model)
       values ($1, $2, $3, 0, 'included_2027')
       on conflict (person_key, action) do update set location_id = excluded.location_id
       returning id::text as id`,
      [person.id, school.id, action],
    );
    if (action === 'invite') {
      await optionalQuery(
        pool,
        `insert into studio_outreach_drafts (person_key, location_id, channel, body, template_id)
         values ($1, $2, 'email', $3, $4)`,
        [person.id, school.id, invite.body, invite.templateId],
      );
    }
    return {
      status: 201,
      body: {
        id: saved?.rows[0]?.id || null,
        personKey: person.id,
        locationId: school.id,
        action,
        body: action === 'invite' ? invite.body : `${person.first} was added to the testing roster at ${school.name}.`,
        persisted: !!saved,
        ...FEE,
        ...OFF,
      },
    };
  }

  if (method === 'POST' && head === 'qr' && parts[3] === 'scan' && parts.length === 4) {
    const scan = interpretQr(String(body.payload || ''));
    const saved = await optionalQuery(
      pool,
      `insert into studio_qr_scans (location_id, kind, payload) values ($1, $2, $3) returning id::text as id`,
      [scan.locationId, scan.kind, scan.payload],
    );
    return { status: 201, body: { ...scan, id: saved?.rows[0]?.id || null, persisted: !!saved } };
  }

  if (method === 'POST' && head === 'quizzes' && parts.length === 3) {
    const action = String(body.action || '');
    if (action === 'attempt') {
      const person = assertPerson(String(body.personKey || body.personId || ''));
      const answers = Array.isArray(body.answers) ? body.answers.map(Number) : [];
      const extras = await loadQuizExtras(pool);
      const scored = scoreAttempt(String(body.quizId || ''), answers, extras.extraQuestions);
      const saved = await optionalQuery(
        pool,
        `insert into curriculum_quiz_attempts (quiz_id, person_key, score_pct, passed, answers, taken_on)
         values ($1, $2, $3, $4, $5::jsonb, $6) returning id::text as id`,
        [scored.quizId, person.id, scored.scorePct, scored.passed, JSON.stringify(answers), asOf],
      );
      return { status: 201, body: { ...scored, personKey: person.id, persisted: !!saved, takenOn: asOf } };
    }
    if (action === 'question') {
      const quiz = STUDIO_QUIZZES.find(row => row.id === String(body.quizId || ''));
      if (!quiz) throw new CrmError(404, 'not_found', 'That quiz is not on the list.');
      const prompt = cleanText(body.prompt, 'Write a short question.', 160);
      const a = cleanText(body.choiceA, 'Add two short choices.', 80);
      const b = cleanText(body.choiceB, 'Add two short choices.', 80);
      const answer = body.answer === 1 || body.answer === '1' ? 1 : 0;
      const id = quiz.id + '-' + String(Date.now()).slice(-8);
      const saved = await optionalQuery(
        pool,
        `insert into curriculum_quiz_questions (id, quiz_id, prompt, choices, answer_index)
         values ($1, $2, $3, $4::jsonb, $5) returning id`,
        [id, quiz.id, prompt, JSON.stringify([a, b]), answer],
      );
      return {
        status: 201,
        body: {
          id,
          quizId: quiz.id,
          prompt,
          choices: [a, b],
          answer,
          persisted: !!saved,
          ...OFF,
        },
      };
    }
    throw new CrmError(400, 'bad_action', 'Score a quiz or add a question.');
  }

  return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
}
