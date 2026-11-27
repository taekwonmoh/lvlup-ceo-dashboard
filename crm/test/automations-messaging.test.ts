import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createServer } from 'node:http';
import { signToken } from '../src/auth.ts';
import { migrate } from '../src/migrate.ts';
import { createApp } from '../src/server.ts';
import { AUTOMATION_CATALOG, CATALOG_COUNTS } from '../src/automation-catalog.ts';
import { TRIGGER_TYPES } from '../src/automations.ts';
import { bootstrapDatabase } from './bootstrap.ts';

const URL = 'postgres://crm:crm@127.0.0.1:5432/crm_messaging_test';
const SECRET = 'dev-only-secret';
process.env.CRM_TOKEN_SECRET = SECRET;
process.env.AUTHORIZENET_MODE = 'sandbox';
process.env.BILLING_CHARGES_ENABLED = '0';
process.env.AUTOMATION_DELIVERY_ENABLED = '0';
process.env.PUSH_DELIVERY_ENABLED = '0';
process.env.WEBHOOK_DELIVERY_ENABLED = '0';

let pool: pg.Pool;
let base = '';
let close: () => Promise<void>;

function token(role: 'admin' | 'staff' | 'guardian', extra: Record<string, unknown> = {}) {
  return signToken({
    role,
    email: role + '@example.test',
    locationIds: ['waunakee'],
    familyIds: [],
    memberId: null,
    canFinance: role === 'admin',
    ...extra,
  }, SECRET);
}

async function api(method: string, path: string, tok?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(tok ? { authorization: 'Bearer ' + tok } : {}),
      'content-type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

before(async () => {
  bootstrapDatabase('crm_messaging_test');
  pool = new pg.Pool({ connectionString: URL });
  await migrate(pool);
  const app = createApp(pool);
  const server = createServer((req, res) => { void app.handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  base = 'http://127.0.0.1:' + port;
  close = () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
});

after(async () => {
  if (close) await close();
  if (pool) await pool.end();
});

test('canonical journeys evaluate in dry-run and messaging stays on the family timeline', async () => {
  const admin = token('admin', {
    locationIds: ['waunakee', 'eastmad', 'verona', 'deforest', 'goninjaW', 'goninjaV'],
    platformRole: 'owner',
  });
  const health = await api('GET', '/v1/health');
  assert.equal(health.json.automationDelivery, '0');
  assert.equal(health.json.pushDelivery, '0');
  assert.equal(health.json.webhookDelivery, '0');

  const list = await api('GET', '/v1/automations', admin);
  assert.equal(list.status, 200, JSON.stringify(list.json));
  assert.equal(list.json.sent, false);
  assert.equal(list.json.automations.length, AUTOMATION_CATALOG.length);
  const counts: Record<string, number> = {};
  for (const row of list.json.automations) counts[row.category] = (counts[row.category] || 0) + 1;
  assert.deepEqual(counts, CATALOG_COUNTS);
  const codes = await pool.query(`select code from automation_workflows order by code`);
  assert.deepEqual(codes.rows.map(row => row.code), AUTOMATION_CATALOG.map(item => item.code).sort());
  const stepTypes = await pool.query(`select count(distinct step_type)::int as n from automation_steps`);
  assert.equal(stepTypes.rows[0].n, 12);
  const triggers = await pool.query(`select count(distinct trigger_type)::int as n from automation_workflows`);
  assert.equal(triggers.rows[0].n, TRIGGER_TYPES.length);

  const schools = await api('GET', '/v1/locations/deforest/automation-settings', admin);
  const waunakee = await api('GET', '/v1/locations/waunakee/automation-settings', admin);
  assert.equal(schools.json.reviewUrl, 'https://reviews.example.test/deforest');
  assert.notEqual(schools.json.reviewUrl, waunakee.json.reviewUrl);
  assert.equal(schools.json.programs.fitboxing, false);
  assert.equal(waunakee.json.programs.fitboxing, true);
  const patched = await api('PATCH', '/v1/locations/deforest/automation-settings', admin, {
    reviewUrl: 'https://reviews.example.test/deforest/maps',
  });
  assert.equal(patched.json.reviewUrl, 'https://reviews.example.test/deforest/maps');

  const blocked = await api('PATCH', '/v1/automations/' + list.json.automations[0].id, admin, { enabled: true });
  assert.equal(blocked.status, 409);
  const noted = await api('PATCH', '/v1/automations/' + list.json.automations[0].id, admin, { staffNote: 'Fixture note' });
  assert.equal(noted.json.enabled, false);
  assert.equal(noted.json.dryRun, true);
  assert.equal(noted.json.sent, false);

  const session = await api('POST', '/v1/automations/evaluate', admin, {
    trigger: 'new_booking',
    locationId: 'waunakee',
    sessionId: 'legacy-session',
  });
  assert.equal(session.status, 400);
  assert.equal(session.json.error.code, 'session_id_not_accepted');

  const veronaFit = await api('POST', '/v1/automations/evaluate', admin, {
    trigger: 'new_booking',
    locationId: 'verona',
    programSlug: 'fitboxing',
    classKind: 'regular',
    context: { first_name: 'Parker', email: 'parker@example.test' },
  });
  assert.equal(veronaFit.json.enrollments.some((row: { code: string }) => row.code === 'book_fitboxing'), false);
  const waunakeeFit = await api('POST', '/v1/automations/evaluate', admin, {
    trigger: 'new_booking',
    locationId: 'waunakee',
    programSlug: 'fitboxing',
    classKind: 'regular',
    context: { first_name: 'Parker', email: 'parker@example.test' },
  });
  assert.equal(waunakeeFit.json.sent, false);
  assert.equal(waunakeeFit.json.automationDelivery, '0');
  assert.equal(waunakeeFit.json.enrollments.some((row: { code: string }) => row.code === 'book_fitboxing'), true);

  const family = await pool.query(`insert into families (display_name) values ('Sample Household') returning id`);
  const other = await pool.query(`insert into families (display_name) values ('Other Household') returning id`);
  const guardian = await pool.query(
    `insert into guardians (email, first_name, last_name) values ('guardian.sample@example.test', 'Jordan', 'Sample') returning id`,
  );
  await pool.query(
    `insert into guardian_families (family_id, guardian_id, role) values ($1, $2, 'payer')`,
    [family.rows[0].id, guardian.rows[0].id],
  );
  const deforestMember = await pool.query(
    `insert into members (family_id, location_id, first_name, last_name) values ($1, 'deforest', 'Parker', 'Sample') returning id`,
    [family.rows[0].id],
  );
  const waunakeeMember = await pool.query(
    `insert into members (family_id, location_id, first_name, last_name) values ($1, 'waunakee', 'Riley', 'Sample') returning id`,
    [family.rows[0].id],
  );
  const otherMember = await pool.query(
    `insert into members (family_id, location_id, first_name, last_name) values ($1, 'verona', 'Avery', 'Other') returning id`,
    [other.rows[0].id],
  );
  await pool.query(
    `insert into device_tokens (guardian_id, platform, token) values ($1, 'ios', 'fixture-family-device')`,
    [guardian.rows[0].id],
  );
  const staff = await pool.query(
    `insert into staff_users (email, name, dash_role) values ('lead.waunakee@example.test', 'Lead Sample', 'lead') returning id`,
  );
  await pool.query(
    `insert into staff_location_grants (staff_id, location_id) values ($1, 'waunakee')`,
    [staff.rows[0].id],
  );
  await pool.query(
    `insert into device_tokens (staff_id, platform, token) values ($1, 'android', 'fixture-staff-device')`,
    [staff.rows[0].id],
  );

  process.env.AUTOMATION_DELIVERY_ENABLED = '1';
  process.env.PUSH_DELIVERY_ENABLED = '1';
  process.env.WEBHOOK_DELIVERY_ENABLED = '1';
  process.env.WATCHLIST_WEBHOOK_SECRET = ['dry', 'run', 'watchlist', 'secret'].join('-');
  const absence = await api('POST', '/v1/automations/evaluate', admin, {
    trigger: 'absence',
    locationId: 'waunakee',
    memberId: deforestMember.rows[0].id,
    absenceDays: 21,
  });
  process.env.AUTOMATION_DELIVERY_ENABLED = '0';
  process.env.PUSH_DELIVERY_ENABLED = '0';
  process.env.WEBHOOK_DELIVERY_ENABLED = '0';
  delete process.env.WATCHLIST_WEBHOOK_SECRET;
  assert.equal(absence.status, 200, JSON.stringify(absence.json));
  assert.equal(absence.json.locationId, 'deforest');
  assert.equal(absence.json.sent, false);
  assert.equal(absence.json.automationDelivery, '0');
  assert.equal(absence.json.webhookDelivery, '0');
  const watch = absence.json.enrollments.find((row: { code: string }) => row.code === 'watchlist_absence');
  const hook = watch.steps.find((step: { stepType: string }) => step.stepType === 'webhook');
  assert.equal(hook.rendered.url, 'https://hooks.example.test/watchlist?location=deforest&severity=critical');
  assert.equal(hook.rendered.delivered, false);
  assert.equal(hook.rendered.secretPresent, true);
  assert.equal(JSON.stringify(absence.json).includes('watchlist-secret'), false);
  const leaked = await pool.query(`select count(*)::int as n from automation_step_runs where rendered::text like '%watchlist-secret%'`);
  assert.equal(leaked.rows[0].n, 0);
  const task = watch.steps.find((step: { stepType: string }) => step.stepType === 'task');
  assert.equal(String(task.rendered.body).includes('https://reviews.example.test/deforest/maps'), true);
  assert.equal(String(task.rendered.body).includes('reviews.example.test/waunakee'), false);

  const yellow = await api('POST', '/v1/automations/evaluate', admin, {
    trigger: 'promotion',
    locationId: 'waunakee',
    memberId: waunakeeMember.rows[0].id,
    rankSlug: 'yellow',
  });
  const gear = yellow.json.enrollments.find((row: { code: string }) => row.code === 'prog_yellow_sparring');
  assert.equal(JSON.stringify(gear).includes('sparring gear'), true);

  const onb = await api('POST', '/v1/automations/evaluate', admin, {
    trigger: 'membership_start',
    locationId: 'waunakee',
    memberId: waunakeeMember.rows[0].id,
    programSlug: 'taekwondo',
    sequence: 'ninety_day',
  });
  const ninety = onb.json.enrollments.find((row: { code: string }) => row.code === 'onb90_sequence');
  const days = ninety.steps.map((step: { rendered: { day?: number } }) => step.rendered.day).filter((day: number | undefined) => day);
  for (const day of [1, 7, 14, 21, 30, 70, 80]) assert.equal(days.includes(day), true);
  assert.equal(JSON.stringify(ninety).includes('Tiger Leaders invite'), true);
  assert.equal(JSON.stringify(ninety).includes('Class 1 note'), true);
  assert.equal(JSON.stringify(ninety).includes('Track from class'), true);
  assert.equal(JSON.stringify(ninety).includes('How are we doing?'), true);

  const exited = await api('POST', '/v1/automations/evaluate', admin, {
    trigger: 'new_booking',
    locationId: 'waunakee',
    programSlug: 'kids_teens',
    classKind: 'intro',
    facts: { membership_started: true },
    context: { first_name: 'Riley' },
  });
  const trial = exited.json.enrollments.find((row: { code: string }) => row.code === 'trial_kids');
  assert.equal(trial.status, 'exited');
  assert.equal(trial.steps.length, 0);

  for (const school of ['goninjaW', 'goninjaV']) {
    const member = await pool.query(
      `insert into members (family_id, location_id, first_name, last_name) values ($1, $2, 'Quinn', 'Sample') returning id`,
      [family.rows[0].id, school],
    );
    const party = await api('POST', '/v1/automations/evaluate', admin, {
      trigger: 'new_booking',
      memberId: member.rows[0].id,
      classKind: 'birthday',
      context: { first_name: 'Quinn', guardian_name: 'Jordan Sample' },
    });
    assert.equal(party.json.locationId, school);
    const waiver = party.json.enrollments.find((row: { code: string }) => row.code === 'goninja_birthday_waiver');
    assert.ok(waiver, JSON.stringify(party.json.enrollments.map((row: { code: string }) => row.code)));
    const docs = waiver.steps.filter((step: { stepType: string }) => step.stepType === 'add_document');
    assert.deepEqual(docs.map((step: { rendered: { documentCode: string } }) => step.rendered.documentCode), [
      'birthday_waiver_host',
      'birthday_waiver_guest',
    ]);
  }
  const east = await api('POST', '/v1/automations/evaluate', admin, {
    trigger: 'new_booking',
    locationId: 'eastmad',
    classKind: 'birthday',
  });
  assert.equal(east.json.enrollments.some((row: { code: string }) => row.code === 'goninja_birthday_waiver'), false);
  const grants = await pool.query(
    `select location_id, document_code from automation_document_grants order by location_id, document_code`,
  );
  assert.deepEqual(grants.rows, [
    { location_id: 'goninjaV', document_code: 'birthday_waiver_guest' },
    { location_id: 'goninjaV', document_code: 'birthday_waiver_host' },
    { location_id: 'goninjaW', document_code: 'birthday_waiver_guest' },
    { location_id: 'goninjaW', document_code: 'birthday_waiver_host' },
  ]);

  const runs = await api('GET', '/v1/automations/runs?locationId=deforest', admin);
  assert.equal(runs.json.sent, false);
  assert.ok(runs.json.runs.every((row: { status: string; location_id: string }) => row.status === 'dry_run' && row.location_id === 'deforest'));
  const legacy = await api('POST', '/v1/automations/run', admin);
  assert.equal(legacy.json.sent, false);

  const familyToken = token('guardian', {
    email: 'guardian.sample@example.test',
    familyIds: [family.rows[0].id],
    platformRole: 'family',
    locationIds: [],
  });
  const otherToken = token('guardian', {
    email: 'other.sample@example.test',
    familyIds: [other.rows[0].id],
    platformRole: 'family',
    locationIds: [],
  });
  const lead = token('staff', {
    email: 'lead.waunakee@example.test',
    platformRole: 'school_lead',
    locationIds: ['waunakee'],
  });
  const verona = token('staff', {
    email: 'lead.verona@example.test',
    platformRole: 'school_lead',
    locationIds: ['verona'],
  });

  const opened = await api('POST', '/v1/messages/threads', familyToken, {
    familyId: family.rows[0].id,
    memberId: waunakeeMember.rows[0].id,
    locationId: 'waunakee',
    subject: 'Class question',
    category: 'schedule',
    body: 'See you in class this week.',
  });
  assert.equal(opened.status, 201, JSON.stringify(opened.json));
  assert.equal(opened.json.sent, false);
  assert.equal(opened.json.delivered, false);
  assert.equal(opened.json.dryRun, true);
  assert.equal(opened.json.push.audience, 'staff');
  assert.equal(JSON.stringify(opened.json).includes('fixture-staff-device'), false);
  assert.equal(opened.json.push.deviceTokenIds.length, 1);

  const hidden = await api('GET', '/v1/messages/threads/' + opened.json.thread.id, otherToken);
  assert.equal(hidden.status, 404);
  const wrongSchool = await api('GET', '/v1/messages/threads/' + opened.json.thread.id, verona);
  assert.equal(wrongSchool.status, 404);
  const staffUnread = await api('GET', '/v1/messages/unread', lead);
  assert.equal(staffUnread.json.count, 1);
  const familyUnread = await api('GET', '/v1/messages/unread', familyToken);
  assert.equal(familyUnread.json.count, 0);

  const reply = await api('POST', '/v1/messages/threads/' + opened.json.thread.id + '/messages', lead, {
    body: 'Glad you are coming to class.',
  });
  assert.equal(reply.status, 201, JSON.stringify(reply.json));
  assert.equal(reply.json.push.audience, 'family');
  assert.equal(reply.json.push.delivered, false);
  assert.equal(reply.json.dryRun, true);
  const afterReply = await api('GET', '/v1/messages/unread', familyToken);
  assert.equal(afterReply.json.count, 1);
  const read = await api('POST', '/v1/messages/threads/' + opened.json.thread.id + '/read', familyToken, {});
  assert.equal(read.json.read, true);
  const afterRead = await api('GET', '/v1/messages/unread', familyToken);
  assert.equal(afterRead.json.count, 0);

  const phone = await api('POST', '/v1/messages/threads/' + opened.json.thread.id + '/messages', familyToken, {
    body: 'Reach me at ' + ['608', '555', '0199'].join('-'),
  });
  assert.equal(phone.status, 400);
  assert.equal(phone.json.error.code, 'phone_not_accepted');

  const outbox = await api('GET', '/v1/messages/push-outbox', lead);
  assert.equal(outbox.json.delivered, false);
  assert.equal(outbox.json.dryRun, true);
  assert.equal(outbox.json.items.length, 2);
  assert.ok(outbox.json.items.every((row: { delivered: boolean; dry_run: boolean }) => row.delivered === false && row.dry_run === true));

  const timeline = await api('GET', '/v1/families/' + family.rows[0].id + '/timeline', admin);
  const kinds = timeline.json.events.map((row: { kind: string }) => row.kind);
  assert.equal(kinds.includes('message'), true);
  assert.equal(kinds.includes('automation'), true);
  const memberTimeline = await api('GET', '/v1/members/' + waunakeeMember.rows[0].id + '/timeline', familyToken);
  assert.equal(memberTimeline.json.events.some((row: { kind: string }) => row.kind === 'message'), true);
  assert.equal(memberTimeline.json.events.some((row: { member_id: string }) => row.member_id === deforestMember.rows[0].id), false);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select crm_private.set_actor('family', '', $1)`, [family.rows[0].id]);
    await client.query('set role crm_app');
    const own = await client.query(`select count(*)::int as n from message_threads`);
    assert.equal(own.rows[0].n, 1);
    const workflows = await client.query(`select count(*)::int as n from automation_workflows`);
    assert.equal(workflows.rows[0].n, 0);
    const staffPushes = await client.query(`select count(*)::int as n from push_notification_outbox where audience = 'staff'`);
    assert.equal(staffPushes.rows[0].n, 0);
    await client.query('savepoint family_write');
    await assert.rejects(
      client.query(
        `insert into message_threads (family_id, location_id, subject) values ($1, 'verona', 'Nope')`,
        [other.rows[0].id],
      ),
    );
    await client.query('rollback to savepoint family_write');
    await client.query('savepoint family_sender');
    await assert.rejects(
      client.query(
        `insert into messages (thread_id, sender_type, body) values ($1, 'staff', 'Not allowed')`,
        [opened.json.thread.id],
      ),
    );
    await client.query('rollback to savepoint family_sender');
    await client.query('reset role');
    await client.query('rollback');
  } finally {
    client.release();
  }

  const veronaClient = await pool.connect();
  try {
    await veronaClient.query('begin');
    await veronaClient.query(`select crm_private.set_actor('school_lead', 'verona', '')`);
    await veronaClient.query('set role crm_app');
    const threads = await veronaClient.query(`select count(*)::int as n from message_threads`);
    assert.equal(threads.rows[0].n, 0);
    const deforestSettings = await veronaClient.query(`select count(*)::int as n from location_automation_settings where location_id = 'deforest'`);
    assert.equal(deforestSettings.rows[0].n, 0);
    await veronaClient.query('reset role');
    await veronaClient.query('rollback');
  } finally {
    veronaClient.release();
  }

  assert.equal(otherMember.rows[0].id.length > 0, true);
});
