/**
 * Staff profile tools: notes, contacts, photos, custom statuses, leads, and tags.
 * The billing status enum is not changed here.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Actor } from './auth.ts';
import { assertStaff, canSeeLocation } from './auth.ts';
import { CrmError } from './errors.ts';
import { isLocationId } from './automations.ts';
import { assertNoPhoneText, joinName } from './names.ts';
import { assertUuid, isUuid, rethrowDb, withTx, type Sql, type SqlPool } from './query.ts';
import { applyTaskTags, writeTag } from './tag-effects.ts';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const CONTACT_KINDS = new Set(['emergency', 'pickup', 'other']);

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

function noteText(value: unknown): string {
  const body = String(value || '').trim();
  if (!body || body.length > 4000) throw new CrmError(400, 'bad_note', 'Write a note under 4000 characters.');
  assertNoPhoneText(body, 'Notes cannot include phone numbers.');
  return body;
}

async function memberRow(db: Sql, id: string) {
  const row = await db.query(
    `select id, family_id, location_id, status, custom_status_id, photo_storage_path
     from members where id = $1`,
    [id],
  );
  if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  return row.rows[0];
}

function canSeeMember(actor: Actor, row: { location_id: string; family_id: string }) {
  if (actor.role === 'admin') return;
  if (actor.role === 'staff' && actor.locationIds.includes(String(row.location_id))) return;
  if (actor.familyIds.includes(String(row.family_id))) return;
  throw new CrmError(404, 'not_found', 'Not found.');
}

export async function listNotes(db: Sql, actor: Actor | null, memberId: string) {
  const staff = requireStaff(actor);
  const member = await memberRow(db, assertUuid(memberId));
  canSeeMember(staff, { location_id: String(member.location_id), family_id: String(member.family_id) });
  const rows = await db.query(
    `select id, body, pinned, pinned_at, created_at, author_staff_id
     from member_notes
     where member_id = $1 and deleted_at is null
     order by pinned desc, pinned_at desc nulls last, created_at desc`,
    [memberId],
  );
  return {
    status: 200,
    body: {
      notes: rows.rows.map(row => ({
        id: row.id,
        body: row.body,
        pinned: row.pinned === true,
        pinnedAt: row.pinned_at,
        createdAt: row.created_at,
        authorStaffId: row.author_staff_id,
      })),
    },
  };
}

async function pinnedCount(db: Sql, memberId: string, exceptId: string | null) {
  const row = await db.query(
    `select count(*)::int as n from member_notes
     where member_id = $1 and pinned = true and deleted_at is null and ($2::uuid is null or id <> $2)`,
    [memberId, exceptId],
  );
  return Number(row.rows[0].n);
}

export async function createNote(db: Sql, actor: Actor | null, memberId: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const member = await memberRow(db, assertUuid(memberId));
  requireSchool(staff, String(member.location_id));
  const text = noteText(body.body);
  const pinned = body.pinned === true;
  if (pinned && await pinnedCount(db, memberId, null) >= 3) {
    throw new CrmError(409, 'pinned_note_cap', 'A profile can have at most 3 pinned notes.');
  }
  const author = await staffId(db, staff.email);
  try {
    const saved = await db.query(
      `insert into member_notes (member_id, body, author_staff_id, pinned, pinned_at)
       values ($1, $2, $3, $4, case when $4 then now() else null end)
       returning id, pinned, pinned_at, created_at`,
      [memberId, text, author, pinned],
    );
    return { status: 201, body: { id: saved.rows[0].id, pinned: saved.rows[0].pinned, pinnedAt: saved.rows[0].pinned_at } };
  } catch (err) {
    rethrowDb(err);
  }
}

export async function patchNote(db: Sql, actor: Actor | null, memberId: string, noteId: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  assertUuid(memberId);
  assertUuid(noteId);
  const member = await memberRow(db, memberId);
  requireSchool(staff, String(member.location_id));
  const existing = await db.query(
    `select id, pinned from member_notes where id = $1 and member_id = $2 and deleted_at is null`,
    [noteId, memberId],
  );
  if (!existing.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  if (body.deleted === true) {
    await db.query(
      `update member_notes set deleted_at = now(), pinned = false, pinned_at = null where id = $1`,
      [noteId],
    );
    return { status: 200, body: { id: noteId, deleted: true } };
  }
  const nextBody = body.body == null ? null : noteText(body.body);
  const pinned = body.pinned == null ? null : body.pinned === true;
  if (pinned === true && existing.rows[0].pinned !== true && await pinnedCount(db, memberId, noteId) >= 3) {
    throw new CrmError(409, 'pinned_note_cap', 'A profile can have at most 3 pinned notes.');
  }
  try {
    const saved = await db.query(
      `update member_notes
       set body = coalesce($2, body),
           pinned = coalesce($3, pinned),
           pinned_at = case
             when $3 is null then pinned_at
             when $3 then coalesce(pinned_at, now())
             else null
           end
       where id = $1
       returning id, body, pinned, pinned_at`,
      [noteId, nextBody, pinned],
    );
    return { status: 200, body: { id: saved.rows[0].id, body: saved.rows[0].body, pinned: saved.rows[0].pinned } };
  } catch (err) {
    rethrowDb(err);
  }
}

export async function pinNote(db: Sql, actor: Actor | null, noteId: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  assertUuid(noteId);
  const note = await db.query(
    `select n.id, n.member_id, n.lead_id, n.family_id, m.location_id as member_location, l.location_id as lead_location
     from member_notes n
     left join members m on m.id = n.member_id
     left join leads l on l.id = n.lead_id
     where n.id = $1 and n.deleted_at is null`,
    [noteId],
  );
  if (!note.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  const locationId = String(note.rows[0].member_location || note.rows[0].lead_location || '');
  if (locationId) requireSchool(staff, locationId);
  else if (staff.role !== 'admin') throw new CrmError(404, 'not_found', 'Not found.');
  const pinned = body.pinned == null ? true : body.pinned === true;
  const row = note.rows[0];
  if (pinned && row.member_id && await pinnedCount(db, String(row.member_id), noteId) >= 3) {
    throw new CrmError(409, 'pinned_note_cap', 'A profile can have at most 3 pinned notes.');
  }
  try {
    const saved = await db.query(
      `update member_notes
       set pinned = $2, pinned_at = case when $2 then coalesce(pinned_at, now()) else null end
       where id = $1
       returning id, pinned, pinned_at`,
      [noteId, pinned],
    );
    return { status: 200, body: { id: saved.rows[0].id, pinned: saved.rows[0].pinned, pinnedAt: saved.rows[0].pinned_at } };
  } catch (err) {
    rethrowDb(err);
  }
}

export async function listContacts(db: Sql, actor: Actor | null, familyId: string) {
  if (!actor) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  assertUuid(familyId);
  const family = await db.query(`select id from families where id = $1`, [familyId]);
  if (!family.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  if (actor.role === 'guardian' || actor.role === 'member') {
    if (!actor.familyIds.includes(familyId)) throw new CrmError(404, 'not_found', 'Not found.');
  } else {
    requireStaff(actor);
    const schools = await db.query(`select distinct location_id from members where family_id = $1`, [familyId]);
    if (actor.role !== 'admin' && !schools.rows.some(row => actor.locationIds.includes(String(row.location_id)))) {
      throw new CrmError(404, 'not_found', 'Not found.');
    }
  }
  const label = await db.query(
    `select contacts_label from locations
     where id = (select location_id from members where family_id = $1 order by created_at limit 1)`,
    [familyId],
  );
  const rows = await db.query(
    `select id, member_id, kind, label, first_name, last_name, phone, email, relationship, sort_order
     from member_contacts where family_id = $1 order by sort_order, created_at, id`,
    [familyId],
  );
  return {
    status: 200,
    body: {
      label: label.rows[0]?.contacts_label || 'Emergency contacts',
      contacts: rows.rows.map(row => ({
        id: row.id,
        memberId: row.member_id,
        kind: row.kind,
        label: row.label,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        relationship: row.relationship,
        sortOrder: row.sort_order,
      })),
    },
  };
}

export async function replaceContacts(pool: SqlPool, actor: Actor | null, familyId: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  assertUuid(familyId);
  const schools = await pool.query(`select distinct location_id from members where family_id = $1`, [familyId]);
  if (!schools.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  if (staff.role !== 'admin' && !schools.rows.some(row => staff.locationIds.includes(String(row.location_id)))) {
    throw new CrmError(404, 'not_found', 'Not found.');
  }
  const label = body.label == null ? null : String(body.label).trim();
  if (label != null) {
    if (!label || label.length > 80 || /tel:|sms:/i.test(label)) {
      throw new CrmError(400, 'bad_label', 'Contact label must be 80 characters or fewer.');
    }
  }
  const contacts = Array.isArray(body.contacts) ? body.contacts : null;
  if (!contacts) throw new CrmError(400, 'bad_contacts', 'Send a contacts list.');
  const cleaned = contacts.map((item, index) => {
    const row = item as Record<string, unknown>;
    const kind = String(row.kind || 'emergency');
    if (!CONTACT_KINDS.has(kind)) throw new CrmError(400, 'bad_kind', 'Contact kind must be emergency, pickup, or other.');
    const firstName = String(row.firstName || row.first_name || '').trim();
    const lastName = String(row.lastName || row.last_name || '').trim();
    if (!firstName || !lastName) throw new CrmError(400, 'bad_name', 'Each contact needs a first and last name.');
    assertNoPhoneText(firstName + ' ' + lastName);
    const email = row.email == null || row.email === '' ? null : String(row.email).trim().toLowerCase();
    return {
      memberId: row.memberId || row.member_id || null,
      kind,
      label: row.label == null ? null : String(row.label).slice(0, 80),
      firstName,
      lastName,
      email,
      phone: row.phone == null || row.phone === '' ? null : String(row.phone).slice(0, 40),
      relationship: row.relationship == null ? null : String(row.relationship).slice(0, 80),
      sortOrder: Number.isInteger(row.sortOrder) ? Number(row.sortOrder) : index,
    };
  });
  await withTx(pool, async client => {
    if (label) {
      await client.query(
        `update locations set contacts_label = $2
         where id in (select location_id from members where family_id = $1)`,
        [familyId, label],
      );
    }
    await client.query(`delete from member_contacts where family_id = $1`, [familyId]);
    for (const contact of cleaned) {
      if (contact.memberId) assertUuid(String(contact.memberId));
      await client.query(
        `insert into member_contacts
           (family_id, member_id, kind, label, first_name, last_name, phone, email, relationship, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [familyId, contact.memberId, contact.kind, contact.label, contact.firstName, contact.lastName, contact.phone, contact.email, contact.relationship, contact.sortOrder],
      );
    }
  });
  return listContacts(pool, staff, familyId);
}

function photoSecret(env: { CRM_TOKEN_SECRET?: string }) {
  return env.CRM_TOKEN_SECRET || 'dev-only-secret';
}

function signPhoto(secret: string, memberId: string, purpose: 'upload' | 'view', exp: number) {
  const sig = createHmac('sha256', secret).update(`${purpose}.${memberId}.${exp}`).digest('hex');
  return `/v1/members/${memberId}/photo?purpose=${purpose}&exp=${exp}&sig=${sig}`;
}

function photoUrls(secret: string, memberId: string) {
  const exp = Math.floor(Date.now() / 1000) + 15 * 60;
  const storagePath = `members/${memberId}/photo`;
  return {
    storagePath,
    uploadUrl: signPhoto(secret, memberId, 'upload', exp),
    viewUrl: signPhoto(secret, memberId, 'view', exp),
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

function signaturesMatch(secret: string, memberId: string, purpose: string, exp: string, sig: string) {
  const expected = createHmac('sha256', secret).update(`${purpose}.${memberId}.${exp}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function memberPhoto(
  db: Sql,
  actor: Actor | null,
  memberId: string,
  method: string,
  search: URLSearchParams,
  env: { CRM_TOKEN_SECRET?: string },
) {
  const staff = requireStaff(actor);
  assertUuid(memberId);
  const member = await memberRow(db, memberId);
  requireSchool(staff, String(member.location_id));
  const secret = photoSecret(env);
  if (method === 'GET' && search.get('sig')) {
    const exp = search.get('exp') || '';
    const purpose = search.get('purpose') || '';
    const sig = search.get('sig') || '';
    if (!['upload', 'view'].includes(purpose) || Number(exp) < Math.floor(Date.now() / 1000)) {
      throw new CrmError(401, 'bad_signature', 'That photo link has expired.');
    }
    if (!signaturesMatch(secret, memberId, purpose, exp, sig)) {
      throw new CrmError(401, 'bad_signature', 'That photo link is not valid.');
    }
    return {
      status: 200,
      body: { storagePath: member.photo_storage_path, signed: true, purpose },
    };
  }
  const urls = photoUrls(secret, memberId);
  if (method === 'POST') {
    await db.query(
      `update members set photo_storage_path = $2, photo_updated_at = now() where id = $1`,
      [memberId, urls.storagePath],
    );
  }
  return { status: 200, body: urls };
}

export async function listStatuses(db: Sql, actor: Actor | null, search: URLSearchParams) {
  const staff = requireStaff(actor);
  const locationId = search.get('locationId') || '';
  const appliesTo = search.get('appliesTo') || '';
  if (locationId) requireSchool(staff, locationId);
  const rows = await db.query(
    `select id, location_id, applies_to, name, color, sort_order, active
     from custom_statuses
     where ($1 = '' or location_id = $1)
       and ($2 = '' or applies_to = $2)
       and ($3::boolean or location_id = any($4::text[]))
     order by location_id, applies_to, sort_order, name`,
    [locationId, appliesTo, staff.role === 'admin', staff.locationIds],
  );
  return { status: 200, body: { statuses: rows.rows } };
}

export async function createStatus(db: Sql, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const locationId = String(body.locationId || body.location_id || '');
  requireSchool(staff, locationId);
  const appliesTo = String(body.appliesTo || body.applies_to || '');
  if (appliesTo !== 'member' && appliesTo !== 'lead') throw new CrmError(400, 'bad_status', 'Status applies to member or lead.');
  const name = String(body.name || '').trim();
  if (!name || name.length > 60) throw new CrmError(400, 'bad_status', 'Status name is required.');
  const color = body.color == null || body.color === '' ? null : String(body.color);
  if (color && !HEX.test(color)) throw new CrmError(400, 'bad_color', 'Color must be a hex value.');
  const sortOrder = Number.isInteger(body.sortOrder) ? Number(body.sortOrder) : 0;
  try {
    const saved = await db.query(
      `insert into custom_statuses (location_id, applies_to, name, color, sort_order)
       values ($1, $2, $3, $4, $5) returning id, name, color, applies_to, location_id`,
      [locationId, appliesTo, name, color, sortOrder],
    );
    return { status: 201, body: saved.rows[0] };
  } catch (err) {
    rethrowDb(err);
  }
}

export async function patchStatus(db: Sql, actor: Actor | null, id: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  assertUuid(id);
  const existing = await db.query(`select location_id from custom_statuses where id = $1`, [id]);
  if (!existing.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  requireSchool(staff, String(existing.rows[0].location_id));
  const name = body.name == null ? null : String(body.name).trim();
  if (name != null && (!name || name.length > 60)) throw new CrmError(400, 'bad_status', 'Status name is required.');
  const color = body.color == null ? null : (body.color === '' ? '' : String(body.color));
  if (color && !HEX.test(color)) throw new CrmError(400, 'bad_color', 'Color must be a hex value.');
  const active = body.active == null ? null : body.active === true;
  const saved = await db.query(
    `update custom_statuses
     set name = coalesce($2, name),
         color = case when $3::text is null then color when $3 = '' then null else $3 end,
         active = coalesce($4, active),
         sort_order = coalesce($5, sort_order)
     where id = $1
     returning id, name, color, active, sort_order`,
    [id, name, color, active, Number.isInteger(body.sortOrder) ? Number(body.sortOrder) : null],
  );
  return { status: 200, body: saved.rows[0] };
}

export async function bulkMemberStatus(pool: SqlPool, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  if ('status' in body) {
    throw new CrmError(400, 'billing_status_locked', 'Billing status stays on the system enum. Set customStatusId.');
  }
  const ids = Array.isArray(body.memberIds) ? body.memberIds.map(id => assertUuid(String(id))) : [];
  if (!ids.length) throw new CrmError(400, 'bad_members', 'Choose at least one member.');
  const customStatusId = body.customStatusId == null || body.customStatusId === '' ? null : assertUuid(String(body.customStatusId));
  const dryRun = body.dryRun === true || body.dry_run === true;
  const members = await pool.query(
    `select id, location_id, status::text as status, custom_status_id from members where id = any($1::uuid[])`,
    [ids],
  );
  if (members.rowCount !== ids.length) throw new CrmError(404, 'not_found', 'Not found.');
  for (const member of members.rows) requireSchool(staff, String(member.location_id));
  let statusLocation: string | null = null;
  if (customStatusId) {
    const status = await pool.query(
      `select id, location_id, applies_to, active from custom_statuses where id = $1`,
      [customStatusId],
    );
    if (!status.rowCount || status.rows[0].applies_to !== 'member' || status.rows[0].active !== true) {
      throw new CrmError(400, 'bad_status', 'Choose an active member status.');
    }
    statusLocation = String(status.rows[0].location_id);
    requireSchool(staff, statusLocation);
  }
  const changes = members.rows.map(member => ({
    memberId: String(member.id),
    locationId: String(member.location_id),
    billingStatus: String(member.status),
    from: member.custom_status_id ? String(member.custom_status_id) : null,
    to: customStatusId,
    changed: String(member.custom_status_id || '') !== String(customStatusId || ''),
    locationMismatch: Boolean(statusLocation && statusLocation !== String(member.location_id)),
  }));
  if (changes.some(change => change.locationMismatch)) {
    throw new CrmError(400, 'bad_status', 'That status belongs to a different school.');
  }
  if (!dryRun) {
    await withTx(pool, async client => {
      for (const change of changes) {
        if (!change.changed) continue;
        await client.query(`update members set custom_status_id = $2 where id = $1`, [change.memberId, customStatusId]);
        await client.query(
          `insert into audit_log (actor_email, action, entity_type, entity_id, location_id)
           values ($1, 'member.custom_status', 'member', $2, $3)`,
          [staff.email, change.memberId, change.locationId],
        );
      }
    });
  }
  return {
    status: 200,
    body: {
      dryRun,
      applied: dryRun ? 0 : changes.filter(change => change.changed).length,
      changes: changes.map(change => ({
        memberId: change.memberId,
        billingStatus: change.billingStatus,
        from: change.from,
        to: change.to,
        changed: change.changed,
      })),
    },
  };
}

export async function createManualLead(db: Sql, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const locationId = String(body.locationId || body.location_id || '');
  requireSchool(staff, locationId);
  const firstName = String(body.firstName || body.first_name || '').trim();
  const lastName = String(body.lastName || body.last_name || '').trim();
  const guardianFirst = String(body.guardianFirstName || body.guardian_first_name || '').trim();
  const guardianLast = String(body.guardianLastName || body.guardian_last_name || '').trim();
  if (!firstName) throw new CrmError(400, 'bad_name', 'First name is required.');
  assertNoPhoneText([firstName, lastName, guardianFirst, guardianLast].join(' '));
  const guardianName = joinName(guardianFirst, guardianLast) || joinName(firstName, lastName);
  const email = body.email == null || body.email === '' ? null : String(body.email).trim().toLowerCase();
  const source = String(body.source || 'staff');
  const note = body.note == null || body.note === '' ? null : noteText(body.note);
  const author = await staffId(db, staff.email);
  const saved = await withTx(db as SqlPool, async client => {
    const lead = await client.query(
      `insert into leads
         (location_id, guardian_name, email, child_name, source, status, pipeline_status,
          first_name, last_name, guardian_first_name, guardian_last_name)
       values ($1, $2, $3, $4, $5, 'new', 'new', $6, $7, $8, $9)
       returning id`,
      [
        locationId,
        guardianName,
        email,
        joinName(firstName, lastName),
        source,
        firstName,
        lastName || null,
        guardianFirst || null,
        guardianLast || null,
      ],
    );
    let noteId: string | null = null;
    if (note) {
      const written = await client.query(
        `insert into member_notes (lead_id, body, author_staff_id) values ($1, $2, $3) returning id`,
        [lead.rows[0].id, note, author],
      );
      noteId = String(written.rows[0].id);
    }
    return { id: String(lead.rows[0].id), noteId };
  });
  return {
    status: 201,
    body: {
      id: saved.id,
      firstName,
      lastName,
      guardianFirstName: guardianFirst || null,
      guardianLastName: guardianLast || null,
      noteId: saved.noteId,
    },
  };
}

export async function listPeopleByTag(db: Sql, actor: Actor | null, kind: 'members' | 'leads', tag: string, locationId: string) {
  const staff = requireStaff(actor);
  if (locationId) requireSchool(staff, locationId);
  const table = kind === 'members' ? 'members' : 'leads';
  const link = kind === 'members' ? 'member_id' : 'lead_id';
  const rows = await db.query(
    `select p.id, p.location_id, p.first_name, p.last_name, p.status::text as status
     from ${table} p
     join entity_tags et on et.${link} = p.id
     join tags t on t.id = et.tag_id
     where t.archived = false
       and (t.id::text = $1 or lower(t.name) = lower($1))
       and ($2 = '' or p.location_id = $2)
       and ($3::boolean or p.location_id = any($4::text[]))
     order by p.last_name nulls last, p.first_name nulls last`,
    [tag, locationId, staff.role === 'admin', staff.locationIds],
  );
  const key = kind === 'members' ? 'members' : 'leads';
  return {
    status: 200,
    body: {
      [key]: rows.rows.map(row => ({
        id: row.id,
        locationId: row.location_id,
        firstName: row.first_name,
        lastName: row.last_name,
        status: row.status,
      })),
    },
  };
}

export async function listTags(db: Sql, actor: Actor | null, search: URLSearchParams) {
  const staff = requireStaff(actor);
  const locationId = search.get('locationId') || '';
  if (locationId) requireSchool(staff, locationId);
  const rows = await db.query(
    `select id, location_id, name, group_name, color, archived
     from tags
     where archived = false
       and ($1 = '' or location_id = $1 or location_id is null)
       and ($2::boolean or location_id is null or location_id = any($3::text[]))
     order by group_name nulls last, name`,
    [locationId, staff.role === 'admin', staff.locationIds],
  );
  return { status: 200, body: { tags: rows.rows } };
}

export async function createTag(db: Sql, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const name = String(body.name || '').trim();
  if (!name || name.length > 60) throw new CrmError(400, 'bad_tag', 'Tag name is required.');
  assertNoPhoneText(name);
  const locationRaw = body.locationId ?? body.location_id;
  const locationId = locationRaw == null || locationRaw === '' ? null : String(locationRaw);
  if (locationId) requireSchool(staff, locationId);
  else if (staff.role !== 'admin') throw new CrmError(403, 'forbidden', 'Only an admin can add a tag for every school.');
  const color = body.color == null || body.color === '' ? null : String(body.color);
  if (color && !HEX.test(color)) throw new CrmError(400, 'bad_color', 'Color must be a hex value.');
  const groupName = body.groupName == null && body.group_name == null ? null : String(body.groupName ?? body.group_name).slice(0, 60);
  try {
    const saved = await db.query(
      `insert into tags (location_id, name, group_name, color) values ($1, $2, $3, $4)
       returning id, location_id, name, group_name, color, archived`,
      [locationId, name, groupName, color],
    );
    return { status: 201, body: saved.rows[0] };
  } catch (err) {
    rethrowDb(err);
  }
}

export async function patchTag(db: Sql, actor: Actor | null, id: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  assertUuid(id);
  const existing = await db.query(`select location_id from tags where id = $1`, [id]);
  if (!existing.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  const locationId = existing.rows[0].location_id ? String(existing.rows[0].location_id) : null;
  if (locationId) requireSchool(staff, locationId);
  else if (staff.role !== 'admin') throw new CrmError(403, 'forbidden', 'Only an admin can edit a tag for every school.');
  const name = body.name == null ? null : String(body.name).trim();
  if (name != null) assertNoPhoneText(name);
  const archived = body.archived == null ? null : body.archived === true;
  const saved = await db.query(
    `update tags
     set name = coalesce($2, name),
         archived = coalesce($3, archived),
         group_name = coalesce($4, group_name)
     where id = $1
     returning id, name, archived, group_name, location_id`,
    [id, name, archived, body.groupName == null && body.group_name == null ? null : String(body.groupName ?? body.group_name)],
  );
  return { status: 200, body: saved.rows[0] };
}

export async function bulkApplyTags(pool: SqlPool, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const op = body.op === 'remove' ? 'remove' : body.op === 'add' ? 'add' : '';
  if (!op) throw new CrmError(400, 'bad_op', 'op must be add or remove.');
  const tagIds = Array.isArray(body.tagIds) ? body.tagIds.map(id => assertUuid(String(id))) : [];
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(id => assertUuid(String(id))) : [];
  const leadIds = Array.isArray(body.leadIds) ? body.leadIds.map(id => assertUuid(String(id))) : [];
  if (!tagIds.length || (!memberIds.length && !leadIds.length)) {
    throw new CrmError(400, 'bad_tags', 'Send tagIds and memberIds or leadIds.');
  }
  const tags = await pool.query(`select id, location_id, archived from tags where id = any($1::uuid[])`, [tagIds]);
  if (tags.rowCount !== tagIds.length) throw new CrmError(404, 'not_found', 'Not found.');
  if (tags.rows.some(row => row.archived === true)) throw new CrmError(400, 'archived_tag', 'Archived tags cannot be applied.');
  for (const tag of tags.rows) {
    if (tag.location_id) requireSchool(staff, String(tag.location_id));
    else if (staff.role !== 'admin') throw new CrmError(403, 'forbidden', 'Only an admin can apply a tag for every school.');
  }
  const members = memberIds.length
    ? await pool.query(`select id, location_id from members where id = any($1::uuid[])`, [memberIds])
    : { rows: [], rowCount: 0 };
  const leads = leadIds.length
    ? await pool.query(`select id, location_id from leads where id = any($1::uuid[])`, [leadIds])
    : { rows: [], rowCount: 0 };
  if ((members.rowCount || 0) !== memberIds.length || (leads.rowCount || 0) !== leadIds.length) {
    throw new CrmError(404, 'not_found', 'Not found.');
  }
  for (const row of [...members.rows, ...leads.rows]) requireSchool(staff, String(row.location_id));
  const author = await staffId(pool, staff.email);
  let applied = 0;
  await withTx(pool, async client => {
    for (const tagId of tagIds) {
      for (const memberId of memberIds) {
        await writeTag(client, { op, tagId, subject: { memberId, leadId: null, familyId: null }, addedBy: author, source: 'bulk' });
        applied += 1;
      }
      for (const leadId of leadIds) {
        await writeTag(client, { op, tagId, subject: { memberId: null, leadId, familyId: null }, addedBy: author, source: 'bulk' });
        applied += 1;
      }
    }
  });
  return { status: 200, body: { op, applied, dryRun: false } };
}

export { applyTaskTags, isUuid };
