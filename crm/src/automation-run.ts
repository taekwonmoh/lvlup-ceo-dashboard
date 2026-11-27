/**
 * Dry-run enrollment for form, cancel, and invite triggers.
 * Tag steps record intent. entity_tags changes only when dryRun is false.
 */
import { CrmError } from './errors.ts';
import type { Sql } from './query.ts';
import { recordAutomationTag } from './tag-effects.ts';
import {
  matchingWorkflows,
  planEnrollment,
  marketingSuppressed,
  type AutomationStep,
  type AutomationWorkflow,
  type LocationAutomationSettings,
  type MergeContext,
  type StepType,
  type TriggerType,
} from './automations.ts';

type StoredWorkflow = AutomationWorkflow & { id: string };

async function loadWorkflows(db: Sql): Promise<StoredWorkflow[]> {
  const workflows = await db.query(
    `select id, code, category, brand, name, trigger_type, trigger_rules, exit_conditions, marketing
     from automation_workflows order by category, code`,
  );
  const steps = await db.query(
    `select w.code, s.step_key, s.step_type, s.sort_order, s.config, s.next_step_key, s.branch_yes_key, s.branch_no_key
     from automation_steps s join automation_workflows w on w.id = s.workflow_id
     order by s.sort_order`,
  );
  const grouped = new Map<string, AutomationStep[]>();
  for (const row of steps.rows) {
    const list = grouped.get(String(row.code)) || [];
    list.push({
      stepKey: String(row.step_key),
      stepType: String(row.step_type) as StepType,
      sortOrder: Number(row.sort_order),
      config: (row.config || {}) as Record<string, unknown>,
      nextStepKey: row.next_step_key ? String(row.next_step_key) : null,
      branchYesKey: row.branch_yes_key ? String(row.branch_yes_key) : null,
      branchNoKey: row.branch_no_key ? String(row.branch_no_key) : null,
    });
    grouped.set(String(row.code), list);
  }
  return workflows.rows.map(row => ({
    id: String(row.id),
    code: String(row.code),
    category: String(row.category),
    brand: row.brand as 'lvlup' | 'goninja' | 'shared',
    name: String(row.name),
    trigger: String(row.trigger_type) as TriggerType,
    rules: (row.trigger_rules || {}) as Record<string, unknown>,
    exits: Array.isArray(row.exit_conditions) ? row.exit_conditions.map(String) : [],
    steps: grouped.get(String(row.code)) || [],
    marketing: row.marketing === true,
  }));
}

async function loadSettings(db: Sql, locationId: string): Promise<LocationAutomationSettings> {
  const row = await db.query(
    `select s.location_id, s.review_url, s.programs, s.toggles, l.brand::text as brand, l.name
     from location_automation_settings s
     join locations l on l.id = s.location_id
     where s.location_id = $1`,
    [locationId],
  );
  if (!row.rowCount) throw new CrmError(404, 'not_found', 'Not found.');
  const found = row.rows[0];
  return {
    locationId: String(found.location_id),
    brand: found.brand === 'goninja' ? 'goninja' : 'lvlup',
    locationName: String(found.name),
    reviewUrl: String(found.review_url || ''),
    programs: (found.programs || {}) as Record<string, boolean>,
    toggles: (found.toggles || {}) as Record<string, boolean>,
  };
}

export async function familyMarketingOptIn(db: Sql, familyId: string | null): Promise<boolean> {
  if (!familyId) return false;
  const row = await db.query(
    `select exists (
       select 1
       from notification_preferences np
       join guardian_families gf on gf.guardian_id = np.guardian_id
       where gf.family_id = $1
         and np.marketing = true
         and np.marketing_revoked_at is null
     ) as opted_in`,
    [familyId],
  );
  return row.rows[0]?.opted_in === true;
}

export async function fireDryRun(db: Sql, input: {
  trigger: string;
  locationId: string;
  leadId?: string | null;
  memberId?: string | null;
  familyId?: string | null;
  marketingOptIn?: boolean;
  context?: MergeContext;
}): Promise<{
  sent: false;
  delivered: false;
  enrollments: Array<{ code: string; status: string; exitReason: string | null; tags: string[] }>;
}> {
  const settings = await loadSettings(db, input.locationId);
  const workflows = await loadWorkflows(db);
  const event = { trigger: input.trigger, locationId: input.locationId };
  const matched = matchingWorkflows(workflows, event, settings) as StoredWorkflow[];
  const preference = { marketing: input.marketingOptIn === true };
  const enrollments = [];
  for (const workflow of matched) {
    const suppressed = marketingSuppressed(workflow, preference);
    const plan = suppressed
      ? { code: workflow.code, status: 'exited' as const, exitReason: 'marketing_opt_out', steps: [], tags: [] as string[] }
      : planEnrollment(workflow, event, settings, input.context || {}, {});
    const saved = await db.query(
      `insert into automation_enrollments
         (workflow_id, location_id, family_id, member_id, lead_id, status, exit_reason, context, exited_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, case when $6 = 'exited' then now() else null end)
       returning id`,
      [
        workflow.id,
        input.locationId,
        input.familyId || null,
        input.memberId || null,
        input.leadId || null,
        plan.status,
        plan.exitReason,
        JSON.stringify({ tags: plan.tags, trigger: input.trigger, sent: false, dryRun: true }),
      ],
    );
    const stepRows = await db.query(
      `select id, step_key from automation_steps where workflow_id = $1`,
      [workflow.id],
    );
    const stepIds = new Map(stepRows.rows.map(row => [String(row.step_key), String(row.id)]));
    for (const step of plan.steps) {
      let rendered = step.rendered;
      if (step.stepType === 'add_tag' || step.stepType === 'remove_tag') {
        const intent = await recordAutomationTag(db, {
          dryRun: true,
          op: step.stepType === 'add_tag' ? 'add' : 'remove',
          tagName: String(rendered.tag || ''),
          locationId: input.locationId,
          memberId: input.memberId,
          leadId: input.leadId,
          familyId: input.familyId,
        });
        rendered = { ...rendered, applied: intent.applied, tagId: intent.tagId, reason: intent.reason };
      }
      await db.query(
        `insert into automation_step_runs (enrollment_id, step_id, status, rendered)
         values ($1, $2, 'dry_run', $3::jsonb)`,
        [saved.rows[0].id, stepIds.get(step.stepKey), JSON.stringify(rendered)],
      );
    }
    enrollments.push({
      code: plan.code,
      status: plan.status,
      exitReason: plan.exitReason,
      tags: plan.tags,
    });
  }
  return { sent: false, delivered: false, enrollments };
}
