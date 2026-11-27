/**
 * Automations and family messaging routes. Delivery stays off.
 */
import type { Actor } from './auth.ts';
import { CrmError } from './errors.ts';
import { platformRoleOf } from './scope.ts';
import { AUTOMATION_CATALOG } from './automation-catalog.ts';
import { familyMarketingOptIn } from './automation-run.ts';
import { recordAutomationTag } from './tag-effects.ts';
import {
  assertLocationId,
  deliverySnapshot,
  isLocationId,
  matchingWorkflows,
  marketingSuppressed,
  planEnrollment,
  sanitizePublicTemplate,
  type AutomationStep,
  type AutomationWorkflow,
  type LocationAutomationSettings,
  type MergeContext,
  type PlannedEnrollment,
  type StepType,
  type TriggerEvent,
  type TriggerType,
} from './automations.ts';

type Db = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  release?: () => void;
};

type Pool = Db & { connect: () => Promise<Db> };

const PHONE_TEST = /\{phone[^}]*\}|\b(?:tel|sms):|(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/i;

export function containsDisallowedContact(text: string): boolean {
  return PHONE_TEST.test(text);
}

function staffRole(actor: Actor) {
  const role = platformRoleOf(actor);
  if (role === 'family') throw new CrmError(404, 'not_found', 'Not found.');
  return role;
}

function canSchool(actor: Actor, locationId: string) {
  const role = staffRole(actor);
  if (role !== 'owner' && !actor.locationIds.includes(locationId)) {
    throw new CrmError(404, 'not_found', 'Not found.');
  }
  return role;
}

async function withTx<T>(pool: Pool, fn: (client: Db) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release?.();
  }
}

async function loadWorkflows(pool: Db): Promise<AutomationWorkflow[]> {
  const workflows = await pool.query(
    `select id, code, category, brand, name, trigger_type, trigger_rules, exit_conditions, enabled, dry_run, staff_note, marketing
     from automation_workflows order by category, code`,
  );
  const steps = await pool.query(
    `select w.code, s.step_key, s.step_type, s.sort_order, s.config, s.next_step_key, s.branch_yes_key, s.branch_no_key
     from automation_steps s join automation_workflows w on w.id = s.workflow_id
     order by s.sort_order`,
  );
  const grouped = new Map<string, AutomationStep[]>();
  for (const row of steps.rows) {
    const list = grouped.get(row.code) || [];
    list.push({
      stepKey: row.step_key,
      stepType: row.step_type as StepType,
      sortOrder: row.sort_order,
      config: row.config || {},
      nextStepKey: row.next_step_key,
      branchYesKey: row.branch_yes_key,
      branchNoKey: row.branch_no_key,
    });
    grouped.set(row.code, list);
  }
  return workflows.rows.map(row => ({
    code: row.code,
    category: row.category,
    brand: row.brand,
    name: row.name,
    trigger: row.trigger_type as TriggerType,
    rules: row.trigger_rules || {},
    exits: row.exit_conditions || [],
    steps: grouped.get(row.code) || [],
    marketing: row.marketing === true,
    id: row.id,
    enabled: row.enabled,
    dryRun: row.dry_run,
    staffNote: row.staff_note || '',
  }));
}

async function loadSettings(pool: Db, locationId: string): Promise<LocationAutomationSettings> {
  const row = await pool.query(
    `select s.location_id, s.review_url, s.programs, s.toggles, l.brand::text as brand, l.name
     from location_automation_settings s
     join locations l on l.id = s.location_id
     where s.location_id = $1`,
    [locationId],
  );
  if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  const found = row.rows[0];
  return {
    locationId: found.location_id,
    brand: found.brand === 'goninja' ? 'goninja' : 'lvlup',
    locationName: found.name,
    reviewUrl: found.review_url,
    programs: found.programs || {},
    toggles: found.toggles || {},
  };
}

function summary(workflow: AutomationWorkflow & { id?: string; enabled?: boolean; dryRun?: boolean; staffNote?: string }) {
  return {
    id: workflow.id,
    code: workflow.code,
    category: workflow.category,
    brand: workflow.brand,
    name: workflow.name,
    trigger: workflow.trigger,
    rules: workflow.rules,
    exits: workflow.exits,
    stepCount: workflow.steps.length,
    enabled: false,
    dryRun: true,
    sent: false,
    staffNote: workflow.staffNote || '',
  };
}

async function memberContext(pool: Db, memberId: string) {
  const row = await pool.query(
    `select m.id, m.family_id, m.location_id, m.first_name, m.last_name,
            g.first_name as parent_first_name, g.last_name as guardian_last_name, g.email
     from members m
     left join lateral (
       select gu.first_name, gu.last_name, gu.email
       from guardian_families gf
       join guardians gu on gu.id = gf.guardian_id
       where gf.family_id = m.family_id
       order by gu.created_at
       limit 1
     ) g on true
     where m.id = $1`,
    [memberId],
  );
  if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  return row.rows[0];
}

function eventFrom(body: Record<string, any>, locationId: string): TriggerEvent {
  if (body.sessionId || body.session_id || body.rules?.session_id || body.rules?.sessionId) {
    throw new CrmError(400, 'session_id_not_accepted', 'Automations bind to a program and class kind, not a session id.');
  }
  const facts = body.facts && typeof body.facts === 'object' ? body.facts : {};
  const cleanFacts: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (PHONE_TEST.test(key)) throw new CrmError(400, 'phone_not_accepted', 'This form does not collect phone numbers.');
    cleanFacts[key] = value === true;
  }
  return {
    trigger: String(body.trigger || ''),
    locationId,
    programSlug: body.programSlug || body.program_slug || null,
    classKind: body.classKind || body.class_kind || null,
    source: body.source || null,
    reason: body.reason || null,
    rankSlug: body.rankSlug || body.rank_slug || null,
    absenceDays: body.absenceDays == null && body.absence_days == null ? null : Number(body.absenceDays ?? body.absence_days),
    streak: body.streak == null ? null : Number(body.streak),
    phase: body.phase || null,
    sequence: body.sequence || null,
    facts: cleanFacts,
  };
}

function mergeFrom(body: Record<string, any>, member: any, settings: LocationAutomationSettings): MergeContext {
  const given = body.context && typeof body.context === 'object' ? body.context : {};
  const first = String(given.first_name || member?.first_name || '');
  const last = String(given.last_name || member?.last_name || '');
  const parent = String(given.parent_first_name || member?.parent_first_name || '');
  const guardian = String(given.guardian_name || [member?.parent_first_name, member?.guardian_last_name].filter(Boolean).join(' '));
  return {
    first_name: sanitizePublicTemplate(first),
    parent_first_name: sanitizePublicTemplate(parent),
    name: sanitizePublicTemplate(String(given.name || first)),
    email: sanitizePublicTemplate(String(given.email || member?.email || '')),
    member_id: String(member?.id || given.member_id || ''),
    full_name: sanitizePublicTemplate(String(given.full_name || [first, last].filter(Boolean).join(' '))),
    guardian_name: sanitizePublicTemplate(guardian),
    location_name: settings.locationName,
    review_url: settings.reviewUrl,
  };
}

async function persistPlan(
  client: Db,
  workflow: AutomationWorkflow & { id?: string },
  plan: PlannedEnrollment,
  event: TriggerEvent,
  ids: { familyId?: string | null; memberId?: string | null; leadId?: string | null },
) {
  const stored = await client.query(
    `select id from automation_workflows where code = $1`,
    [workflow.code],
  );
  const workflowId = stored.rows[0]?.id || workflow.id;
  const enrollment = await client.query(
    `insert into automation_enrollments
       (workflow_id, location_id, family_id, member_id, lead_id, status, exit_reason, context, exited_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, case when $6 = 'exited' then now() else null end)
     returning id`,
    [
      workflowId,
      event.locationId,
      ids.familyId || null,
      ids.memberId || null,
      ids.leadId || null,
      plan.status,
      plan.exitReason,
      JSON.stringify({ tags: plan.tags, trigger: event.trigger }),
    ],
  );
  const enrollmentId = enrollment.rows[0].id;
  const stepRows = await client.query(
    `select id, step_key from automation_steps where workflow_id = $1`,
    [workflowId],
  );
  const stepIds = new Map(stepRows.rows.map(row => [row.step_key, row.id]));
  for (const step of plan.steps) {
    let rendered = step.rendered;
    if (step.stepType === 'add_tag' || step.stepType === 'remove_tag') {
      const intent = await recordAutomationTag(client, {
        dryRun: true,
        op: step.stepType === 'add_tag' ? 'add' : 'remove',
        tagName: String(rendered.tag || ''),
        locationId: event.locationId,
        memberId: ids.memberId,
        leadId: ids.leadId,
        familyId: ids.familyId,
      });
      rendered = { ...rendered, applied: intent.applied, tagId: intent.tagId, reason: intent.reason };
    }
    await client.query(
      `insert into automation_step_runs (enrollment_id, step_id, status, rendered)
       values ($1, $2, 'dry_run', $3::jsonb)`,
      [enrollmentId, stepIds.get(step.stepKey), JSON.stringify(rendered)],
    );
    if (step.stepType === 'add_document') {
      await client.query(
        `insert into automation_document_grants (enrollment_id, location_id, document_code, title, audience, dry_run)
         values ($1, $2, $3, $4, $5, true)`,
        [
          enrollmentId,
          event.locationId,
          step.rendered.documentCode,
          step.rendered.title,
          step.rendered.audience || 'member',
        ],
      );
      if (ids.familyId && ids.memberId) {
        await client.query(
          `insert into member_documents (family_id, member_id, kind, title, minor)
           values ($1, $2, 'waiver', $3, true)`,
          [ids.familyId, ids.memberId, step.rendered.title],
        );
      }
    }
  }
  return enrollmentId;
}

function publicPlan(plan: PlannedEnrollment, enrollmentId: string) {
  return {
    enrollmentId,
    code: plan.code,
    status: plan.status,
    exitReason: plan.exitReason,
    sent: false,
    steps: plan.steps.map(step => ({
      stepKey: step.stepKey,
      stepType: step.stepType,
      status: 'dry_run',
      rendered: step.rendered,
    })),
  };
}

async function evaluate(pool: Pool, actor: Actor, body: Record<string, any>, env: NodeJS.ProcessEnv) {
  const role = staffRole(actor);
  if (role === 'coach' || role === 'front_desk') throw new CrmError(403, 'forbidden', 'Not allowed.');
  let member: any = null;
  if (body.memberId) member = await memberContext(pool, String(body.memberId));
  const requested = String(body.locationId || body.location_id || member?.location_id || '');
  const locationId = assertLocationId(member ? member.location_id : requested);
  canSchool(actor, locationId);
  const settings = await loadSettings(pool, locationId);
  const event = eventFrom(body, locationId);
  if (!event.trigger) throw new CrmError(400, 'bad_trigger', 'Trigger is required.');
  const known = new Set(AUTOMATION_CATALOG.map(item => item.trigger));
  if (!known.has(event.trigger as TriggerType)) throw new CrmError(400, 'bad_trigger', 'Unknown trigger.');
  const workflows = await loadWorkflows(pool);
  const matched = matchingWorkflows(workflows, event, settings);
  const context = mergeFrom(body, member, settings);
  const familyId = member?.family_id || body.familyId || null;
  const optedIn = await familyMarketingOptIn(pool, familyId);
  const plans = await withTx(pool, async client => {
    const saved = [];
    const seen = new Set(matched.map(item => item.code));
    const queue = matched.map(workflow => ({ workflow, depth: 0 }));
    for (let i = 0; i < queue.length; i += 1) {
      const current = queue[i];
      const plan = marketingSuppressed(current.workflow, { marketing: optedIn })
        ? { code: current.workflow.code, status: 'exited' as const, exitReason: 'marketing_opt_out', steps: [], tags: [] as string[] }
        : planEnrollment(current.workflow, event, settings, context, env);
      const enrollmentId = await persistPlan(client, current.workflow, plan, event, {
        familyId,
        memberId: member?.id || body.memberId || null,
        leadId: body.leadId || null,
      });
      saved.push(publicPlan(plan, enrollmentId));
      if (current.depth >= 1) continue;
      for (const step of plan.steps) {
        if (step.stepType !== 'start_automation') continue;
        const childCode = String(step.rendered.workflowCode || '');
        if (!childCode || seen.has(childCode)) continue;
        const child = workflows.find(item => item.code === childCode);
        if (!child) continue;
        seen.add(childCode);
        queue.push({ workflow: child, depth: 1 });
      }
    }
    return saved;
  });
  return {
    status: 200,
    body: {
      ...deliverySnapshot(env),
      locationId,
      reviewUrl: settings.reviewUrl,
      enrollments: plans,
    },
  };
}

function assertMessageBody(body: string) {
  const text = String(body || '').trim();
  if (!text || text.length > 4000) throw new CrmError(400, 'bad_message', 'Write a message under 4000 characters.');
  if (containsDisallowedContact(text)) {
    throw new CrmError(400, 'phone_not_accepted', 'Messages cannot include phone numbers.');
  }
  return text;
}

async function visibleThread(pool: Db, actor: Actor, threadId: string) {
  const row = await pool.query(`select * from message_threads where id = $1`, [threadId]);
  if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  const thread = row.rows[0];
  const role = platformRoleOf(actor);
  if (role === 'family') {
    if (!actor.familyIds.includes(thread.family_id)) throw new CrmError(404, 'not_found', 'Not found.');
    return thread;
  }
  canSchool(actor, thread.location_id);
  return thread;
}

async function queuePush(client: Db, thread: any, message: { id: string; body: string }, audience: 'family' | 'staff') {
  const tokens = audience === 'family'
    ? await client.query(
      `select dt.id from device_tokens dt
       left join guardian_families gf on gf.guardian_id = dt.guardian_id
       left join members m on m.id = dt.member_id
       where gf.family_id = $1 or m.family_id = $1`,
      [thread.family_id],
    )
    : await client.query(
      `select dt.id from device_tokens dt
       join staff_location_grants g on g.staff_id = dt.staff_id
       where g.location_id = $1`,
      [thread.location_id],
    );
  const payload = {
    audience,
    locationId: thread.location_id,
    familyId: thread.family_id,
    threadId: thread.id,
    messageId: message.id,
    title: audience === 'family' ? 'New message from your school' : 'New family message',
    bodyPreview: sanitizePublicTemplate(message.body).slice(0, 80),
    deviceTokenIds: tokens.rows.map(row => row.id),
    delivered: false,
    dryRun: true,
  };
  await client.query(
    `insert into push_notification_outbox (thread_id, message_id, audience, location_id, family_id, payload, delivered, dry_run)
     values ($1, $2, $3, $4, $5, $6::jsonb, false, true)`,
    [thread.id, message.id, audience, thread.location_id, thread.family_id, JSON.stringify(payload)],
  );
  return payload;
}

export async function handleComms(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor;
  body: Record<string, any>;
  pool: Pool;
  env: NodeJS.ProcessEnv;
}): Promise<{ status: number; body: unknown } | null> {
  const { method, parts, search, actor, pool, env } = input;
  const body = input.body || {};
  if (parts[1] !== 'automations' && parts[1] !== 'messages' && parts[1] !== 'locations') return null;

  if (parts[1] === 'locations' && parts[3] === 'automation-settings') {
    const locationId = assertLocationId(parts[2] || '');
    if (method === 'GET') {
      canSchool(actor, locationId);
      const settings = await loadSettings(pool, locationId);
      return { status: 200, body: { ...settings, sent: false } };
    }
    if (method === 'PATCH') {
      const role = canSchool(actor, locationId);
      if (role !== 'owner' && role !== 'school_lead') throw new CrmError(403, 'forbidden', 'Not allowed.');
      if (body.reviewUrl != null || body.review_url != null) {
        const reviewUrl = String(body.reviewUrl ?? body.review_url);
        if (!/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*$/.test(reviewUrl) || containsDisallowedContact(reviewUrl)) {
          throw new CrmError(400, 'bad_review_url', 'Review links must be https addresses without phone numbers.');
        }
        await pool.query(
          `update location_automation_settings set review_url = $2, updated_at = now() where location_id = $1`,
          [locationId, reviewUrl],
        );
      }
      if (body.programs && typeof body.programs === 'object') {
        for (const [key, value] of Object.entries(body.programs)) {
          if (!/^[a-z0-9_]+$/.test(key) || typeof value !== 'boolean') {
            throw new CrmError(400, 'bad_programs', 'Program flags must be true or false.');
          }
        }
        await pool.query(
          `update location_automation_settings set programs = programs || $2::jsonb, updated_at = now() where location_id = $1`,
          [locationId, JSON.stringify(body.programs)],
        );
      }
      if (body.toggles && typeof body.toggles === 'object') {
        for (const [key, value] of Object.entries(body.toggles)) {
          if (!/^[a-z0-9_]+$/.test(key) || typeof value !== 'boolean') {
            throw new CrmError(400, 'bad_toggles', 'Toggles must be true or false.');
          }
        }
        await pool.query(
          `update location_automation_settings set toggles = toggles || $2::jsonb, updated_at = now() where location_id = $1`,
          [locationId, JSON.stringify(body.toggles)],
        );
      }
      const settings = await loadSettings(pool, locationId);
      return { status: 200, body: { ...settings, sent: false } };
    }
  }

  if (parts[1] === 'automations' && method === 'GET' && !parts[2]) {
    staffRole(actor);
    const workflows = await loadWorkflows(pool);
    const category = search.get('category') || '';
    const visible = workflows.filter(item => !category || item.category === category);
    return { status: 200, body: { sent: false, dryRun: true, automations: visible.map(summary) } };
  }

  if (parts[1] === 'automations' && method === 'PATCH' && parts[2] && isUuid(parts[2])) {
    if (staffRole(actor) !== 'owner') throw new CrmError(403, 'forbidden', 'Owner only.');
    if (body.enabled === true || body.dryRun === false || body.dry_run === false) {
      throw new CrmError(409, 'delivery_disabled', 'Automations stay in dry-run in this build.');
    }
    const note = body.staffNote == null && body.staff_note == null ? null : String(body.staffNote ?? body.staff_note).slice(0, 500);
    if (note != null && containsDisallowedContact(note)) {
      throw new CrmError(400, 'phone_not_accepted', 'Notes cannot include phone numbers.');
    }
    const updated = await pool.query(
      `update automation_workflows set staff_note = coalesce($2, staff_note) where id = $1
       returning id, code, enabled, dry_run, staff_note`,
      [parts[2], note],
    );
    if (!updated.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    return {
      status: 200,
      body: { ...updated.rows[0], enabled: false, dryRun: true, sent: false },
    };
  }

  if (parts[1] === 'automations' && method === 'POST' && parts[2] === 'evaluate') {
    return evaluate(pool, actor, body, env);
  }

  if (parts[1] === 'automations' && method === 'GET' && parts[2] === 'runs') {
    const role = staffRole(actor);
    const locationId = search.get('locationId') || '';
    if (locationId) canSchool(actor, locationId);
    const rows = await pool.query(
      `select r.id, r.status, r.rendered, r.created_at, w.code, w.category, e.location_id, e.status as enrollment_status, e.exit_reason
       from automation_step_runs r
       join automation_enrollments e on e.id = r.enrollment_id
       join automation_workflows w on w.id = e.workflow_id
       where ($1 = '' or e.location_id = $1)
         and ($2 = 'owner' or e.location_id = any($3::text[]))
       order by r.created_at desc
       limit 100`,
      [locationId, role, actor.locationIds],
    );
    return { status: 200, body: { sent: false, runs: rows.rows } };
  }

  if (parts[1] === 'messages' && parts[2] === 'unread' && method === 'GET') {
    const role = platformRoleOf(actor);
    if (role === 'family') {
      const rows = await pool.query(
        `select coalesce(sum(family_unread_count), 0)::int as count
         from message_threads where family_id::text = any($1::text[]) and status = 'open'`,
        [actor.familyIds],
      );
      return { status: 200, body: { count: rows.rows[0].count, side: 'family' } };
    }
    const scope = staffRole(actor);
    const rows = await pool.query(
      `select coalesce(sum(staff_unread_count), 0)::int as count
       from message_threads
       where status = 'open' and ($1 = 'owner' or location_id = any($2::text[]))`,
      [scope, actor.locationIds],
    );
    return { status: 200, body: { count: rows.rows[0].count, side: 'staff' } };
  }

  if (parts[1] === 'messages' && parts[2] === 'push-outbox' && method === 'GET') {
    const role = staffRole(actor);
    const rows = await pool.query(
      `select id, thread_id, message_id, audience, location_id, family_id, payload, delivered, dry_run, created_at
       from push_notification_outbox
       where ($1 = 'owner' or location_id = any($2::text[]))
       order by created_at desc
       limit 100`,
      [role, actor.locationIds],
    );
    return { status: 200, body: { sent: false, delivered: false, dryRun: true, items: rows.rows } };
  }

  if (parts[1] === 'messages' && parts[2] === 'threads' && method === 'GET' && !parts[3]) {
    const role = platformRoleOf(actor);
    const status = search.get('status') || '';
    if (role === 'family') {
      const rows = await pool.query(
        `select * from message_threads
         where family_id::text = any($1::text[]) and ($2 = '' or status = $2)
         order by coalesce(last_message_at, created_at) desc`,
        [actor.familyIds, status],
      );
      return { status: 200, body: { threads: rows.rows } };
    }
    const scope = staffRole(actor);
    const locationId = search.get('locationId') || '';
    if (locationId) canSchool(actor, locationId);
    const rows = await pool.query(
      `select * from message_threads
       where ($1 = 'owner' or location_id = any($2::text[]))
         and ($3 = '' or location_id = $3)
         and ($4 = '' or status = $4)
       order by coalesce(last_message_at, created_at) desc`,
      [scope, actor.locationIds, locationId, status],
    );
    return { status: 200, body: { threads: rows.rows } };
  }

  if (parts[1] === 'messages' && parts[2] === 'threads' && method === 'POST' && !parts[3]) {
    const locationId = assertLocationId(String(body.locationId || ''));
    const familyId = String(body.familyId || '');
    const text = assertMessageBody(body.body);
    const subject = sanitizePublicTemplate(String(body.subject || 'Message')).slice(0, 200) || 'Message';
    const category = String(body.category || 'general');
    if (!/^[a-z0-9_]{1,40}$/.test(category)) throw new CrmError(400, 'bad_category', 'Unknown category.');
    const role = platformRoleOf(actor);
    if (role === 'family') {
      if (!actor.familyIds.includes(familyId)) throw new CrmError(404, 'not_found', 'Not found.');
    } else {
      canSchool(actor, locationId);
    }
    const memberOk = await pool.query(
      `select id from members where family_id = $1::uuid and ($2::text is null or id::text = $2::text) and location_id = $3 limit 1`,
      [familyId, body.memberId || null, locationId],
    );
    if (!memberOk.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
    const sender = await senderFor(pool, actor, role === 'family' ? 'family' : 'staff');
    const created = await withTx(pool, async client => {
      const thread = await client.query(
        `insert into message_threads
           (family_id, member_id, location_id, subject, category, status, last_message_at, staff_unread_count, family_unread_count)
         values ($1, $2, $3, $4, $5, 'open', now(), $6, $7)
         returning *`,
        [familyId, body.memberId || null, locationId, subject, category, role === 'family' ? 1 : 0, role === 'family' ? 0 : 1],
      );
      const message = await client.query(
        `insert into messages (thread_id, sender_type, sender_id, body) values ($1, $2, $3, $4) returning id, body`,
        [thread.rows[0].id, sender.type, sender.id, text],
      );
      const push = await queuePush(client, thread.rows[0], message.rows[0], role === 'family' ? 'staff' : 'family');
      return { thread: thread.rows[0], messageId: message.rows[0].id, push };
    });
    return { status: 201, body: { ...created, sent: false, delivered: false, dryRun: true } };
  }

  if (parts[1] === 'messages' && parts[2] === 'threads' && parts[3] && method === 'GET' && !parts[4]) {
    const thread = await visibleThread(pool, actor, parts[3]);
    const messages = await pool.query(
      `select id, thread_id, sender_type, sender_id, body, created_at from messages where thread_id = $1 order by created_at`,
      [thread.id],
    );
    return { status: 200, body: { thread, messages: messages.rows } };
  }

  if (parts[1] === 'messages' && parts[2] === 'threads' && parts[3] && parts[4] === 'messages' && method === 'POST') {
    const thread = await visibleThread(pool, actor, parts[3]);
    if (thread.status !== 'open') throw new CrmError(409, 'thread_closed', 'This thread is archived.');
    const text = assertMessageBody(body.body);
    const role = platformRoleOf(actor);
    const senderType = role === 'family' ? 'family' : 'staff';
    const sender = await senderFor(pool, actor, senderType);
    const saved = await withTx(pool, async client => {
      const message = await client.query(
        `insert into messages (thread_id, sender_type, sender_id, body) values ($1, $2, $3, $4) returning id, body, created_at`,
        [thread.id, sender.type, sender.id, text],
      );
      await client.query(
        `update message_threads
         set last_message_at = now(),
             staff_unread_count = staff_unread_count + $2,
             family_unread_count = family_unread_count + $3
         where id = $1`,
        [thread.id, senderType === 'family' ? 1 : 0, senderType === 'staff' ? 1 : 0],
      );
      const push = await queuePush(client, thread, message.rows[0], senderType === 'family' ? 'staff' : 'family');
      return { message: message.rows[0], push };
    });
    return { status: 201, body: { ...saved, sent: false, delivered: false, dryRun: true } };
  }

  if (parts[1] === 'messages' && parts[2] === 'threads' && parts[3] && parts[4] === 'read' && method === 'POST') {
    const thread = await visibleThread(pool, actor, parts[3]);
    const role = platformRoleOf(actor);
    const readerType = role === 'family' ? 'family' : 'staff';
    const sender = await senderFor(pool, actor, readerType);
    const readerId = sender.id || actor.email;
    await pool.query(
      `insert into message_read_receipts (thread_id, reader_type, reader_id, last_read_message_id, read_at)
       values ($1, $2, $3, $4, now())
       on conflict (thread_id, reader_type, reader_id)
       do update set last_read_message_id = excluded.last_read_message_id, read_at = now()`,
      [thread.id, readerType, readerId, body.lastReadMessageId || body.last_read_message_id || null],
    );
    await pool.query(
      `update message_threads
       set family_unread_count = case when $2 = 'family' then 0 else family_unread_count end,
           staff_unread_count = case when $2 = 'staff' then 0 else staff_unread_count end
       where id = $1`,
      [thread.id, readerType],
    );
    return { status: 200, body: { read: true, readerType } };
  }

  if (parts[1] === 'automations' || parts[1] === 'messages' || (parts[1] === 'locations' && parts[3] === 'automation-settings')) {
    throw new CrmError(404, 'not_found', 'Not found.');
  }
  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function senderFor(pool: Db, actor: Actor, type: 'family' | 'staff') {
  if (type === 'family') {
    const row = await pool.query(`select id from guardians where email = $1`, [actor.email]);
    return { type, id: row.rows[0]?.id || null };
  }
  const row = await pool.query(`select id from staff_users where email = $1`, [actor.email]);
  return { type, id: row.rows[0]?.id || null };
}

export function catalogCodes() {
  return AUTOMATION_CATALOG.map(item => item.code);
}

export function knownLocation(value: string) {
  return isLocationId(value);
}
