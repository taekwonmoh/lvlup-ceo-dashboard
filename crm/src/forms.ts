/**
 * Signup forms, marketing opt-in, and lead invites.
 * Nothing here sends email. Invite sent_at stays null.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Actor } from './auth.ts';
import { assertStaff, canSeeLocation } from './auth.ts';
import { findCardPayload } from './charge-gate.ts';
import { CrmError } from './errors.ts';
import { chicagoToday } from './dates.ts';
import { isLocationId } from './automations.ts';
import { fireDryRun } from './automation-run.ts';
import {
  assertMinorGuardian,
  assertNoPhoneText,
  assertRedirectUrl,
  isMinorParticipant,
  joinName,
} from './names.ts';
import { assertUuid, rethrowDb, withTx, type Sql, type SqlPool } from './query.ts';

const KINDS = new Set(['trial', 'signup', 'event', 'party', 'contact']);
const FIELD_TYPES = new Set(['text', 'select', 'checkbox', 'date', 'file']);
const HEX = /^#[0-9A-Fa-f]{6}$/;
const FIELD_KEY = /^[a-z][a-z0-9_]{0,40}$/;

function requireStaff(actor: Actor | null): Actor {
  if (!actor) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  assertStaff(actor);
  return actor;
}

function requireSchool(actor: Actor, locationId: string) {
  if (!isLocationId(locationId)) throw new CrmError(400, 'bad_location', 'Unknown school.');
  if (!canSeeLocation(actor, locationId)) throw new CrmError(404, 'not_found', 'Not found.');
}

function slugOf(value: unknown): string {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new CrmError(400, 'bad_slug', 'Use a lowercase slug.');
  return slug;
}

function cleanTheme(value: unknown): Record<string, string> {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CrmError(400, 'bad_theme', 'Theme must be an object.');
  const src = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ['text_color', 'placeholder_color', 'accent']) {
    if (src[key] == null || src[key] === '') continue;
    const color = String(src[key]);
    if (!HEX.test(color)) throw new CrmError(400, 'bad_theme', 'Theme colors must be hex.');
    out[key] = color;
  }
  return out;
}

type FieldInput = {
  key: string;
  label: string;
  type: string;
  options: unknown[];
  required: boolean;
  sortOrder: number;
};

function cleanFields(value: unknown): FieldInput[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new CrmError(400, 'bad_fields', 'Fields must be a list.');
  return value.map((item, index) => {
    const row = item as Record<string, unknown>;
    const key = String(row.key || '').trim();
    if (!FIELD_KEY.test(key) || /phone|sms|tel/i.test(key)) {
      throw new CrmError(400, 'bad_field', 'Field keys are short lowercase words.');
    }
    const type = String(row.type || 'text');
    if (!FIELD_TYPES.has(type)) throw new CrmError(400, 'bad_field', 'Unknown field type.');
    const label = String(row.label || '').trim();
    if (!label) throw new CrmError(400, 'bad_field', 'Each field needs a label.');
    assertNoPhoneText(label);
    const options = Array.isArray(row.options) ? row.options.map(option => String(option)) : [];
    return {
      key,
      label,
      type,
      options,
      required: row.required === true,
      sortOrder: Number.isInteger(row.sortOrder) ? Number(row.sortOrder) : index,
    };
  });
}

type DocInput = { documentKind: string; waiverVersion: string | null; requiredSignature: boolean };

function cleanDocs(value: unknown): DocInput[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new CrmError(400, 'bad_documents', 'Documents must be a list.');
  return value.map(item => {
    const row = item as Record<string, unknown>;
    const documentKind = String(row.documentKind || row.document_kind || '');
    if (!['waiver', 'photo_release', 'policy'].includes(documentKind)) {
      throw new CrmError(400, 'bad_documents', 'Unknown document kind.');
    }
    return {
      documentKind,
      waiverVersion: row.waiverVersion || row.waiver_version ? String(row.waiverVersion || row.waiver_version).slice(0, 40) : null,
      requiredSignature: row.requiredSignature !== false && row.required_signature !== false,
    };
  });
}

async function loadFormBundle(db: Sql, whereSql: string, param: string) {
  const form = await db.query(`select * from forms where ${whereSql}`, [param]);
  if (!form.rowCount) return null;
  const id = String(form.rows[0].id);
  const [fields, docs, plans] = await Promise.all([
    db.query(`select id, key, label, type, options, required, sort_order from form_fields where form_id = $1 order by sort_order, key`, [id]),
    db.query(`select id, document_kind, waiver_version, required_signature from form_documents where form_id = $1`, [id]),
    db.query(
      `select o.plan_id, o.sort_order, o.featured, p.name, p.amount_cents
       from form_plan_options o join plans p on p.id = o.plan_id
       where o.form_id = $1
       order by o.sort_order, o.featured desc, p.name`,
      [id],
    ),
  ]);
  return { form: form.rows[0], fields: fields.rows, docs: docs.rows, plans: plans.rows };
}

function publicForm(bundle: NonNullable<Awaited<ReturnType<typeof loadFormBundle>>>) {
  const form = bundle.form;
  return {
    slug: form.slug,
    title: form.title,
    kind: form.kind,
    brand: form.brand,
    locationId: form.location_id,
    redirectUrl: form.redirect_url,
    theme: form.theme,
    requireGuardianForMinor: form.require_guardian_for_minor === true,
    emailOptInEnabled: form.email_optin_enabled === true,
    emailOptInLabel: form.email_optin_label,
    fields: bundle.fields.map(field => ({
      key: field.key,
      label: field.label,
      type: field.type,
      options: field.options,
      required: field.required === true,
      sortOrder: field.sort_order,
    })),
    documents: bundle.docs.map(doc => ({
      documentKind: doc.document_kind,
      waiverVersion: doc.waiver_version,
      requiredSignature: doc.required_signature === true,
    })),
    plans: bundle.plans.map(plan => ({
      planId: plan.plan_id,
      name: plan.name,
      amountCents: plan.amount_cents,
      sortOrder: plan.sort_order,
      featured: plan.featured === true,
    })),
  };
}

export async function getPublicForm(db: Sql, slug: string) {
  const bundle = await loadFormBundle(db, 'slug = $1 and active = true', slug);
  if (!bundle) throw new CrmError(404, 'not_found', 'Not found.');
  return { status: 200, body: publicForm(bundle) };
}

function answerValue(field: { key: string; type: string; required: boolean; options: unknown }, answers: Record<string, unknown>) {
  const value = answers[field.key];
  if (field.type === 'checkbox') {
    if (field.required && value !== true) throw new CrmError(400, 'required_field', 'A required field is missing.');
    return value === true;
  }
  const text = value == null ? '' : String(value).trim();
  if (field.required && !text) throw new CrmError(400, 'required_field', 'A required field is missing.');
  if (!text) return null;
  assertNoPhoneText(text);
  if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new CrmError(400, 'bad_field', 'Use a YYYY-MM-DD date.');
  if (field.type === 'select') {
    const options = Array.isArray(field.options) ? field.options.map(String) : [];
    if (!options.includes(text)) throw new CrmError(400, 'bad_field', 'Choose one of the listed options.');
  }
  if (field.type === 'file' && (/^https?:\/\//i.test(text) || /tel:|sms:/i.test(text))) {
    throw new CrmError(400, 'bad_field', 'File answers use a private path.');
  }
  return text;
}

export async function submitPublicForm(pool: SqlPool, slug: string, body: Record<string, unknown>, today = chicagoToday()) {
  if (findCardPayload(body)) throw new CrmError(400, 'card_not_allowed', 'Card numbers are not accepted.');
  for (const key of Object.keys(body)) {
    if (/phone|sms|^tel$/i.test(key)) throw new CrmError(400, 'phone_not_accepted', 'This form does not collect phone numbers.');
  }
  const bundle = await loadFormBundle(pool, 'slug = $1 and active = true', slug);
  if (!bundle) throw new CrmError(404, 'not_found', 'Not found.');
  const form = bundle.form;
  const answersIn = body.answers && typeof body.answers === 'object' ? body.answers as Record<string, unknown> : {};
  for (const key of Object.keys(answersIn)) {
    if (/phone|sms|tel/i.test(key)) throw new CrmError(400, 'phone_not_accepted', 'This form does not collect phone numbers.');
  }
  const answers: Record<string, unknown> = {};
  for (const field of bundle.fields) {
    answers[String(field.key)] = answerValue({
      key: String(field.key),
      type: String(field.type),
      required: field.required === true,
      options: field.options,
    }, answersIn);
  }
  const firstName = String(body.firstName || body.first_name || '').trim();
  const lastName = String(body.lastName || body.last_name || '').trim();
  const guardianFirst = String(body.guardianFirstName || body.guardian_first_name || '').trim();
  const guardianLast = String(body.guardianLastName || body.guardian_last_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (!firstName || !email || !email.includes('@')) throw new CrmError(400, 'bad_form', 'First name and email are required.');
  assertNoPhoneText([firstName, lastName, guardianFirst, guardianLast, email].join(' '));
  const age = body.age == null || body.age === '' ? null : Number(body.age);
  const birthDate = body.birthDate || body.birth_date ? String(body.birthDate || body.birth_date) : null;
  const minor = isMinorParticipant({
    minor: body.minor === true ? true : body.minor === false ? false : null,
    age: age != null && Number.isFinite(age) ? age : null,
    birthDate,
  }, today);
  const signature = String(body.signature || body.signatureData || body.signature_data || '').trim();
  assertMinorGuardian({
    minor,
    required: form.require_guardian_for_minor !== false,
    guardianFirstName: guardianFirst,
    guardianLastName: guardianLast,
    signature,
    signedByGuardianName: joinName(guardianFirst, guardianLast),
  });
  const planId = body.planId || body.plan_id ? assertUuid(String(body.planId || body.plan_id)) : null;
  if (planId && !bundle.plans.some(plan => String(plan.plan_id) === planId)) {
    throw new CrmError(400, 'bad_plan', 'That plan is not on this form.');
  }
  if (form.kind === 'signup' && bundle.plans.length && !planId) {
    throw new CrmError(400, 'bad_plan', 'Choose a plan.');
  }
  const emailOptIn = body.emailOptIn === true || body.email_optin === true;
  const optInAnswer = form.email_optin_enabled === true ? emailOptIn : null;
  const saved = await withTx(pool, async client => {
    const guardianName = joinName(guardianFirst, guardianLast) || joinName(firstName, lastName);
    const lead = await client.query(
      `insert into leads
         (location_id, guardian_name, email, child_name, child_age, source, status, pipeline_status,
          first_name, last_name, guardian_first_name, guardian_last_name)
       values ($1, $2, $3, $4, $5, $6, 'new', 'new', $7, $8, $9, $10)
       returning id`,
      [
        form.location_id,
        guardianName,
        email,
        joinName(firstName, lastName),
        age == null ? null : String(age),
        'form:' + String(form.slug),
        firstName,
        lastName || null,
        guardianFirst || null,
        guardianLast || null,
      ],
    );
    const leadId = String(lead.rows[0].id);
    if (minor && signature) {
      const waiver = bundle.docs.find(doc => doc.document_kind === 'waiver') || { waiver_version: 'form' };
      await client.query(
        `insert into lead_waivers
           (lead_id, waiver_version, signer_name, signed_on, minor, first_name, last_name,
            guardian_first_name, guardian_last_name, signature_data, signed_by_guardian_name)
         values ($1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10)`,
        [
          leadId,
          waiver.waiver_version || 'form',
          joinName(guardianFirst, guardianLast),
          today,
          firstName,
          lastName || null,
          guardianFirst,
          guardianLast,
          signature,
          joinName(guardianFirst, guardianLast),
        ],
      );
    }
    let memberId: string | null = null;
    let familyId: string | null = null;
    if (form.kind === 'signup' || form.kind === 'trial') {
      let guardian = await client.query(`select id from guardians where email = $1`, [email]);
      if (!guardian.rowCount) {
        guardian = await client.query(
          `insert into guardians (email, first_name, last_name) values ($1, $2, $3) returning id`,
          [email, guardianFirst || firstName, guardianLast || lastName || firstName],
        );
      }
      const family = await client.query(
        `insert into families (display_name) values ($1) returning id`,
        [joinName(firstName, lastName) || firstName],
      );
      familyId = String(family.rows[0].id);
      await client.query(
        `insert into guardian_families (family_id, guardian_id, role) values ($1, $2, 'payer') on conflict do nothing`,
        [familyId, guardian.rows[0].id],
      );
      const member = await client.query(
        `insert into members (family_id, location_id, first_name, last_name, birth_date, status)
         values ($1, $2, $3, $4, $5, 'trial') returning id`,
        [familyId, form.location_id, firstName, lastName || firstName, birthDate],
      );
      memberId = String(member.rows[0].id);
      if (optInAnswer != null) {
        await client.query(
          `insert into notification_preferences
             (guardian_id, marketing, marketing_source, marketing_consented_at, marketing_revoked_at)
           values ($1, $2, 'form', case when $2 then now() else null end, case when $2 then null else now() end)
           on conflict (guardian_id) do update
             set marketing = excluded.marketing,
                 marketing_source = 'form',
                 marketing_consented_at = case when excluded.marketing then now() else notification_preferences.marketing_consented_at end,
                 marketing_revoked_at = case when excluded.marketing then null else now() end`,
          [guardian.rows[0].id, optInAnswer],
        );
      }
    }
    await client.query(
      `insert into form_submissions (form_id, lead_id, member_id, answers, email_optin)
       values ($1, $2, $3, $4::jsonb, $5)`,
      [form.id, leadId, memberId, JSON.stringify(answers), optInAnswer],
    );
    const dry = await fireDryRun(client, {
      trigger: 'form_submitted',
      locationId: String(form.location_id),
      leadId,
      memberId,
      familyId,
      marketingOptIn: optInAnswer === true,
      context: { first_name: firstName, email, full_name: joinName(firstName, lastName) },
    });
    return { leadId, memberId, dry };
  });
  return {
    status: 201,
    body: {
      leadId: saved.leadId,
      memberId: saved.memberId,
      redirectUrl: form.redirect_url,
      emailOptIn: optInAnswer,
      sent: false,
      delivered: false,
      enrollments: saved.dry.enrollments,
    },
  };
}

async function staffForm(db: Sql, actor: Actor, id: string) {
  const row = await db.query(`select id, location_id from forms where id = $1`, [id]);
  if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  requireSchool(actor, String(row.rows[0].location_id));
  return row.rows[0];
}

export async function listForms(db: Sql, actor: Actor | null, search: URLSearchParams) {
  const staff = requireStaff(actor);
  const locationId = search.get('locationId') || '';
  if (locationId) requireSchool(staff, locationId);
  const rows = await db.query(
    `select id, location_id, brand, kind, slug, title, redirect_url, active
     from forms
     where ($1 = '' or location_id = $1)
       and ($2::boolean or location_id = any($3::text[]))
     order by title`,
    [locationId, staff.role === 'admin', staff.locationIds],
  );
  return { status: 200, body: { forms: rows.rows } };
}

export async function createForm(pool: SqlPool, actor: Actor | null, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  const locationId = String(body.locationId || body.location_id || '');
  requireSchool(staff, locationId);
  const brand = String(body.brand || '');
  if (brand !== 'lvlup' && brand !== 'goninja') throw new CrmError(400, 'bad_brand', 'Brand must be lvlup or goninja.');
  const kind = String(body.kind || '');
  if (!KINDS.has(kind)) throw new CrmError(400, 'bad_kind', 'Unknown form kind.');
  const title = String(body.title || '').trim();
  if (!title) throw new CrmError(400, 'bad_form', 'Title is required.');
  const fields = cleanFields(body.fields);
  const docs = cleanDocs(body.documents);
  const planIds = Array.isArray(body.planIds) ? body.planIds.map(id => assertUuid(String(id))) : [];
  try {
    const saved = await withTx(pool, async client => {
      const form = await client.query(
        `insert into forms
           (location_id, brand, kind, slug, title, redirect_url, theme, require_guardian_for_minor,
            email_optin_enabled, email_optin_label)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
         returning id, slug`,
        [
          locationId,
          brand,
          kind,
          slugOf(body.slug),
          title,
          assertRedirectUrl(body.redirectUrl ?? body.redirect_url),
          JSON.stringify(cleanTheme(body.theme)),
          body.requireGuardianForMinor !== false,
          body.emailOptInEnabled !== false,
          body.emailOptInLabel == null ? null : String(body.emailOptInLabel).slice(0, 200),
        ],
      );
      const formId = String(form.rows[0].id);
      for (const field of fields) {
        await client.query(
          `insert into form_fields (form_id, key, label, type, options, required, sort_order)
           values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
          [formId, field.key, field.label, field.type, JSON.stringify(field.options), field.required, field.sortOrder],
        );
      }
      for (const doc of docs) {
        await client.query(
          `insert into form_documents (form_id, document_kind, waiver_version, required_signature)
           values ($1, $2, $3, $4)`,
          [formId, doc.documentKind, doc.waiverVersion, doc.requiredSignature],
        );
      }
      for (const [index, planId] of planIds.entries()) {
        const plan = await client.query(`select location_id from plans where id = $1`, [planId]);
        if (!plan.rowCount || String(plan.rows[0].location_id) !== locationId) {
          throw new CrmError(400, 'bad_plan', 'Plans must belong to the form school.');
        }
        await client.query(
          `insert into form_plan_options (form_id, plan_id, sort_order) values ($1, $2, $3)`,
          [formId, planId, index],
        );
      }
      return form.rows[0];
    });
    return { status: 201, body: { id: saved.id, slug: saved.slug } };
  } catch (err) {
    rethrowDb(err);
  }
}

export async function patchForm(db: Sql, actor: Actor | null, id: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  assertUuid(id);
  await staffForm(db, staff, id);
  const title = body.title == null ? null : String(body.title).trim();
  const active = body.active == null ? null : body.active === true;
  const redirect = body.redirectUrl === undefined && body.redirect_url === undefined
    ? undefined
    : assertRedirectUrl(body.redirectUrl ?? body.redirect_url);
  const saved = await db.query(
    `update forms
     set title = coalesce($2, title),
         active = coalesce($3, active),
         redirect_url = case when $4::boolean then $5 else redirect_url end,
         theme = case when $6::jsonb is null then theme else $6::jsonb end,
         updated_at = now()
     where id = $1
     returning id, title, slug, active, redirect_url`,
    [
      id,
      title,
      active,
      redirect !== undefined,
      redirect ?? null,
      body.theme === undefined ? null : JSON.stringify(cleanTheme(body.theme)),
    ],
  );
  return { status: 200, body: saved.rows[0] };
}

export async function orderFormPlans(pool: SqlPool, actor: Actor | null, id: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  assertUuid(id);
  await staffForm(pool, staff, id);
  const planIds = Array.isArray(body.planIds) ? body.planIds.map(planId => assertUuid(String(planId))) : [];
  if (!planIds.length) throw new CrmError(400, 'bad_plan', 'Send planIds in the new order.');
  await withTx(pool, async client => {
    const existing = await client.query(`select plan_id from form_plan_options where form_id = $1`, [id]);
    const known = new Set(existing.rows.map(row => String(row.plan_id)));
    if (known.size !== planIds.length || planIds.some(planId => !known.has(planId))) {
      throw new CrmError(400, 'bad_plan', 'Order the plans already on this form.');
    }
    for (const [index, planId] of planIds.entries()) {
      await client.query(
        `update form_plan_options set sort_order = $3 where form_id = $1 and plan_id = $2`,
        [id, planId, index],
      );
    }
  });
  const ordered = await pool.query(
    `select plan_id, sort_order, featured from form_plan_options where form_id = $1 order by sort_order`,
    [id],
  );
  return { status: 200, body: { planIds: ordered.rows.map(row => row.plan_id), plans: ordered.rows } };
}

export async function createLeadInvite(db: Sql, actor: Actor | null, leadId: string, body: Record<string, unknown>) {
  const staff = requireStaff(actor);
  assertUuid(leadId);
  const lead = await db.query(`select id, location_id, first_name from leads where id = $1`, [leadId]);
  if (!lead.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  requireSchool(staff, String(lead.rows[0].location_id));
  const startOn = String(body.startOn || body.start_on || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startOn)) throw new CrmError(400, 'bad_date', 'Use a YYYY-MM-DD start date.');
  const planId = body.planId || body.plan_id ? assertUuid(String(body.planId || body.plan_id)) : null;
  if (planId) {
    const plan = await db.query(`select location_id from plans where id = $1`, [planId]);
    if (!plan.rowCount || String(plan.rows[0].location_id) !== String(lead.rows[0].location_id)) {
      throw new CrmError(400, 'bad_plan', 'That plan is not at this school.');
    }
  }
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const author = await db.query(`select id from staff_users where lower(email) = lower($1) limit 1`, [staff.email]);
  const saved = await db.query(
    `insert into lead_invites (lead_id, plan_id, start_on, token_hash, expires_at, created_by)
     values ($1, $2, $3, $4, now() + interval '14 days', $5)
     returning id, start_on, expires_at, sent_at, accepted_at`,
    [leadId, planId, startOn, tokenHash, author.rows[0]?.id || null],
  );
  const row = saved.rows[0];
  const startText = row.start_on instanceof Date ? row.start_on.toISOString().slice(0, 10) : String(row.start_on).slice(0, 10);
  return {
    status: 201,
    body: {
      id: row.id,
      leadId,
      planId,
      startOn: startText,
      expiresAt: row.expires_at,
      sentAt: row.sent_at,
      acceptedAt: row.accepted_at,
      sent: false,
      delivered: false,
      link: '/v1/public/invites/' + token,
      token,
    },
  };
}

export async function acceptLeadInvite(db: Sql, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new CrmError(404, 'not_found', 'Not found.');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const invite = await db.query(
    `select i.id, i.lead_id, i.plan_id, i.start_on, i.expires_at, i.accepted_at, l.location_id, l.first_name
     from lead_invites i join leads l on l.id = i.lead_id
     where i.token_hash = $1`,
    [tokenHash],
  );
  if (!invite.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  const row = invite.rows[0];
  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    throw new CrmError(410, 'invite_expired', 'That invite has expired.');
  }
  const startText = row.start_on instanceof Date ? row.start_on.toISOString().slice(0, 10) : String(row.start_on).slice(0, 10);
  if (row.accepted_at) {
    return { status: 200, body: { accepted: true, alreadyAccepted: true, startOn: startText, sent: false } };
  }
  await db.query(`update lead_invites set accepted_at = now() where id = $1 and accepted_at is null`, [row.id]);
  const dry = await fireDryRun(db, {
    trigger: 'lead_invite_accepted',
    locationId: String(row.location_id),
    leadId: String(row.lead_id),
    marketingOptIn: false,
    context: { first_name: String(row.first_name || '') },
  });
  return {
    status: 200,
    body: {
      accepted: true,
      alreadyAccepted: false,
      startOn: startText,
      planId: row.plan_id,
      sent: false,
      delivered: false,
      enrollments: dry.enrollments,
    },
  };
}
