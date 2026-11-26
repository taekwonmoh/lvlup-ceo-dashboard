import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createServer } from 'node:http';
import { signToken } from '../src/auth.ts';
import { migrate } from '../src/migrate.ts';
import { createApp } from '../src/server.ts';
import { bootstrapDatabase, grantCrmApp } from './bootstrap.ts';

const URL = 'postgres://crm:crm@127.0.0.1:5432/crm_rollover_test';
const SECRET = 'dev-only-secret';
process.env.CRM_TOKEN_SECRET = SECRET;
process.env.AUTHORIZENET_MODE = 'sandbox';
process.env.BILLING_CHARGES_ENABLED = '0';
process.env.AUTOMATION_DELIVERY_ENABLED = '0';
process.env.PUSH_DELIVERY_ENABLED = '0';
process.env.WEBHOOK_DELIVERY_ENABLED = '0';
process.env.QBO_ENABLED = '0';

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

async function seedFamily(name: string) {
  const family = await pool.query(`insert into families (display_name) values ($1) returning id`, [name]);
  const guardian = await pool.query(
    `insert into guardians (email, first_name, last_name) values ($1, $2, 'Sample') returning id`,
    [name.toLowerCase().replace(/[^a-z]/g, '') + '@example.test', name],
  );
  await pool.query(
    `insert into guardian_families (family_id, guardian_id, role) values ($1, $2, 'payer')`,
    [family.rows[0].id, guardian.rows[0].id],
  );
  const member = await pool.query(
    `insert into members (family_id, location_id, first_name, last_name, status)
     values ($1, 'waunakee', $2, 'Sample', 'active') returning id`,
    [family.rows[0].id, name],
  );
  return { familyId: family.rows[0].id as string, memberId: member.rows[0].id as string };
}

before(async () => {
  bootstrapDatabase('crm_rollover_test');
  pool = new pg.Pool({ connectionString: URL });
  await migrate(pool);
  grantCrmApp();
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

test('prepaid rollover drafts on cadence, applies credits once, and stays uncharged', async () => {
  const admin = token('admin', { locationIds: ['waunakee', 'verona'] });
  const home = await seedFamily('Riley');
  const plan = await pool.query(
    `insert into plans (location_id, name, program, amount_cents, interval)
     values ('waunakee', 'Term fixture', 'taekwondo', 8000, 'prepaid_term') returning id`,
  );
  const membership = await pool.query(
    `insert into memberships
       (family_id, location_id, plan_id, status, biller, prepaid, started_on, anchor_on, paid_through_on)
     values ($1, 'waunakee', $2, 'active', 'lvlup', true, '2026-04-15', '2026-04-15', '2027-04-15')
     returning id`,
    [home.familyId, plan.rows[0].id],
  );
  await pool.query(
    `insert into membership_members (membership_id, member_id) values ($1, $2)`,
    [membership.rows[0].id, home.memberId],
  );
  const saved = await api('POST', '/v1/memberships/' + membership.rows[0].id + '/rollover', admin, {
    enabled: true,
    cadence: '4_weeks',
    amountCents: 6000,
    anchorDay: 15,
  });
  assert.equal(saved.status, 400, JSON.stringify(saved.json));
  const monthly = await api('POST', '/v1/memberships/' + membership.rows[0].id + '/rollover', admin, {
    enabled: true,
    cadence: 'monthly',
    amountCents: 6000,
  });
  assert.equal(monthly.status, 200, JSON.stringify(monthly.json));
  assert.equal(monthly.json.cadence, 'monthly');
  assert.equal(monthly.json.charged, false);
  assert.equal(monthly.json.paidThroughDate, '2027-04-15');

  const early = await api('POST', '/v1/billing/drafts', admin, {
    membershipId: membership.rows[0].id,
    on: '2027-04-01',
  });
  assert.equal(early.json.action, 'skip');
  assert.equal(early.json.reason, 'skipped_prepaid');
  assert.equal(early.json.charged, false);
  assert.equal(early.json.invoice, null);

  const soon = await api('POST', '/v1/families/' + home.familyId + '/credits', admin, {
    amountCents: 1500,
    reason: 'manual_staff',
    expiresOn: '2027-04-20',
    locationId: 'waunakee',
    note: 'soon',
  });
  assert.equal(soon.status, 201, JSON.stringify(soon.json));
  await api('POST', '/v1/families/' + home.familyId + '/credits', admin, {
    amountCents: 900,
    reason: 'adjustment',
    expiresOn: '2026-01-01',
    locationId: 'waunakee',
  });

  const draft = await api('POST', '/v1/billing/drafts', admin, {
    membershipId: membership.rows[0].id,
    on: '2027-04-15',
  });
  assert.equal(draft.status, 200, JSON.stringify(draft.json));
  assert.equal(draft.json.action, 'charge');
  assert.equal(draft.json.submitted, false);
  assert.equal(draft.json.charged, false);
  assert.equal(draft.json.invoice.totalCents, 4500);
  assert.equal(draft.json.invoice.lines[0].creditAppliedCents, 1500);
  assert.equal(draft.json.invoice.lines[0].chargeAmountCents, 4500);
  assert.equal(draft.json.invoice.lines[1].kind, 'refund_credit');
  assert.equal(draft.json.invoice.lines[1].amountCents, -1500);

  const again = await api('POST', '/v1/billing/drafts', admin, {
    membershipId: membership.rows[0].id,
    on: '2027-04-15',
  });
  assert.equal(again.json.reason, 'already_drafted');
  assert.equal(again.json.invoice.id, draft.json.invoice.id);
  const balance = await api('GET', '/v1/families/' + home.familyId + '/credits', admin);
  assert.equal(balance.json.balanceCents, 0);

  const older = await api('POST', '/v1/families/' + home.familyId + '/credits', admin, {
    amountCents: 10000,
    reason: 'promo',
    locationId: 'waunakee',
  });
  assert.equal(older.status, 201);
  const next = await api('POST', '/v1/billing/drafts', admin, {
    membershipId: membership.rows[0].id,
    on: '2027-05-15',
  });
  assert.equal(next.json.invoice.totalCents, 0, JSON.stringify(next.json));
  assert.equal(next.json.invoice.lines[0].creditAppliedCents, 6000);
  assert.equal(next.json.invoice.lines[0].chargeAmountCents, 0);
  const after = await api('GET', '/v1/families/' + home.familyId + '/credits', admin);
  assert.equal(after.json.balanceCents, 4000);
  const ledger = await pool.query(
    `select source_type, amount_cents, memo from household_ledger
     where family_id = $1 and source_type in ('membership', 'tuition_credit')
     order by created_at`,
    [home.familyId],
  );
  assert.ok(ledger.rows.some(row => row.memo.includes('credit_applied=1500')));
  assert.ok(ledger.rows.some(row => row.source_type === 'tuition_credit' && row.amount_cents === -1500));

  const family = token('guardian', { platformRole: 'family', familyIds: [home.familyId], locationIds: [] });
  const own = await api('GET', '/v1/families/' + home.familyId + '/credits', family);
  assert.equal(own.status, 200);
  assert.equal(own.json.balanceCents, 4000);
  const otherHome = await seedFamily('Quinn');
  const hidden = await api('GET', '/v1/families/' + otherHome.familyId + '/credits', family);
  assert.equal(hidden.status, 404);
  const verona = token('staff', { platformRole: 'school_lead', locationIds: ['verona'], canFinance: false });
  const outside = await api('GET', '/v1/families/' + home.familyId + '/credits', verona);
  assert.equal(outside.status, 404);
  const phone = await api('POST', '/v1/families/' + home.familyId + '/credits', admin, { phone: 'no' });
  assert.equal(phone.status, 400);

  const cancelled = await api('POST', '/v1/memberships/' + membership.rows[0].id + '/rollover', admin, {
    cancel: true,
    cadence: 'monthly',
    amountCents: 6000,
  });
  assert.equal(cancelled.json.cancelled, true);
  const blocked = await api('POST', '/v1/billing/drafts', admin, {
    membershipId: membership.rows[0].id,
    on: '2027-06-15',
  });
  assert.equal(blocked.json.reason, 'skipped_rollover_cancelled');
  assert.equal(blocked.json.charged, false);
});

test('a referral code attributes a trial, rewards once, and dry-runs the thanks automation', async () => {
  const admin = token('admin', { locationIds: ['waunakee', 'verona'] });
  const referrer = await seedFamily('Avery');
  const code = await api('POST', '/v1/referrals/codes', admin, {
    familyId: referrer.familyId,
    memberId: referrer.memberId,
    locationId: 'waunakee',
  });
  assert.equal(code.status, 201, JSON.stringify(code.json));
  assert.match(code.json.code, /^[A-Z0-9]{8}$/);
  assert.equal(code.json.sharePath, '/v1/public/trials');
  const again = await api('POST', '/v1/referrals/codes', admin, {
    familyId: referrer.familyId,
    memberId: referrer.memberId,
    locationId: 'waunakee',
  });
  assert.equal(again.json.code, code.json.code);

  const rule = await api('POST', '/v1/referrals/rules', admin, {
    locationId: 'waunakee',
    referrerCreditCents: 2000,
    newFamilyCreditCents: 500,
    triggerCondition: 'trial_converted',
  });
  assert.equal(rule.status, 200, JSON.stringify(rule.json));
  assert.equal(rule.json.sent, false);

  const starts = new Date(Date.now() + 3 * 86400000).toISOString();
  const session = await pool.query(
    `insert into class_sessions (location_id, title, starts_at, ends_at, capacity, status, trial_open, age_min, age_max)
     values ('waunakee', 'Fixture trial', $1, $2, 8, 'scheduled', true, 5, 12) returning id`,
    [starts, new Date(Date.now() + 3 * 86400000 + 3600000).toISOString()],
  );
  const trial = await api('POST', '/v1/public/trials', undefined, {
    sessionId: session.rows[0].id,
    guardianName: 'Jordan Sample',
    email: 'jordan.sample.refer@example.test',
    childName: 'Parker Sample',
    childAge: '8',
    source: 'website',
    referralCode: code.json.code,
  });
  assert.equal(trial.status, 201, JSON.stringify(trial.json));
  assert.equal(trial.json.referral.status, 'trial_booked');

  const lead = token('staff', { platformRole: 'school_lead', locationIds: ['waunakee'] });
  const converted = await api('POST', '/v1/leads/' + trial.json.leadId + '/convert', lead);
  assert.equal(converted.status, 200, JSON.stringify(converted.json));
  assert.equal(converted.json.referral.status, 'rewarded');
  assert.equal(converted.json.referral.thanks.sent, false);
  assert.equal(converted.json.referral.thanks.dryRun, true);
  assert.equal(converted.json.referral.thanks.code, 'ret_referral_thanks');

  const referrerBalance = await api('GET', '/v1/families/' + referrer.familyId + '/credits', admin);
  assert.equal(referrerBalance.json.balanceCents, 2000);
  const newBalance = await api('GET', '/v1/families/' + converted.json.familyId + '/credits', admin);
  assert.equal(newBalance.json.balanceCents, 500);

  const second = await api('POST', '/v1/leads/' + trial.json.leadId + '/convert', lead);
  assert.equal(second.status, 200);
  const still = await api('GET', '/v1/families/' + referrer.familyId + '/credits', admin);
  assert.equal(still.json.balanceCents, 2000);
  const rewards = await pool.query(
    `select count(*)::int as n from tuition_credits where family_id = $1 and reason = 'referral_reward'`,
    [referrer.familyId],
  );
  assert.equal(rewards.rows[0].n, 1);
  const runs = await pool.query(
    `select r.status, w.code from automation_step_runs r
     join automation_enrollments e on e.id = r.enrollment_id
     join automation_workflows w on w.id = e.workflow_id
     where e.family_id = $1 and w.code = 'ret_referral_thanks'`,
    [referrer.familyId],
  );
  assert.equal(runs.rows.length, 2);
  assert.ok(runs.rows.every(row => row.status === 'dry_run'));
  const enrollments = await pool.query(
    `select count(*)::int as n from automation_enrollments e
     join automation_workflows w on w.id = e.workflow_id
     where e.family_id = $1 and w.code = 'ret_referral_thanks'`,
    [referrer.familyId],
  );
  assert.equal(enrollments.rows[0].n, 1);

  const family = token('guardian', { platformRole: 'family', familyIds: [referrer.familyId], locationIds: [] });
  const mine = await api('GET', '/v1/referrals?familyId=' + referrer.familyId, family);
  assert.equal(mine.status, 200, JSON.stringify(mine.json));
  assert.equal(mine.json.referrals.length, 1);
  assert.equal(mine.json.referrals[0].status, 'rewarded');
  assert.equal(mine.json.referrals[0].code, code.json.code);
  assert.equal(mine.json.sent, false);
  assert.equal('referrerFamilyId' in mine.json.referrals[0], false);
  const codes = await api('GET', '/v1/referrals/codes?familyId=' + referrer.familyId, family);
  assert.equal(codes.json.codes.length, 1);
  const other = await seedFamily('Blake');
  const denied = await api('GET', '/v1/referrals/codes?familyId=' + other.familyId, family);
  assert.equal(denied.status, 404);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select crm_private.set_actor('family', '', $1)`, [referrer.familyId]);
    await client.query('set role crm_app');
    const ownCodes = await client.query(`select count(*)::int as n from referral_codes`);
    assert.equal(ownCodes.rows[0].n, 1);
    const ownCredits = await client.query(`select count(*)::int as n from tuition_credits`);
    assert.equal(ownCredits.rows[0].n, 1);
    await client.query('savepoint family_insert');
    await assert.rejects(client.query(
      `insert into tuition_credits (family_id, location_id, amount_cents, remaining_cents, reason)
       values ($1, 'waunakee', 100, 100, 'manual_staff')`,
      [referrer.familyId],
    ));
    await client.query('rollback to savepoint family_insert');
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
    const codesSeen = await veronaClient.query(`select count(*)::int as n from referral_codes`);
    assert.equal(codesSeen.rows[0].n, 0);
    const creditsSeen = await veronaClient.query(`select count(*)::int as n from tuition_credits`);
    assert.equal(creditsSeen.rows[0].n, 0);
    await veronaClient.query('reset role');
    await veronaClient.query('rollback');
  } finally {
    veronaClient.release();
  }
});

test('first paid membership is the referral trigger when the rule says so', async () => {
  const admin = token('admin', { locationIds: ['waunakee'] });
  await api('POST', '/v1/referrals/rules', admin, {
    locationId: 'waunakee',
    referrerCreditCents: 3000,
    newFamilyCreditCents: 0,
    triggerCondition: 'first_paid_membership',
  });
  const referrer = await seedFamily('Casey');
  const code = await api('POST', '/v1/referrals/codes', admin, {
    familyId: referrer.familyId,
    locationId: 'waunakee',
  });
  const starts = new Date(Date.now() + 4 * 86400000).toISOString();
  const session = await pool.query(
    `insert into class_sessions (location_id, title, starts_at, ends_at, capacity, status, trial_open, age_min, age_max)
     values ('waunakee', 'Fixture trial two', $1, $2, 8, 'scheduled', true, 5, 12) returning id`,
    [starts, new Date(Date.now() + 4 * 86400000 + 3600000).toISOString()],
  );
  const trial = await api('POST', '/v1/public/trials', undefined, {
    sessionId: session.rows[0].id,
    guardianName: 'Taylor Sample',
    email: 'taylor.sample.refer@example.test',
    childName: 'Rowan Sample',
    childAge: '9',
    referralCode: code.json.code,
  });
  assert.equal(trial.status, 201, JSON.stringify(trial.json));
  const lead = token('staff', { platformRole: 'school_lead', locationIds: ['waunakee'] });
  const converted = await api('POST', '/v1/leads/' + trial.json.leadId + '/convert', lead);
  assert.equal(converted.json.referral.status, 'converted');
  assert.equal(converted.json.referral.thanks, null);
  const before = await api('GET', '/v1/families/' + referrer.familyId + '/credits', admin);
  assert.equal(before.json.balanceCents, 0);

  const plan = await pool.query(
    `insert into plans (location_id, name, program, amount_cents, interval)
     values ('waunakee', 'Term fixture two', 'taekwondo', 5000, 'prepaid_term') returning id`,
  );
  const membership = await pool.query(
    `insert into memberships
       (family_id, location_id, plan_id, status, biller, prepaid, started_on, anchor_on, paid_through_on)
     values ($1, 'waunakee', $2, 'active', 'lvlup', true, '2026-06-01', '2026-06-01', '2027-06-01')
     returning id`,
    [converted.json.familyId, plan.rows[0].id],
  );
  const configured = await api('POST', '/v1/memberships/' + membership.rows[0].id + '/rollover', admin, {
    cadence: 'weekly',
    amountCents: 5000,
    anchorDay: 1,
  });
  assert.equal(configured.status, 200, JSON.stringify(configured.json));
  const view = await api('GET', '/v1/memberships/' + membership.rows[0].id + '/rollover', admin);
  assert.equal(view.json.cadence, 'weekly');
  assert.equal(view.json.paidThroughDate, '2027-06-01');
  const tooSoon = await api('POST', '/v1/billing/drafts', admin, {
    membershipId: membership.rows[0].id,
    on: '2027-05-20',
  });
  assert.equal(tooSoon.json.reason, 'skipped_prepaid');
  const draft = await api('POST', '/v1/billing/drafts', admin, {
    membershipId: membership.rows[0].id,
    on: view.json.nextDraftOn,
  });
  assert.equal(draft.json.action, 'charge', JSON.stringify(draft.json));
  assert.equal(draft.json.charged, false);
  assert.equal(draft.json.referralRewards[0].status, 'rewarded');
  assert.equal(draft.json.referralRewards[0].thanks.sent, false);
  const paid = await api('GET', '/v1/families/' + referrer.familyId + '/credits', admin);
  assert.equal(paid.json.balanceCents, 3000);
  const replay = await api('POST', '/v1/billing/drafts', admin, {
    membershipId: membership.rows[0].id,
    on: view.json.nextDraftOn,
  });
  assert.equal(replay.json.reason, 'already_drafted');
  const still = await api('GET', '/v1/families/' + referrer.familyId + '/credits', admin);
  assert.equal(still.json.balanceCents, 3000);
  const statement = await api('GET', '/v1/families/' + referrer.familyId + '/statements?year=2026', admin);
  assert.equal(statement.json.creditBalanceCents, 3000);
  assert.equal(statement.json.delivery, 'not_sent');
});
