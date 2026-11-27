import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createServer } from 'node:http';
import { signToken } from '../src/auth.ts';
import { migrate } from '../src/migrate.ts';
import { createApp } from '../src/server.ts';
import { applyTaskTags, recordAutomationTag } from '../src/tag-effects.ts';
import { bootstrapDatabase, grantCrmApp } from './bootstrap.ts';

const URL = 'postgres://crm:crm@127.0.0.1:5432/crm_wave_test';
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

async function seedHome(name: string) {
  const family = await pool.query(`insert into families (display_name) values ($1) returning id`, [name]);
  const member = await pool.query(
    `insert into members (family_id, location_id, first_name, last_name, status)
     values ($1, 'waunakee', $2, 'Sample', 'active') returning id`,
    [family.rows[0].id, name],
  );
  return { familyId: family.rows[0].id as string, memberId: member.rows[0].id as string };
}

before(async () => {
  bootstrapDatabase('crm_wave_test');
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

test('notes, contacts, photos, statuses, tags, and manual leads', async () => {
  const admin = token('admin', { locationIds: ['waunakee', 'verona'] });
  const home = await seedHome('Riley');
  const other = await seedHome('Avery');

  const backfill = await pool.query(
    `insert into leads (location_id, guardian_name, child_name, source)
     values ('waunakee', 'Jordan Sample', 'Parker Sample', 'fixture') returning id`,
  );
  await pool.query(`select public.backfill_person_names()`);
  const names = await pool.query(
    `select first_name, last_name, guardian_first_name, guardian_last_name from leads where id = $1`,
    [backfill.rows[0].id],
  );
  assert.equal(names.rows[0].first_name, 'Parker');
  assert.equal(names.rows[0].last_name, 'Sample');
  assert.equal(names.rows[0].guardian_first_name, 'Jordan');
  assert.equal(names.rows[0].guardian_last_name, 'Sample');

  const lead = await api('POST', '/v1/leads', admin, {
    locationId: 'waunakee',
    firstName: 'Parker',
    lastName: 'Sample',
    guardianFirstName: 'Jordan',
    guardianLastName: 'Sample',
    email: 'jordan.manual@example.test',
    note: 'Asked about a weekday class.',
  });
  assert.equal(lead.status, 201, JSON.stringify(lead.json));
  assert.equal(lead.json.firstName, 'Parker');
  assert.ok(lead.json.noteId);

  for (let i = 0; i < 3; i += 1) {
    const note = await api('POST', '/v1/members/' + home.memberId + '/notes', admin, { body: 'Pinned note ' + (i + 1), pinned: true });
    assert.equal(note.status, 201, JSON.stringify(note.json));
  }
  const fourth = await api('POST', '/v1/members/' + home.memberId + '/notes', admin, { body: 'One pin too many', pinned: true });
  assert.equal(fourth.status, 409);
  assert.equal(fourth.json.error.code, 'pinned_note_cap');
  await assert.rejects(
    pool.query(
      `insert into member_notes (member_id, body, pinned, pinned_at) values ($1, 'sql pin', true, now())`,
      [home.memberId],
    ),
    (err: { message?: string }) => /pinned_note_cap/.test(err.message || ''),
  );
  const loose = await api('POST', '/v1/members/' + home.memberId + '/notes', admin, { body: 'Not pinned' });
  assert.equal(loose.status, 201);
  const notes = await api('GET', '/v1/members/' + home.memberId + '/notes', admin);
  assert.equal(notes.json.notes.length, 4);
  assert.equal(notes.json.notes.filter((row: { pinned: boolean }) => row.pinned).length, 3);
  const removed = await api('PATCH', '/v1/members/' + home.memberId + '/notes', admin, { id: loose.json.id, deleted: true });
  assert.equal(removed.json.deleted, true);
  const afterDelete = await pool.query(`select deleted_at from member_notes where id = $1`, [loose.json.id]);
  assert.ok(afterDelete.rows[0].deleted_at);

  const contacts = await api('PUT', '/v1/families/' + home.familyId + '/contacts', admin, {
    label: 'Pickup contacts',
    contacts: [{ kind: 'pickup', firstName: 'Jordan', lastName: 'Sample', relationship: 'Guardian', sortOrder: 0 }],
  });
  assert.equal(contacts.status, 200, JSON.stringify(contacts.json));
  assert.equal(contacts.json.label, 'Pickup contacts');
  assert.equal(contacts.json.contacts.length, 1);
  assert.equal(contacts.json.contacts[0].kind, 'pickup');
  assert.equal(JSON.stringify(contacts.json).includes('tel:'), false);

  const photo = await api('POST', '/v1/members/' + home.memberId + '/photo', admin);
  assert.equal(photo.status, 200, JSON.stringify(photo.json));
  assert.equal(String(photo.json.uploadUrl).startsWith('/v1/members/'), true);
  assert.equal(String(photo.json.viewUrl).includes('https://'), false);
  assert.equal(String(photo.json.storagePath).includes('http'), false);
  const stored = await pool.query(`select photo_storage_path from members where id = $1`, [home.memberId]);
  assert.equal(stored.rows[0].photo_storage_path, photo.json.storagePath);
  const viewed = await api('GET', photo.json.viewUrl, admin);
  assert.equal(viewed.json.signed, true);

  const status = await api('POST', '/v1/statuses', admin, {
    locationId: 'waunakee',
    appliesTo: 'member',
    name: 'On a pause',
    color: '#336699',
  });
  assert.equal(status.status, 201, JSON.stringify(status.json));
  const preview = await api('POST', '/v1/members/bulk-status', admin, {
    memberIds: [home.memberId, other.memberId],
    customStatusId: status.json.id,
    dryRun: true,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.json));
  assert.equal(preview.json.dryRun, true);
  assert.equal(preview.json.applied, 0);
  const untouched = await pool.query(`select custom_status_id, status::text as status from members where id = $1`, [home.memberId]);
  assert.equal(untouched.rows[0].custom_status_id, null);
  assert.equal(untouched.rows[0].status, 'active');
  const locked = await api('POST', '/v1/members/bulk-status', admin, { memberIds: [home.memberId], status: 'cancelled' });
  assert.equal(locked.status, 400);
  assert.equal(locked.json.error.code, 'billing_status_locked');
  const applied = await api('POST', '/v1/members/bulk-status', admin, {
    memberIds: [home.memberId],
    customStatusId: status.json.id,
  });
  assert.equal(applied.json.applied, 1);
  const after = await pool.query(`select custom_status_id, status::text as status from members where id = $1`, [home.memberId]);
  assert.equal(after.rows[0].custom_status_id, status.json.id);
  assert.equal(after.rows[0].status, 'active');
  const audits = await pool.query(
    `select count(*)::int as n from audit_log where entity_id = $1 and action = 'member.custom_status'`,
    [home.memberId],
  );
  assert.equal(audits.rows[0].n, 1);

  const tag = await api('POST', '/v1/tags', admin, { name: 'Trial interest', groupName: 'Leads', color: '#225577' });
  assert.equal(tag.status, 201, JSON.stringify(tag.json));
  const tagged = await api('POST', '/v1/tags/bulk-apply', admin, {
    tagIds: [tag.json.id],
    memberIds: [home.memberId],
    leadIds: [lead.json.id],
    op: 'add',
  });
  assert.equal(tagged.status, 200, JSON.stringify(tagged.json));
  assert.equal(tagged.json.applied, 2);
  const members = await api('GET', '/v1/members?tag=' + encodeURIComponent('Trial interest'), admin);
  assert.equal(members.json.members.length, 1);
  assert.equal(members.json.members[0].id, home.memberId);
  const leads = await api('GET', '/v1/leads?tag=' + encodeURIComponent(tag.json.id), admin);
  assert.equal(leads.json.leads.length, 1);
  const removedTag = await api('POST', '/v1/tags/bulk-apply', admin, {
    tagIds: [tag.json.id],
    memberIds: [home.memberId],
    op: 'remove',
  });
  assert.equal(removedTag.json.applied, 1);
  const cleared = await api('GET', '/v1/members?tag=Trial%20interest', admin);
  assert.equal(cleared.json.members.length, 0);

  const dryTag = await recordAutomationTag(pool, {
    dryRun: true,
    op: 'add',
    tagName: 'Trial interest',
    locationId: 'waunakee',
    memberId: home.memberId,
  });
  assert.equal(dryTag.applied, false);
  assert.equal(dryTag.reason, 'dry_run');
  assert.equal(dryTag.tagId, tag.json.id);
  const beforeRows = await pool.query(`select count(*)::int as n from entity_tags where member_id = $1`, [home.memberId]);
  const liveTag = await recordAutomationTag(pool, {
    dryRun: false,
    op: 'add',
    tagName: 'Trial interest',
    locationId: 'waunakee',
    memberId: other.memberId,
  });
  assert.equal(liveTag.applied, true);
  assert.equal(liveTag.reason, 'applied');
  const taskTag = await api('POST', '/v1/tags', admin, { locationId: 'waunakee', name: 'Checklist', groupName: 'Tasks' });
  assert.equal(taskTag.status, 201, JSON.stringify(taskTag.json));
  const taskResult = await applyTaskTags(pool, {
    memberId: other.memberId,
    tagIdsAdd: [taskTag.json.id],
    tagIdsRemove: [],
  });
  assert.equal(taskResult.reason, 'applied');
  const sources = await pool.query(
    `select source from entity_tags where member_id = $1 order by source`,
    [other.memberId],
  );
  assert.deepEqual(sources.rows.map(row => row.source), ['automation', 'task']);
  assert.equal(beforeRows.rows[0].n, 0);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select crm_private.set_actor('family', '', $1)`, [other.familyId]);
    await client.query('set role crm_app');
    const hidden = await client.query(`select count(*)::int as n from member_notes where member_id = $1`, [home.memberId]);
    assert.equal(hidden.rows[0].n, 0);
    await client.query(`select crm_private.set_actor('family', '', $1)`, [home.familyId]);
    const visible = await client.query(`select count(*)::int as n from member_notes where member_id = $1`, [home.memberId]);
    assert.ok(visible.rows[0].n >= 3);
  } finally {
    await client.query('rollback');
    client.release();
  }
});

test('forms, consent, plan order, and lead invites stay unsent', async () => {
  const admin = token('admin', { locationIds: ['waunakee', 'verona'] });
  const planA = await pool.query(
    `insert into plans (location_id, name, program, amount_cents, interval)
     values ('waunakee', 'Weekday', 'taekwondo', 6000, 'every_4_weeks') returning id`,
  );
  const planB = await pool.query(
    `insert into plans (location_id, name, program, amount_cents, interval)
     values ('waunakee', 'Weekend', 'taekwondo', 7000, 'every_4_weeks') returning id`,
  );
  const blocked = await api('POST', '/v1/forms', admin, {
    locationId: 'waunakee',
    brand: 'lvlup',
    kind: 'signup',
    slug: 'waunakee-signup',
    title: 'Join Waunakee',
    redirectUrl: 'http://example.test/thanks',
  });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.json.error.code, 'bad_redirect');
  const created = await api('POST', '/v1/forms', admin, {
    locationId: 'waunakee',
    brand: 'lvlup',
    kind: 'signup',
    slug: 'waunakee-signup',
    title: 'Join Waunakee',
    redirectUrl: 'https://example.test/thanks',
    theme: { text_color: '#112233', placeholder_color: '#8899aa', accent: '#336699' },
    emailOptInEnabled: true,
    emailOptInLabel: 'Send class updates by email',
    fields: [{ key: 'goal', label: 'What do you want to learn?', type: 'text', required: false, sortOrder: 0 }],
    documents: [{ documentKind: 'waiver', waiverVersion: '2026-11', requiredSignature: true }],
    planIds: [planA.rows[0].id, planB.rows[0].id],
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const reordered = await api('PUT', '/v1/forms/' + created.json.id + '/plans/order', admin, {
    planIds: [planB.rows[0].id, planA.rows[0].id],
  });
  assert.equal(reordered.status, 200, JSON.stringify(reordered.json));
  assert.deepEqual(reordered.json.planIds, [planB.rows[0].id, planA.rows[0].id]);

  const pub = await api('GET', '/v1/public/forms/waunakee-signup');
  assert.equal(pub.status, 200, JSON.stringify(pub.json));
  assert.equal(pub.json.plans[0].planId, planB.rows[0].id);
  assert.equal(pub.json.redirectUrl, 'https://example.test/thanks');
  assert.equal(pub.json.theme.accent, '#336699');
  assert.equal(pub.json.requireGuardianForMinor, true);

  const minor = await api('POST', '/v1/public/forms/waunakee-signup/submit', undefined, {
    firstName: 'Parker',
    lastName: 'Sample',
    email: 'jordan.form@example.test',
    birthDate: '2018-04-02',
    planId: planB.rows[0].id,
    emailOptIn: false,
  });
  assert.equal(minor.status, 400);
  assert.equal(minor.json.error.code, 'guardian_required');
  const submitted = await api('POST', '/v1/public/forms/waunakee-signup/submit', undefined, {
    firstName: 'Parker',
    lastName: 'Sample',
    guardianFirstName: 'Jordan',
    guardianLastName: 'Sample',
    email: 'jordan.form@example.test',
    birthDate: '2018-04-02',
    signature: 'Jordan Sample',
    planId: planB.rows[0].id,
    emailOptIn: false,
    answers: { goal: 'A first class' },
  });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.json));
  assert.equal(submitted.json.redirectUrl, 'https://example.test/thanks');
  assert.equal(submitted.json.sent, false);
  assert.equal(submitted.json.emailOptIn, false);
  assert.equal(submitted.json.enrollments[0].code, 'lead_form_submitted');
  assert.equal(submitted.json.enrollments[0].exitReason, 'marketing_opt_out');
  const tags = await pool.query(
    `select count(*)::int as n from entity_tags where lead_id = $1`,
    [submitted.json.leadId],
  );
  assert.equal(tags.rows[0].n, 0);
  const waiver = await pool.query(
    `select signed_by_guardian_name, signature_data, minor from lead_waivers where lead_id = $1`,
    [submitted.json.leadId],
  );
  assert.equal(waiver.rows[0].signed_by_guardian_name, 'Jordan Sample');
  assert.equal(waiver.rows[0].minor, true);

  const opted = await api('POST', '/v1/public/forms/waunakee-signup/submit', undefined, {
    firstName: 'Rowan',
    lastName: 'Sample',
    email: 'rowan.form@example.test',
    birthDate: '1990-01-01',
    planId: planA.rows[0].id,
    emailOptIn: true,
  });
  assert.equal(opted.status, 201, JSON.stringify(opted.json));
  assert.equal(opted.json.enrollments[0].status, 'completed');
  const optInTags = await pool.query(`select count(*)::int as n from entity_tags where lead_id = $1`, [opted.json.leadId]);
  assert.equal(optInTags.rows[0].n, 0);
  const pref = await pool.query(
    `select marketing, marketing_source, marketing_consented_at, marketing_revoked_at
     from notification_preferences np
     join guardians g on g.id = np.guardian_id
     where g.email = 'rowan.form@example.test'`,
  );
  assert.equal(pref.rows[0].marketing, true);
  assert.equal(pref.rows[0].marketing_source, 'form');
  assert.ok(pref.rows[0].marketing_consented_at);
  assert.equal(pref.rows[0].marketing_revoked_at, null);

  const httpUrl = await pool.query(
    `insert into forms (location_id, brand, kind, slug, title, redirect_url)
     values ('waunakee', 'lvlup', 'contact', 'bad-redirect', 'Nope', 'http://example.test/no')`,
  ).then(() => null, (err: { code?: string }) => err.code);
  assert.equal(httpUrl, '23514');

  const invite = await api('POST', '/v1/leads/' + submitted.json.leadId + '/invites', admin, {
    planId: planB.rows[0].id,
    startOn: '2026-12-01',
  });
  assert.equal(invite.status, 201, JSON.stringify(invite.json));
  assert.equal(invite.json.sent, false);
  assert.equal(invite.json.sentAt, null);
  assert.equal(invite.json.startOn, '2026-12-01');
  assert.equal(String(invite.json.link).startsWith('/v1/public/invites/'), true);
  const row = await pool.query(`select sent_at, token_hash from lead_invites where id = $1`, [invite.json.id]);
  assert.equal(row.rows[0].sent_at, null);
  assert.notEqual(row.rows[0].token_hash, invite.json.token);
  const accepted = await api('POST', '/v1/public/invites/' + invite.json.token + '/accept');
  assert.equal(accepted.status, 200, JSON.stringify(accepted.json));
  assert.equal(accepted.json.sent, false);
  assert.equal(accepted.json.startOn, '2026-12-01');
  assert.equal(accepted.json.enrollments[0].code, 'lead_invite_accepted');
  assert.equal(accepted.json.enrollments[0].status, 'completed');
  const inviteTags = await pool.query(
    `select count(*)::int as n from entity_tags where lead_id = $1 and source = 'automation'`,
    [submitted.json.leadId],
  );
  assert.equal(inviteTags.rows[0].n, 0);
});
