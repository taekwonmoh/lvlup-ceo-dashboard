/**
 * Canonical LVLUP and Go Ninja journeys. One workflow per purpose.
 * Schools differ through location_automation_settings, not copied flows.
 * Copy is generic. No member records, phone numbers, or membership product labels.
 */
import {
  assertCatalogSafe,
  type AutomationStep,
  type AutomationWorkflow,
  type StepType,
} from './automations.ts';

type LooseStep = {
  stepType: StepType;
  config: Record<string, unknown>;
  nextStepKey?: string | null;
  branchYesKey?: string | null;
  branchNoKey?: string | null;
  stepKey?: string;
};

function linear(items: LooseStep[]): AutomationStep[] {
  return items.map((item, index) => ({
    stepKey: item.stepKey || 's' + (index + 1),
    stepType: item.stepType,
    sortOrder: (index + 1) * 10,
    config: item.config,
    nextStepKey: item.nextStepKey === undefined ? (index + 1 < items.length ? 's' + (index + 2) : null) : item.nextStepKey,
    branchYesKey: item.branchYesKey || null,
    branchNoKey: item.branchNoKey || null,
  }));
}

function email(subject: string, body: string, extra: Record<string, unknown> = {}) {
  return { stepType: 'email' as const, config: { subject, body, ...extra } };
}

function task(title: string, body: string, extra: Record<string, unknown> = {}) {
  return { stepType: 'task' as const, config: { title, body, ...extra } };
}

const PROGRAMS: Array<[string, string]> = [
  ['mini_tigers', 'Mini Tigers'],
  ['tigers', 'Tigers'],
  ['kids_teens', 'Kids and Teens'],
  ['adult_tkd', 'Adult Taekwondo'],
  ['fitboxing', 'Fitboxing'],
];

function build(): AutomationWorkflow[] {
  const flows: AutomationWorkflow[] = [];

  for (const [slug, label] of PROGRAMS) {
    flows.push({
      code: 'book_' + slug,
      category: 'BOOK',
      brand: 'lvlup',
      name: label + ' booking',
      trigger: 'new_booking',
      rules: { program_slug: slug, class_kind: 'regular' },
      exits: [],
      steps: linear([
        { stepType: 'delay', config: { days: 0 } },
        email(label + ' class booked', 'Hi {first_name}, your ' + label + ' class at {location_name} is booked.'),
        { stepType: 'push', config: { title: label + ' reminder', body: 'See you at {location_name}, {first_name}.' } },
      ]),
    });
  }

  flows.push({
    code: 'book_attended',
    category: 'BOOK',
    brand: 'lvlup',
    name: 'Attended class follow-up',
    trigger: 'manual',
    rules: { reason: 'class_attended' },
    exits: [],
    steps: linear([
      email('Nice work in class', 'Hi {first_name}, glad you trained at {location_name}.'),
      task('Note the attended class', 'Add a short class note for {first_name} at {location_name}.'),
    ]),
  });

  for (const [slug, label] of PROGRAMS) {
    flows.push({
      code: 'lead_' + slug,
      category: 'LEAD',
      brand: 'lvlup',
      name: label + ' lead',
      trigger: 'new_lead',
      rules: { program_slug: slug },
      exits: ['membership_started', 'class_booked'],
      steps: linear([
        email('Thanks for your interest', 'Hi {parent_first_name}, thanks for asking about ' + label + ' at {location_name}.'),
        { stepType: 'delay', config: { days: 2 } },
        task('Follow up on ' + label + ' lead', 'Email {guardian_name} about {location_name}.'),
      ]),
    });
  }

  flows.push(
    {
      code: 'lead_teens',
      category: 'LEAD',
      brand: 'lvlup',
      name: 'Teens lead',
      trigger: 'new_lead',
      rules: { program_slug: 'teens' },
      exits: ['membership_started', 'class_booked'],
      steps: linear([
        email('Teens classes at {location_name}', 'Hi {parent_first_name}, teens classes are open at {location_name}.'),
        task('Follow up on teens lead', 'Email {guardian_name} about a teens class at {location_name}.'),
      ]),
    },
    {
      code: 'lead_general',
      category: 'LEAD',
      brand: 'lvlup',
      name: 'General lead',
      trigger: 'new_lead',
      rules: { program_slug: 'general' },
      exits: ['membership_started', 'class_booked'],
      steps: linear([
        email('Welcome to {location_name}', 'Hi {guardian_name}, we got your note for {location_name}.'),
        task('Reply to general lead', 'Reply to {email} about {location_name}.'),
      ]),
    },
    {
      code: 'lead_booking_form',
      category: 'LEAD',
      brand: 'shared',
      name: 'Booking form lead',
      trigger: 'new_lead',
      rules: { source: 'booking_form' },
      exits: ['class_booked', 'membership_started'],
      steps: linear([
        { stepType: 'add_tag', config: { tag: 'booking_form' } },
        email('We got your booking request', 'Hi {parent_first_name}, {location_name} received the booking form.'),
      ]),
    },
    {
      code: 'lead_party_guest',
      category: 'LEAD',
      brand: 'shared',
      name: 'Party guest lead',
      trigger: 'new_lead',
      rules: { source: 'party_guest' },
      exits: ['class_booked'],
      steps: linear([
        { stepType: 'add_tag', config: { tag: 'party_guest' } },
        email('Thanks for celebrating with us', 'Hi {guardian_name}, the party guest note for {location_name} is saved.'),
      ]),
    },
  );

  for (const [slug, label] of PROGRAMS) {
    flows.push({
      code: 'noshow_' + slug,
      category: 'NOSHOW',
      brand: 'lvlup',
      name: label + ' no-show',
      trigger: 'booking_no_show',
      rules: { program_slug: slug },
      exits: ['class_booked'],
      steps: linear([
        email('We missed {first_name}', '{first_name} was marked absent from ' + label + ' at {location_name}.'),
        { stepType: 'delay', config: { days: 2 } },
        { stepType: 'push', config: { title: 'Book the next class', body: 'Pick another ' + label + ' class at {location_name}.' } },
      ]),
    });
  }

  flows.push({
    code: 'noshow_rebook',
    category: 'NOSHOW',
    brand: 'shared',
    name: 'Rebook after a no-show',
    trigger: 'booking_no_show',
    rules: {},
    exits: ['class_booked'],
    steps: linear([
      email('Save another class', 'Hi {guardian_name}, book the next class at {location_name} for {first_name}.'),
      { stepType: 'delay', config: { days: 1 } },
      { stepType: 'sms', config: { body: 'A seat is open for {first_name} at {location_name}.' } },
      task('Rebook follow-up', 'Check whether {first_name} booked another class at {location_name}.'),
    ]),
  });

  flows.push(
    {
      code: 'onb_taekwondo',
      category: 'ONB',
      brand: 'lvlup',
      name: 'Taekwondo onboarding',
      trigger: 'membership_start',
      rules: { program_slug: 'taekwondo' },
      exits: [],
      steps: linear([
        email('Welcome to taekwondo', 'Hi {first_name}, welcome to taekwondo at {location_name}.'),
        task('Class 1 note', 'Write the first class note for {first_name}.'),
        { stepType: 'delay', config: { days: 7 } },
        email('Your first week', 'How was the first week at {location_name}, {guardian_name}?'),
      ]),
    },
    {
      code: 'onb_fitboxing',
      category: 'ONB',
      brand: 'lvlup',
      name: 'Fitboxing onboarding',
      trigger: 'membership_start',
      rules: { program_slug: 'fitboxing' },
      exits: [],
      steps: linear([
        email('Welcome to Fitboxing', 'Hi {first_name}, welcome to Fitboxing at {location_name}.'),
        task('First session note', 'Write the first session note for {first_name}.'),
      ]),
    },
    {
      code: 'onb90_sequence',
      category: 'ONB90',
      brand: 'lvlup',
      name: '90-day onboarding',
      trigger: 'membership_start',
      rules: { sequence: 'ninety_day' },
      exits: [],
      steps: linear([
        email('Day 1 check', 'Welcome to {location_name}, {first_name}.', { day: 1 }),
        task('Class 1 note', 'Write the class 1 note for {first_name}.', { day: 1 }),
        { stepType: 'delay', config: { days: 6, until_day: 7 } },
        email('Day 7 check', 'Day 7 check-in for {first_name} at {location_name}.', { day: 7 }),
        { stepType: 'delay', config: { days: 7, until_day: 14 } },
        email('Day 14 check', 'Day 14 check-in for {first_name} at {location_name}.', { day: 14 }),
        { stepType: 'delay', config: { days: 7, until_day: 21 } },
        email('Day 21 check', 'Day 21 check-in for {first_name} at {location_name}.', { day: 21 }),
        { stepType: 'delay', config: { days: 9, until_day: 30 } },
        email('Day 30 check', 'Day 30 check-in for {first_name} at {location_name}.', { day: 30 }),
        email('How are we doing?', 'A short survey for {guardian_name} about {location_name}.', { day: 30, kind: 'nps_survey' }),
        email('Tiger Leaders invite', '{first_name} may enjoy the Tiger Leaders group at {location_name}.'),
        task('Track from class', 'Track {first_name} from class and note the next step.'),
        { stepType: 'delay', config: { days: 40, until_day: 70 } },
        email('Day 70 check', 'Day 70 check-in for {first_name} at {location_name}.', { day: 70 }),
        { stepType: 'delay', config: { days: 10, until_day: 80 } },
        email('Day 80 check', 'Day 80 check-in for {first_name} at {location_name}.', { day: 80 }),
      ]),
    },
    {
      code: 'ops_uniform_ready',
      category: 'OPS',
      brand: 'shared',
      name: 'Uniform ready',
      trigger: 'manual',
      rules: { reason: 'uniform_ready' },
      exits: [],
      steps: linear([
        email('Uniform is ready', 'The uniform for {first_name} is ready at {location_name}.'),
        task('Hand off the uniform', 'Front desk: the uniform for {first_name} is ready at {location_name}.'),
      ]),
    },
  );

  const promotions: Array<[string, string, Record<string, unknown>, string]> = [
    ['prog_tigers_ara', 'Tigers first belt Ara', { rank_slug: 'tigers_ara' }, 'Hi {first_name}, Ara is the first Tigers belt at {location_name}.'],
    ['prog_orange_belt', 'Orange belt', { rank_slug: 'orange' }, 'Hi {first_name}, orange belt is recorded at {location_name}.'],
    ['prog_yellow_sparring', 'Yellow belt sparring gear', { rank_slug: 'yellow' }, 'Hi {first_name}, yellow belt is a good time to pick up sparring gear at {location_name}.'],
    ['prog_belt_promotion', 'Belt promotion', { reason: 'belt_promoted' }, 'Hi {guardian_name}, {first_name} earned a new belt at {location_name}.'],
    ['prog_ready_to_test', 'Ready to test', { reason: 'ready_to_test' }, '{first_name} is ready to test at {location_name}.'],
    ['prog_test_registered', 'Test registered', { reason: 'test_registered' }, '{first_name} is registered to test at {location_name}.'],
    ['prog_first_degree_decided', '1st degree decided', { rank_slug: 'first_degree_decided' }, '{first_name} is decided for 1st degree at {location_name}.'],
  ];
  for (const [code, name, rules, body] of promotions) {
    flows.push({
      code,
      category: 'PROG',
      brand: 'lvlup',
      name,
      trigger: 'promotion',
      rules,
      exits: [],
      steps: linear([
        email(name, body),
        task(name, 'Record ' + name + ' for {first_name} at {location_name}.'),
      ]),
    });
  }

  flows.push(
    {
      code: 'prog_fitboxing_streak_4',
      category: 'PROG',
      brand: 'lvlup',
      name: 'Fitboxing 4-class streak',
      trigger: 'promotion',
      rules: { program_slug: 'fitboxing', streak: 4 },
      exits: [],
      steps: linear([
        { stepType: 'add_tag', config: { tag: 'fitboxing_streak_4' } },
        email('Four classes in a row', '{first_name} hit a 4-class Fitboxing streak at {location_name}.'),
      ]),
    },
    {
      code: 'prog_fitboxing_streak_12',
      category: 'PROG',
      brand: 'lvlup',
      name: 'Fitboxing 12-class streak',
      trigger: 'promotion',
      rules: { program_slug: 'fitboxing', streak: 12 },
      exits: [],
      steps: linear([
        { stepType: 'add_tag', config: { tag: 'fitboxing_streak_12' } },
        email('Twelve classes in a row', '{first_name} hit a 12-class Fitboxing streak at {location_name}.'),
      ]),
    },
  );

  for (const days of [7, 10, 21]) {
    flows.push({
      code: 'ret_absence_' + days,
      category: 'RET',
      brand: 'shared',
      name: days + '-day absence',
      trigger: 'absence',
      rules: { absence_days: days },
      exits: ['class_booked'],
      steps: linear([
        { stepType: 'absence_wait', config: { days, exit_on: 'class_booked' } },
        email('We have not seen {first_name}', '{first_name} has been away from {location_name} for ' + days + ' days.'),
        task('Absence check', 'Review the ' + days + '-day absence for {first_name} at {location_name}.'),
      ]),
    });
  }

  flows.push(
    {
      code: 'ret_hold_started',
      category: 'RET',
      brand: 'shared',
      name: 'Hold started',
      trigger: 'member_frozen',
      rules: { phase: 'started' },
      exits: [],
      steps: linear([
        email('Hold started', 'A hold started for {first_name} at {location_name}.'),
        task('Confirm the hold', 'Confirm the hold dates for {first_name} at {location_name}.'),
      ]),
    },
    {
      code: 'ret_hold_ending',
      category: 'RET',
      brand: 'shared',
      name: 'Hold ending',
      trigger: 'member_frozen',
      rules: { phase: 'ending' },
      exits: [],
      steps: linear([
        email('Hold ending', 'The hold for {first_name} at {location_name} is ending soon.'),
        task('Welcome back plan', 'Plan the return class for {first_name} at {location_name}.'),
      ]),
    },
    {
      code: 'ret_cancel_request',
      category: 'RET',
      brand: 'shared',
      name: 'Cancel request',
      trigger: 'manual',
      rules: { reason: 'cancel_request' },
      exits: [],
      steps: linear([
        task('Review cancel request', 'Review the cancel request for {first_name} at {location_name}.'),
        email('We received your request', 'Hi {guardian_name}, {location_name} received the request for {first_name}.'),
      ]),
    },
    {
      code: 'ret_anniversary',
      category: 'RET',
      brand: 'shared',
      name: 'Anniversary',
      trigger: 'manual',
      rules: { reason: 'anniversary' },
      exits: [],
      steps: linear([
        email('Happy anniversary', 'Hi {first_name}, happy training anniversary from {location_name}.'),
      ]),
    },
    {
      code: 'ret_referral_thanks',
      category: 'RET',
      brand: 'shared',
      name: 'Referral thanks',
      trigger: 'manual',
      rules: { reason: 'referral_thanks' },
      exits: [],
      steps: linear([
        email('Thanks for the referral', 'Hi {guardian_name}, thank you for referring a family to {location_name}.'),
        { stepType: 'add_tag', config: { tag: 'referral_thanks' } },
      ]),
    },
    {
      code: 'ret_renewal_upcoming',
      category: 'RET',
      brand: 'shared',
      name: 'Renewal coming up',
      trigger: 'manual',
      rules: { reason: 'renewal_due' },
      exits: [],
      steps: linear([
        { stepType: 'add_tag', config: { tag: 'renewal_due' } },
        email('Renewal coming up', 'Hi {guardian_name}, a renewal is coming up for {first_name} at {location_name}.'),
      ]),
    },
    {
      code: 'ret_renewal_complete',
      category: 'RET',
      brand: 'shared',
      name: 'Renewal complete',
      trigger: 'manual',
      rules: { reason: 'renewed' },
      exits: [],
      steps: linear([
        { stepType: 'remove_tag', config: { tag: 'renewal_due' } },
        email('Renewal recorded', 'The renewal for {first_name} at {location_name} is recorded.'),
      ]),
    },
  );

  const sources: Array<[string, string]> = [
    ['google_ad', 'Google ad'],
    ['meta_ad', 'Meta ad'],
    ['website_form', 'Website form'],
    ['event', 'Event'],
    ['mailer_qr', 'Mailer QR'],
    ['milo_chat', 'Milo chat'],
    ['referral', 'Referral'],
    ['walk_in', 'Walk-in'],
  ];
  for (const [source, label] of sources) {
    const steps: LooseStep[] = [
      { stepType: 'add_tag', config: { tag: 'source_' + source } },
      email(label + ' lead', 'New ' + label + ' lead for {location_name}. Reply to {guardian_name} at {email}.'),
    ];
    if (source === 'website_form') {
      steps.push({ stepType: 'start_automation', config: { workflow_code: 'lead_general' } });
    }
    flows.push({
      code: 'src_' + source,
      category: 'SRC',
      brand: 'shared',
      name: label + ' source',
      trigger: 'new_lead',
      rules: { source },
      exits: ['membership_started'],
      steps: linear(steps),
    });
  }

  flows.push(
    {
      code: 'trial_kids',
      category: 'TRIAL',
      brand: 'lvlup',
      name: 'Kids trial follow-up',
      trigger: 'new_booking',
      rules: { program_slug: 'kids_teens', class_kind: 'intro' },
      exits: ['membership_started', 'class_booked'],
      steps: linear([
        email('Your intro class', 'Hi {parent_first_name}, the intro class for {first_name} is at {location_name}.'),
        { stepType: 'delay', config: { days: 1 } },
        email('After the intro', 'Hi {guardian_name}, tell us how the intro at {location_name} went.'),
      ]),
    },
    {
      code: 'trial_adult',
      category: 'TRIAL',
      brand: 'lvlup',
      name: 'Adult trial follow-up',
      trigger: 'new_booking',
      rules: { program_slug: 'adult_tkd', class_kind: 'intro' },
      exits: ['membership_started', 'class_booked'],
      steps: linear([
        email('Your adult intro', 'Hi {first_name}, your adult intro is booked at {location_name}.'),
        { stepType: 'delay', config: { days: 1 } },
        email('After your intro', 'How did the intro at {location_name} feel, {first_name}?'),
      ]),
    },
    {
      code: 'trial_fitboxing',
      category: 'TRIAL',
      brand: 'lvlup',
      name: 'Fitboxing trial follow-up',
      trigger: 'new_booking',
      rules: { program_slug: 'fitboxing', class_kind: 'intro' },
      exits: ['membership_started', 'class_booked'],
      steps: linear([
        email('Your Fitboxing intro', 'Hi {first_name}, your Fitboxing intro is booked at {location_name}.'),
        { stepType: 'delay', config: { days: 1 } },
        task('Fitboxing intro follow-up', 'Follow up with {guardian_name} after the Fitboxing intro at {location_name}.'),
      ]),
    },
    {
      code: 'watchlist_absence',
      category: 'WATCHLIST',
      brand: 'shared',
      name: 'Absence watch list',
      trigger: 'absence',
      rules: {},
      exits: ['class_booked'],
      steps: [
        {
          stepKey: 'gate',
          stepType: 'split',
          sortOrder: 10,
          config: { when: 'absence_days_gte', value: 21 },
          nextStepKey: null,
          branchYesKey: 'critical',
          branchNoKey: 'warning',
        },
        {
          stepKey: 'critical',
          stepType: 'webhook',
          sortOrder: 20,
          config: {
            url_template: 'https://hooks.example.test/watchlist?location={location_id}&severity=critical',
            secret_env: 'WATCHLIST_WEBHOOK_SECRET',
            severity: 'critical',
          },
          nextStepKey: 'task',
          branchYesKey: null,
          branchNoKey: null,
        },
        {
          stepKey: 'warning',
          stepType: 'webhook',
          sortOrder: 30,
          config: {
            url_template: 'https://hooks.example.test/watchlist?location={location_id}&severity=warning',
            secret_env: 'WATCHLIST_WEBHOOK_SECRET',
            severity: 'warning',
          },
          nextStepKey: 'task',
          branchYesKey: null,
          branchNoKey: null,
        },
        {
          stepKey: 'task',
          stepType: 'task',
          sortOrder: 40,
          config: { title: 'Review the absence watch list', body: 'Review {first_name} at {location_name}. Review link {review_url}.' },
          nextStepKey: null,
          branchYesKey: null,
          branchNoKey: null,
        },
      ],
    },
    {
      code: 'goninja_birthday_waiver',
      category: 'GONINJA',
      brand: 'goninja',
      name: 'Birthday host and guest waivers',
      trigger: 'new_booking',
      rules: { class_kind: 'birthday' },
      exits: [],
      steps: linear([
        {
          stepType: 'add_document',
          config: {
            document_code: 'birthday_waiver_host',
            title: 'Birthday host waiver',
            audience: 'host',
          },
        },
        {
          stepType: 'add_document',
          config: {
            document_code: 'birthday_waiver_guest',
            title: 'Birthday guest waiver',
            audience: 'guest',
          },
        },
        email('Party waivers', 'Waiver copies for the party at {location_name} are attached for the host and each guest.'),
      ]),
    },
  );

  flows.push(
    {
      code: 'lead_form_submitted',
      category: 'LEAD',
      brand: 'shared',
      name: 'Form submitted',
      trigger: 'form_submitted',
      marketing: true,
      rules: {},
      exits: [],
      steps: linear([
        email('We received your form', 'Hi {first_name}, we received your form for {location_name}.'),
        { stepType: 'add_tag', config: { tag: 'form_submitted' } },
      ]),
    },
    {
      code: 'book_cancelled',
      category: 'BOOK',
      brand: 'shared',
      name: 'Booking cancelled',
      trigger: 'booking_cancelled',
      rules: {},
      exits: [],
      steps: linear([
        task('Review the cancelled booking', 'A booking was cancelled at {location_name} for {first_name}.'),
      ]),
    },
    {
      code: 'lead_invite_accepted',
      category: 'LEAD',
      brand: 'shared',
      name: 'Lead invite accepted',
      trigger: 'lead_invite_accepted',
      rules: {},
      exits: [],
      steps: linear([
        { stepType: 'add_tag', config: { tag: 'invite_accepted' } },
        task('Confirm the invited start date', 'Review the accepted invite for {first_name} at {location_name}.'),
      ]),
    },
  );

  assertCatalogSafe(flows);
  return flows;
}

export const AUTOMATION_CATALOG: AutomationWorkflow[] = build();

export const CATALOG_COUNTS: Record<string, number> = {
  BOOK: 7,
  LEAD: 11,
  NOSHOW: 6,
  ONB: 2,
  ONB90: 1,
  OPS: 1,
  PROG: 9,
  RET: 10,
  SRC: 8,
  TRIAL: 3,
  WATCHLIST: 1,
  GONINJA: 1,
};

export function renderCatalogSeedSql(workflows: AutomationWorkflow[] = AUTOMATION_CATALOG): string {
  const lines: string[] = ['-- Canonical workflows generated from crm/src/automation-catalog.ts'];
  for (const workflow of workflows) {
    lines.push(
      'insert into automation_workflows (code, category, brand, name, trigger_type, trigger_rules, exit_conditions) values (',
      `  '${workflow.code}', '${workflow.category}', '${workflow.brand}', '${workflow.name.replace(/'/g, "''")}', '${workflow.trigger}',`,
      `  $crm$${JSON.stringify(workflow.rules)}$crm$::jsonb,`,
      `  $crm$${JSON.stringify(workflow.exits)}$crm$::jsonb`,
      ');',
    );
    for (const step of workflow.steps) {
      const next = step.nextStepKey ? `'${step.nextStepKey}'` : 'null';
      const yes = step.branchYesKey ? `'${step.branchYesKey}'` : 'null';
      const no = step.branchNoKey ? `'${step.branchNoKey}'` : 'null';
      lines.push(
        'insert into automation_steps (workflow_id, step_key, step_type, sort_order, config, next_step_key, branch_yes_key, branch_no_key)',
        `select id, '${step.stepKey}', '${step.stepType}', ${step.sortOrder}, $crm$${JSON.stringify(step.config)}$crm$::jsonb, ${next}, ${yes}, ${no}`,
        `from automation_workflows where code = '${workflow.code}';`,
      );
    }
  }
  return lines.join('\n') + '\n';
}
