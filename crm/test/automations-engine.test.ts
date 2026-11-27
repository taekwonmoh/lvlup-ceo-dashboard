import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTOMATION_CATALOG, CATALOG_COUNTS } from '../src/automation-catalog.ts';
import {
  STEP_TYPES,
  TRIGGER_TYPES,
  applyMergeTags,
  bindWebhookLocation,
  matchingWorkflows,
  planEnrollment,
  sanitizePublicTemplate,
  type LocationAutomationSettings,
} from '../src/automations.ts';

function settings(over: Partial<LocationAutomationSettings> = {}): LocationAutomationSettings {
  return {
    locationId: 'verona',
    brand: 'lvlup',
    locationName: 'Verona',
    reviewUrl: 'https://reviews.example.test/verona',
    programs: {
      mini_tigers: true,
      tigers: true,
      kids_teens: true,
      teens: true,
      adult_tkd: true,
      taekwondo: true,
      fitboxing: false,
      general: true,
    },
    toggles: { watchlist: true, onb90: true, birthday_waiver: false },
    ...over,
  };
}

test('catalog covers every category, trigger, and step type without session ids', () => {
  const counts: Record<string, number> = {};
  for (const workflow of AUTOMATION_CATALOG) counts[workflow.category] = (counts[workflow.category] || 0) + 1;
  assert.deepEqual(counts, CATALOG_COUNTS);
  assert.equal(AUTOMATION_CATALOG.length, 60);
  assert.equal(new Set(AUTOMATION_CATALOG.map(item => item.trigger)).size, TRIGGER_TYPES.length);
  const steps = new Set(AUTOMATION_CATALOG.flatMap(item => item.steps.map(step => step.stepType)));
  assert.equal(steps.size, STEP_TYPES.length);
  const blob = JSON.stringify(AUTOMATION_CATALOG);
  assert.equal(blob.includes('session_id'), false);
  assert.equal(blob.includes('sessionId'), false);
});

test('public templates drop phone merge tags and footer lines', () => {
  const digits = ['608', '555', '0199'].join('-');
  const cleaned = sanitizePublicTemplate('Hi {first_name}\nCall us at the desk\n{phone} ' + digits + '\nSee you at {location_name}');
  assert.equal(cleaned.includes('{phone}'), false);
  assert.equal(cleaned.includes(digits), false);
  assert.equal(cleaned.includes('Call us'), false);
  assert.equal(cleaned.includes('{first_name}'), true);
  const merged = applyMergeTags(cleaned, {
    first_name: 'Parker',
    location_name: 'DeForest',
    review_url: 'https://reviews.example.test/deforest',
  });
  assert.equal(merged.includes('Parker'), true);
  assert.equal(merged.includes('{first_name}'), false);
});

test('webhook location is rewritten from the member school', () => {
  const legacy = 'https://hooks.example.test/watchlist?location=waunakee&severity=warning';
  assert.equal(bindWebhookLocation(legacy, 'verona'), 'https://hooks.example.test/watchlist?location=verona&severity=warning');
  assert.equal(
    bindWebhookLocation('https://hooks.example.test/watchlist?location={location_id}&severity=critical', 'deforest'),
    'https://hooks.example.test/watchlist?location=deforest&severity=critical',
  );
  assert.equal(bindWebhookLocation(legacy, 'verona').includes('location=waunakee'), false);
});

test('fitboxing stays on the Waunakee flag and birthday waivers stay on Go Ninja', () => {
  const fit = AUTOMATION_CATALOG.find(item => item.code === 'book_fitboxing');
  const birthday = AUTOMATION_CATALOG.find(item => item.code === 'goninja_birthday_waiver');
  assert.ok(fit && birthday);
  const event = { trigger: 'new_booking', locationId: 'verona', programSlug: 'fitboxing', classKind: 'regular' };
  assert.equal(matchingWorkflows([fit], event, settings()).length, 0);
  assert.equal(matchingWorkflows([fit], event, settings({
    locationId: 'waunakee',
    locationName: 'Waunakee',
    programs: { ...settings().programs, fitboxing: true },
  })).length, 1);
  const party = { trigger: 'new_booking', locationId: 'eastmad', classKind: 'birthday' };
  assert.equal(matchingWorkflows([birthday], party, settings()).length, 0);
  assert.equal(matchingWorkflows([birthday], { ...party, locationId: 'goninjaV' }, settings({
    locationId: 'goninjaV',
    brand: 'goninja',
    locationName: 'Go Ninja Verona',
    toggles: { watchlist: true, onb90: false, birthday_waiver: true },
  })).length, 1);
});

test('exit conditions stop the journey and watchlist webhooks stay dry-run', () => {
  const trial = AUTOMATION_CATALOG.find(item => item.code === 'trial_kids');
  assert.ok(trial);
  const exited = planEnrollment(trial, {
    trigger: 'new_booking',
    locationId: 'waunakee',
    programSlug: 'kids_teens',
    classKind: 'intro',
    facts: { membership_started: true },
  }, settings({ locationId: 'waunakee', locationName: 'Waunakee' }), {}, {});
  assert.equal(exited.status, 'exited');
  assert.equal(exited.exitReason, 'membership_started');
  assert.equal(exited.steps.length, 0);

  const watch = AUTOMATION_CATALOG.find(item => item.code === 'watchlist_absence');
  assert.ok(watch);
  const secret = ['dry', 'run', 'watchlist', 'secret'].join('-');
  const critical = planEnrollment(watch, {
    trigger: 'absence',
    locationId: 'verona',
    absenceDays: 21,
  }, settings(), { first_name: 'Parker' }, { WATCHLIST_WEBHOOK_SECRET: secret });
  const warning = planEnrollment(watch, {
    trigger: 'absence',
    locationId: 'deforest',
    absenceDays: 10,
  }, settings({
    locationId: 'deforest',
    locationName: 'DeForest',
    reviewUrl: 'https://reviews.example.test/deforest',
  }), { first_name: 'Parker' }, {});
  const criticalHook = critical.steps.find(step => step.stepType === 'webhook');
  const warningHook = warning.steps.find(step => step.stepType === 'webhook');
  assert.equal(criticalHook?.rendered.severity, 'critical');
  assert.equal(warningHook?.rendered.severity, 'warning');
  assert.equal(criticalHook?.rendered.url, 'https://hooks.example.test/watchlist?location=verona&severity=critical');
  assert.equal(String(warningHook?.rendered.url).includes('location=deforest'), true);
  assert.equal(String(warningHook?.rendered.url).includes('location=waunakee'), false);
  assert.equal(criticalHook?.rendered.delivered, false);
  assert.equal(criticalHook?.rendered.secretPresent, true);
  assert.equal(JSON.stringify(critical).includes(secret), false);
  const task = warning.steps.find(step => step.stepType === 'task');
  assert.equal(String(task?.rendered.body).includes('https://reviews.example.test/deforest'), true);
});
