/**
 * Saved message templates and system-email toggles.
 * Saving never sends. Staff alerts are written as not_sent.
 */
import type { Actor } from './auth.ts';
import { assertFinance, assertStaff, canSeeLocation } from './auth.ts';
import { PUBLIC_MERGE_TAGS, isLocationId } from './automations.ts';
import { asDay } from './dates.ts';
import { CrmError } from './errors.ts';
import { assertNoPhoneText } from './names.ts';
import { assertUuid, type Sql } from './query.ts';

const TAG = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;
const CHANNELS = new Set(['email', 'push', 'in_app']);
const BRANDS = new Set(['lvlup', 'goninja', 'shared']);

export function unknownMergeTags(text: string): string[] {
  const bad: string[] = [];
  for (const match of text.matchAll(TAG)) {
    if (!(PUBLIC_MERGE_TAGS as readonly string[]).includes(match[1])) bad.push(match[1]);
  }
  return bad;
}

export function assertTemplateCopy(subject: string | null, body: string) {
  const combined = `${subject || ''}\n${body}`;
  assertNoPhoneText(combined, 'A template cannot include a phone number.');
  const unknown = unknownMergeTags(combined);
  if (unknown.length) throw new CrmError(400, 'bad_merge_tag', 'Unknown merge tag ' + unknown[0] + '.');
}

export function buildNewMemberStaffAlert(input: {
  memberName: string;
  program: string;
  plan: string;
  firstBillOn: string;
  last4: string | null;
  source: string;
  soldBy: string | null;
  schoolName: string;
}): { subject: string; body: string; status: 'not_sent' } {
  const subject = 'New member at ' + input.schoolName;
  const lines = [
    input.memberName + ' started ' + input.plan + ' (' + input.program + ').',
    'First bill date: ' + (input.firstBillOn || 'not set'),
    'Payment method: ' + (input.last4 ? 'card ···· ' + input.last4 : 'none on file'),
    'Source: ' + (input.source || 'staff'),
    'Sold by: ' + (input.soldBy || 'unassigned'),
  ];
  const body = lines.join('\n');
  assertTemplateCopy(subject, body);
  return { subject, body, status: 'not_sent' };
}

function requireStaff(actor: Actor | null): Actor {
  if (!actor) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  assertStaff(actor);
  return actor;
}

function requireSchool(actor: Actor, locationId: string) {
  if (!isLocationId(locationId)) throw new CrmError(400, 'bad_location', 'Unknown school.');
  if (!canSeeLocation(actor, locationId)) throw new CrmError(404, 'not_found', 'Not found.');
}

async function staffId(db: Sql, email: string): Promise<string | null> {
  const row = await db.query(`select id from staff_users where lower(email) = lower($1) limit 1`, [email]);
  return row.rows[0]?.id ? String(row.rows[0].id) : null;
}

function viewTemplate(row: Record<string, unknown>) {
  return {
    id: row.id,
    locationId: row.location_id,
    brand: row.brand,
    code: row.code,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    updatedAt: row.updated_at,
    sent: false,
  };
}

export async function listTemplates(db: Sql, actor: Actor | null, search: URLSearchParams) {
  const staff = requireStaff(actor);
  const locationId = search.get('locationId') || '';
  if (locationId) requireSchool(staff, locationId);
  const params: unknown[] = [];
  let sql = `select id, location_id, brand, code, channel, subject, body, updated_at from message_templates where true`;
  if (locationId) {
    params.push(locationId);
    sql += ` and (location_id = $1 or location_id is null)`;
  } else if (staff.role !== 'admin') {
    params.push(staff.locationIds);
    sql += ` and (location_id is null or location_id = any($1::text[]))`;
  }
  sql += ` order by code`;
  const rows = await db.query(sql, params);
  return { status: 200, body: { templates: rows.rows.map(viewTemplate), sent: false } };
}

export async function createTemplate(db: Sql, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const locationId = body.locationId ? String(body.locationId) : null;
  if (locationId) requireSchool(staff, locationId);
  else if (staff.role !== 'admin') throw new CrmError(403, 'forbidden', 'A brand template is an admin edit.');
  const brand = body.brand ? String(body.brand) : null;
  if (brand && !BRANDS.has(brand)) throw new CrmError(400, 'bad_brand', 'Unknown brand.');
  const code = String(body.code || '');
  if (!/^[a-z0-9_]+$/.test(code)) throw new CrmError(400, 'bad_code', 'code must be lowercase letters, numbers, and underscores.');
  const channel = String(body.channel || 'email');
  if (!CHANNELS.has(channel)) throw new CrmError(400, 'bad_channel', 'channel must be email, push, or in_app.');
  const subject = body.subject == null || body.subject === '' ? null : String(body.subject);
  const text = String(body.body || '');
  assertTemplateCopy(subject, text);
  const row = await db.query(
    `insert into message_templates (location_id, brand, code, channel, subject, body, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, location_id, brand, code, channel, subject, body, updated_at`,
    [locationId, brand, code, channel, subject, text, await staffId(db, staff.email)],
  );
  return { status: 201, body: { ...viewTemplate(row.rows[0]), sent: false } };
}

export async function patchTemplate(db: Sql, actor: Actor | null, id: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const current = await db.query(`select * from message_templates where id = $1`, [assertUuid(id)]);
  if (!current.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  if (current.rows[0].location_id) requireSchool(staff, String(current.rows[0].location_id));
  else if (staff.role !== 'admin') throw new CrmError(403, 'forbidden', 'A brand template is an admin edit.');
  const subject = body.subject === undefined ? current.rows[0].subject : (body.subject == null || body.subject === '' ? null : String(body.subject));
  const text = body.body === undefined ? String(current.rows[0].body) : String(body.body);
  assertTemplateCopy(subject, text);
  const row = await db.query(
    `update message_templates
     set subject = $2, body = $3, updated_by = $4, updated_at = now()
     where id = $1
     returning id, location_id, brand, code, channel, subject, body, updated_at`,
    [id, subject, text, await staffId(db, staff.email)],
  );
  return { status: 200, body: { ...viewTemplate(row.rows[0]), sent: false } };
}

export async function attachTemplate(db: Sql, actor: Actor | null, stepId: string, body: Record<string, unknown>) {
  requireStaff(actor);
  const templateId = assertUuid(String(body.templateId || ''));
  const template = await db.query(`select id from message_templates where id = $1`, [templateId]);
  if (!template.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  const step = await db.query(
    `update automation_steps set template_id = $2 where id = $1 returning id, template_id`,
    [assertUuid(stepId), templateId],
  );
  if (!step.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  return { status: 200, body: { id: step.rows[0].id, templateId: step.rows[0].template_id, sent: false } };
}

export async function listSystemEmails(db: Sql, actor: Actor | null, search: URLSearchParams) {
  const staff = requireStaff(actor);
  const locationId = String(search.get('locationId') || '');
  requireSchool(staff, locationId);
  const rows = await db.query(
    `select e.code, e.name, e.description, coalesce(s.enabled, true) as enabled
     from system_emails e
     left join location_system_email_settings s on s.code = e.code and s.location_id = $1
     order by e.code`,
    [locationId],
  );
  return {
    status: 200,
    body: {
      locationId,
      emails: rows.rows.map(row => ({
        code: row.code,
        name: row.name,
        description: row.description,
        enabled: row.enabled === true,
      })),
      sent: false,
    },
  };
}

export async function putSystemEmails(db: Sql, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  assertFinance(staff);
  const locationId = String(body.locationId || '');
  requireSchool(staff, locationId);
  const settings = Array.isArray(body.settings) ? body.settings as Array<Record<string, unknown>> : [];
  if (!settings.length) throw new CrmError(400, 'bad_settings', 'Send settings.');
  for (const setting of settings) {
    const code = String(setting.code || '');
    const known = await db.query(`select code from system_emails where code = $1`, [code]);
    if (!known.rowCount) throw new CrmError(400, 'bad_code', 'Unknown system email.');
    await db.query(
      `insert into location_system_email_settings (location_id, code, enabled, updated_by)
       values ($1, $2, $3, $4)
       on conflict (location_id, code) do update
         set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()`,
      [locationId, code, setting.enabled !== false, staff.email],
    );
  }
  return listSystemEmails(db, staff, new URLSearchParams({ locationId }));
}

export async function newMemberStaffAlert(db: Sql, actor: Actor | null, membershipId: string, body: Record<string, unknown>, env: { AUTOMATION_DELIVERY_ENABLED?: string }) {
  const staff = requireStaff(actor);
  if (env.AUTOMATION_DELIVERY_ENABLED === '1') {
    throw new CrmError(403, 'delivery_disabled', 'Message delivery stays off in this build.');
  }
  const row = await db.query(
    `select ms.id, ms.location_id, ms.started_on, ms.family_id,
            m.first_name, m.last_name,
            p.name as plan_name, p.program::text as program,
            l.name as school_name,
            pp.last4,
            (select string_agg(su.name, ', ' order by su.name)
             from sale_credits sc join staff_users su on su.id = sc.staff_id
             where sc.membership_id = ms.id) as sold_by
     from memberships ms
     join plans p on p.id = ms.plan_id
     join locations l on l.id = ms.location_id
     join membership_members mm on mm.membership_id = ms.id
     join members m on m.id = mm.member_id
     left join payment_profiles pp on pp.id = ms.payment_profile_id
     where ms.id = $1
     order by m.first_name
     limit 1`,
    [assertUuid(membershipId)],
  );
  if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  requireSchool(staff, String(row.rows[0].location_id));
  const found = row.rows[0];
  const rebuilt = buildNewMemberStaffAlert({
    memberName: String(found.first_name) + ' ' + String(found.last_name),
    program: String(found.program),
    plan: String(found.plan_name),
    firstBillOn: asDay(found.started_on) || '',
    last4: found.last4 ? String(found.last4) : null,
    source: body.source ? String(body.source) : 'staff',
    soldBy: found.sold_by ? String(found.sold_by) : null,
    schoolName: String(found.school_name),
  });
  const member = await db.query(
    `select m.id from membership_members mm join members m on m.id = mm.member_id where mm.membership_id = $1 limit 1`,
    [membershipId],
  );
  await db.query(
    `insert into communication_log (rule_code, family_id, member_id, channel, status, template_code, subject, body)
     values ('new_member_staff_alert', $1, $2, 'email', 'not_sent', 'new_member_staff_alert', $3, $4)`,
    [found.family_id, member.rows[0]?.id || null, rebuilt.subject, rebuilt.body],
  );
  return { status: 201, body: { ...rebuilt, sent: false, delivered: false } };
}
