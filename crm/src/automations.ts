/**
 * Canonical journey automations. This build plans steps and writes dry-run
 * rows. It never sends email, SMS, push, or webhooks.
 */
import { CrmError } from './errors.ts';

export const TRIGGER_TYPES = [
  'membership_start',
  'new_booking',
  'manual',
  'new_lead',
  'booking_no_show',
  'promotion',
  'absence',
  'member_frozen',
  'form_submitted',
  'booking_cancelled',
  'lead_invite_accepted',
] as const;

export const STEP_TYPES = [
  'delay',
  'email',
  'sms',
  'push',
  'split',
  'start_automation',
  'task',
  'add_tag',
  'remove_tag',
  'absence_wait',
  'webhook',
  'add_document',
] as const;

export const PUBLIC_MERGE_TAGS = [
  'first_name',
  'parent_first_name',
  'name',
  'email',
  'member_id',
  'full_name',
  'guardian_name',
  'location_name',
  'review_url',
] as const;

export const LOCATION_IDS = ['waunakee', 'eastmad', 'verona', 'deforest', 'goninjaW', 'goninjaV'] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];
export type StepType = (typeof STEP_TYPES)[number];

export type AutomationStep = {
  stepKey: string;
  stepType: StepType;
  sortOrder: number;
  config: Record<string, unknown>;
  nextStepKey: string | null;
  branchYesKey: string | null;
  branchNoKey: string | null;
};

export type AutomationWorkflow = {
  code: string;
  category: string;
  brand: 'lvlup' | 'goninja' | 'shared';
  name: string;
  trigger: TriggerType;
  rules: Record<string, unknown>;
  exits: string[];
  steps: AutomationStep[];
  marketing?: boolean;
};

export type TriggerEvent = {
  trigger: string;
  locationId: string;
  programSlug?: string | null;
  classKind?: string | null;
  source?: string | null;
  reason?: string | null;
  rankSlug?: string | null;
  absenceDays?: number | null;
  streak?: number | null;
  phase?: string | null;
  sequence?: string | null;
  facts?: Record<string, boolean>;
};

export type LocationAutomationSettings = {
  locationId: string;
  brand: 'lvlup' | 'goninja';
  locationName: string;
  reviewUrl: string;
  programs: Record<string, boolean>;
  toggles: Record<string, boolean>;
};

export type MergeContext = {
  first_name?: string;
  parent_first_name?: string;
  name?: string;
  email?: string;
  member_id?: string;
  full_name?: string;
  guardian_name?: string;
  location_name?: string;
  review_url?: string;
};

export type PlannedStep = {
  stepKey: string;
  stepType: StepType;
  rendered: Record<string, unknown>;
};

export type PlannedEnrollment = {
  code: string;
  status: 'completed' | 'exited';
  exitReason: string | null;
  steps: PlannedStep[];
  tags: string[];
};

const PHONE_CHARS = /(?:\{phone[^}]*\}|\b(?:tel|sms):[^\s<>"']+|\+?1?[\s.-]?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b)/gi;
const FOOTER_LINE = /^\s*(phone|call us|text us|tel|sms)\b/i;

export function isLocationId(value: string): boolean {
  return (LOCATION_IDS as readonly string[]).includes(value);
}

export function assertLocationId(value: string): string {
  if (!isLocationId(value)) throw new CrmError(400, 'bad_location', 'Unknown school.');
  return value;
}

/** Public copy loses phone merge tags, tel/sms links, and footer phone lines. */
export function sanitizePublicTemplate(input: string): string {
  const lines = String(input || '').split('\n').filter(line => !FOOTER_LINE.test(line));
  return lines.join('\n').replace(PHONE_CHARS, '').replace(/[ \t]{2,}/g, ' ').trim();
}

export function applyMergeTags(template: string, context: MergeContext): string {
  const cleaned = sanitizePublicTemplate(template);
  return cleaned.replace(/\{([a-z0-9_]+)\}/gi, (_all, tag: string) => {
    const key = tag.toLowerCase();
    if (!(PUBLIC_MERGE_TAGS as readonly string[]).includes(key)) return '';
    const value = context[key as keyof MergeContext];
    return sanitizePublicTemplate(value == null ? '' : String(value));
  });
}

/**
 * Webhook location always comes from the member's school.
 * A leftover `location=waunakee` query value is rewritten.
 */
export function bindWebhookLocation(template: string, locationId: string): string {
  const school = assertLocationId(locationId);
  let url = sanitizePublicTemplate(template).split('{location_id}').join(school);
  url = url.replace(/\{[a-z0-9_]+\}/gi, '');
  if (/[?&]location=/.test(url)) {
    url = url.replace(/([?&]location=)[^&#]*/g, `$1${school}`);
  } else {
    url += (url.includes('?') ? '&' : '?') + 'location=' + school;
  }
  return url;
}

export function scrubRendered(value: unknown): Record<string, unknown> {
  const blocked = /phone|secret|token|authorization|password/i;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') {
      if (typeof node === 'string') return sanitizePublicTemplate(node);
      return node;
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (blocked.test(key) && key !== 'secretPresent' && key !== 'secretEnv' && key !== 'deviceTokenIds') continue;
      out[key] = walk(child);
    }
    return out;
  };
  return walk(value) as Record<string, unknown>;
}

export function deliverySnapshot(env: {
  AUTOMATION_DELIVERY_ENABLED?: string;
  PUSH_DELIVERY_ENABLED?: string;
  WEBHOOK_DELIVERY_ENABLED?: string;
}) {
  return {
    sent: false,
    dryRun: true,
    delivered: false,
    automationDelivery: '0',
    pushDelivery: '0',
    webhookDelivery: '0',
    configured: {
      AUTOMATION_DELIVERY_ENABLED: env.AUTOMATION_DELIVERY_ENABLED || '0',
      PUSH_DELIVERY_ENABLED: env.PUSH_DELIVERY_ENABLED || '0',
      WEBHOOK_DELIVERY_ENABLED: env.WEBHOOK_DELIVERY_ENABLED || '0',
    },
    reason: 'delivery_disabled_in_this_build',
  };
}

function ruleEquals(rules: Record<string, unknown>, key: string, actual: unknown): boolean {
  if (rules[key] == null || rules[key] === '') return true;
  return String(rules[key]) === String(actual ?? '');
}

export function workflowMatches(workflow: AutomationWorkflow, event: TriggerEvent, settings: LocationAutomationSettings): boolean {
  if (workflow.trigger !== event.trigger) return false;
  if (workflow.brand === 'goninja' && settings.brand !== 'goninja') return false;
  if (workflow.brand === 'lvlup' && settings.brand !== 'lvlup') return false;
  const rules = workflow.rules || {};
  if (!ruleEquals(rules, 'program_slug', event.programSlug)) return false;
  if (!ruleEquals(rules, 'class_kind', event.classKind)) return false;
  if (!ruleEquals(rules, 'source', event.source)) return false;
  if (!ruleEquals(rules, 'reason', event.reason)) return false;
  if (!ruleEquals(rules, 'rank_slug', event.rankSlug)) return false;
  if (!ruleEquals(rules, 'phase', event.phase)) return false;
  if (!ruleEquals(rules, 'sequence', event.sequence)) return false;
  if (rules.absence_days != null && Number(rules.absence_days) !== Number(event.absenceDays)) return false;
  if (rules.streak != null && Number(rules.streak) !== Number(event.streak)) return false;
  if (rules.program_slug && settings.programs[String(rules.program_slug)] !== true) return false;
  if (rules.sequence === 'ninety_day' && settings.toggles.onb90 === false) return false;
  if (workflow.category === 'WATCHLIST' && settings.toggles.watchlist === false) return false;
  if (workflow.code === 'goninja_birthday_waiver' && settings.toggles.birthday_waiver === false) return false;
  return true;
}

/** Marketing journeys skip people who have not opted in. Other journeys still run. */
export function marketingSuppressed(
  workflow: { marketing?: boolean },
  preference: { marketing?: boolean } | null,
): boolean {
  if (!workflow.marketing) return false;
  return preference?.marketing !== true;
}

export function matchingWorkflows(
  workflows: AutomationWorkflow[],
  event: TriggerEvent,
  settings: LocationAutomationSettings,
): AutomationWorkflow[] {
  return workflows.filter(workflow => workflowMatches(workflow, event, settings));
}

function mergeContext(event: TriggerEvent, settings: LocationAutomationSettings, context: MergeContext): MergeContext {
  return {
    ...context,
    location_name: settings.locationName,
    review_url: settings.reviewUrl,
    member_id: context.member_id || '',
  };
}

function splitYes(config: Record<string, unknown>, event: TriggerEvent): boolean {
  if (config.when === 'absence_days_gte') return Number(event.absenceDays || 0) >= Number(config.value || 0);
  if (config.when === 'fact') return event.facts?.[String(config.fact || '')] === true;
  return false;
}

function renderStep(
  step: AutomationStep,
  event: TriggerEvent,
  settings: LocationAutomationSettings,
  context: MergeContext,
  env: { WATCHLIST_WEBHOOK_SECRET?: string },
  tags: string[],
): Record<string, unknown> {
  const merged = mergeContext(event, settings, context);
  const text = (value: unknown) => applyMergeTags(String(value || ''), merged);
  const base = { delivered: false, dryRun: true };
  if (step.stepType === 'delay') {
    return { ...base, channel: 'delay', days: Number(step.config.days || 0), waited: false };
  }
  if (step.stepType === 'email') {
    return { ...base, channel: 'email', subject: text(step.config.subject), body: text(step.config.body), day: step.config.day ?? null };
  }
  if (step.stepType === 'sms') {
    return {
      ...base,
      channel: 'sms',
      body: text(step.config.body),
      destination: null,
      reason: 'sms_delivery_disabled',
    };
  }
  if (step.stepType === 'push') {
    return { ...base, channel: 'push', title: text(step.config.title), body: text(step.config.body) };
  }
  if (step.stepType === 'task') {
    return { ...base, channel: 'task', title: text(step.config.title), body: text(step.config.body), day: step.config.day ?? null };
  }
  if (step.stepType === 'add_tag' || step.stepType === 'remove_tag') {
    return { ...base, channel: step.stepType, tag: String(step.config.tag || ''), tags: [...tags] };
  }
  if (step.stepType === 'start_automation') {
    return { ...base, channel: 'start_automation', workflowCode: String(step.config.workflow_code || '') };
  }
  if (step.stepType === 'add_document') {
    return {
      ...base,
      channel: 'document',
      documentCode: String(step.config.document_code || ''),
      title: text(step.config.title),
      audience: String(step.config.audience || 'member'),
      attached: true,
    };
  }
  if (step.stepType === 'webhook') {
    const url = bindWebhookLocation(String(step.config.url_template || ''), settings.locationId);
    const secretEnv = 'WATCHLIST_WEBHOOK_SECRET';
    return {
      ...base,
      channel: 'webhook',
      url,
      severity: String(step.config.severity || 'warning'),
      secretEnv,
      secretPresent: Boolean(env.WATCHLIST_WEBHOOK_SECRET),
    };
  }
  if (step.stepType === 'absence_wait') {
    return { ...base, channel: 'absence_wait', days: Number(step.config.days || 0), waited: false };
  }
  return { ...base, channel: 'split' };
}

export function planEnrollment(
  workflow: AutomationWorkflow,
  event: TriggerEvent,
  settings: LocationAutomationSettings,
  context: MergeContext,
  env: { WATCHLIST_WEBHOOK_SECRET?: string },
): PlannedEnrollment {
  const tags: string[] = [];
  const exitNow = workflow.exits.find(name => event.facts?.[name] === true);
  if (exitNow) {
    return { code: workflow.code, status: 'exited', exitReason: exitNow, steps: [], tags };
  }
  const byKey = new Map(workflow.steps.map(step => [step.stepKey, step]));
  const first = [...workflow.steps].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  let key = first?.stepKey || null;
  const seen = new Set<string>();
  const steps: PlannedStep[] = [];
  let status: 'completed' | 'exited' = 'completed';
  let exitReason: string | null = null;
  while (key && steps.length < 40) {
    if (seen.has(key)) break;
    seen.add(key);
    const step = byKey.get(key);
    if (!step) break;
    if (step.stepType === 'split') {
      const yes = splitYes(step.config, event);
      steps.push({
        stepKey: step.stepKey,
        stepType: step.stepType,
        rendered: scrubRendered({ delivered: false, dryRun: true, channel: 'split', branch: yes ? 'yes' : 'no' }),
      });
      key = yes ? step.branchYesKey : step.branchNoKey;
      continue;
    }
    if (step.stepType === 'absence_wait') {
      const exitOn = String(step.config.exit_on || 'class_booked');
      if (event.facts?.[exitOn] === true) {
        steps.push({
          stepKey: step.stepKey,
          stepType: step.stepType,
          rendered: scrubRendered({ delivered: false, dryRun: true, channel: 'absence_wait', exited: true }),
        });
        status = 'exited';
        exitReason = exitOn;
        break;
      }
    }
    if (step.stepType === 'add_tag') {
      const tag = String(step.config.tag || '');
      if (tag && !tags.includes(tag)) tags.push(tag);
    }
    if (step.stepType === 'remove_tag') {
      const tag = String(step.config.tag || '');
      const index = tags.indexOf(tag);
      if (index >= 0) tags.splice(index, 1);
    }
    steps.push({
      stepKey: step.stepKey,
      stepType: step.stepType,
      rendered: scrubRendered(renderStep(step, event, settings, context, env, tags)),
    });
    if (step.stepType === 'absence_wait') {
      key = step.nextStepKey;
      continue;
    }
    key = step.nextStepKey;
  }
  return { code: workflow.code, status, exitReason, steps, tags };
}

const BANNED = [
  /\{phone/i,
  /\btel:/i,
  /\bsms:/i,
  /session_id/i,
  /sessionId/,
  /black belt journey/i,
  /mini-tigers 1x/i,
  /fitboxing 1x/i,
  /athlete development/i,
  /grandfathered/i,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,
];

export function assertCatalogSafe(workflows: AutomationWorkflow[]) {
  const blob = JSON.stringify(workflows);
  for (const pattern of BANNED) {
    if (pattern.test(blob)) throw new Error('Catalog failed safety check: ' + pattern);
  }
  const codes = new Set<string>();
  const triggers = new Set<string>();
  const stepTypes = new Set<string>();
  for (const workflow of workflows) {
    if (codes.has(workflow.code)) throw new Error('Duplicate workflow ' + workflow.code);
    codes.add(workflow.code);
    if (!(TRIGGER_TYPES as readonly string[]).includes(workflow.trigger)) throw new Error('Bad trigger ' + workflow.code);
    triggers.add(workflow.trigger);
    if (JSON.stringify(workflow.rules).includes('session')) throw new Error('Session binding in ' + workflow.code);
    const keys = new Set(workflow.steps.map(step => step.stepKey));
    for (const step of workflow.steps) {
      if (!(STEP_TYPES as readonly string[]).includes(step.stepType)) throw new Error('Bad step ' + workflow.code);
      stepTypes.add(step.stepType);
      for (const next of [step.nextStepKey, step.branchYesKey, step.branchNoKey]) {
        if (next && !keys.has(next)) throw new Error('Missing step ' + next + ' in ' + workflow.code);
      }
    }
  }
  if (triggers.size !== TRIGGER_TYPES.length) throw new Error('Missing trigger types');
  if (stepTypes.size !== STEP_TYPES.length) throw new Error('Missing step types');
  return { codes: codes.size, triggers: triggers.size, stepTypes: stepTypes.size };
}
