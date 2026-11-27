import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTOMATION_CATALOG } from '../src/automation-catalog.ts';
import { marketingSuppressed, TRIGGER_TYPES } from '../src/automations.ts';
import { assertMinorGuardian, assertRedirectUrl, isMinorParticipant, splitName } from '../src/names.ts';
import { CrmError } from '../src/errors.ts';
import { handleWorkerRequest } from '../worker/src/app.ts';

test('names split and a minor needs a guardian signature', () => {
  assert.deepEqual(splitName('Jordan Sample'), { firstName: 'Jordan', lastName: 'Sample' });
  assert.deepEqual(splitName('Parker'), { firstName: 'Parker', lastName: '' });
  assert.equal(isMinorParticipant({ birthDate: '2018-04-02' }, '2026-11-27'), true);
  assert.equal(isMinorParticipant({ birthDate: '2000-01-01' }, '2026-11-27'), false);
  assert.equal(isMinorParticipant({ age: 18 }, '2026-11-27'), false);
  assert.equal(isMinorParticipant({ birthDate: '2018-04-02', minor: false }, '2026-11-27'), true);
  assert.throws(
    () => assertMinorGuardian({ minor: true, required: true, guardianFirstName: 'Jordan', guardianLastName: '', signature: 'Jordan' }),
    (err: unknown) => err instanceof CrmError && err.code === 'guardian_required',
  );
  assert.throws(
    () => assertMinorGuardian({ minor: true, required: true, guardianFirstName: 'Jordan', guardianLastName: 'Sample', signature: '' }),
    (err: unknown) => err instanceof CrmError && err.code === 'guardian_signature_required',
  );
  assert.doesNotThrow(() => assertMinorGuardian({
    minor: true,
    required: true,
    guardianFirstName: 'Jordan',
    guardianLastName: 'Sample',
    signature: 'Jordan Sample',
  }));
  assert.equal(assertRedirectUrl('https://example.test/thanks'), 'https://example.test/thanks');
  assert.throws(() => assertRedirectUrl('http://example.test/thanks'), (err: unknown) => err instanceof CrmError && err.code === 'bad_redirect');
});

test('marketing workflows skip people who have not opted in', () => {
  const marketing = { marketing: true };
  const operational = { marketing: false };
  assert.equal(marketingSuppressed(marketing, { marketing: false }), true);
  assert.equal(marketingSuppressed(marketing, null), true);
  assert.equal(marketingSuppressed(marketing, { marketing: true }), false);
  assert.equal(marketingSuppressed(operational, { marketing: false }), false);
  for (const trigger of ['form_submitted', 'booking_cancelled', 'lead_invite_accepted'] as const) {
    assert.equal(TRIGGER_TYPES.includes(trigger), true);
    assert.equal(AUTOMATION_CATALOG.some(item => item.trigger === trigger), true);
  }
  const form = AUTOMATION_CATALOG.find(item => item.code === 'lead_form_submitted');
  assert.equal(form?.marketing, true);
  assert.equal(form?.steps.some(step => step.stepType === 'add_tag'), true);
});

test('the worker still refuses delivery and does not open a database for wave 1', async () => {
  const env = {
    AUTHORIZENET_MODE: 'sandbox',
    BILLING_CHARGES_ENABLED: '0',
    QBO_ENABLED: '0',
    AUTOMATION_DELIVERY_ENABLED: '0',
    PUSH_DELIVERY_ENABLED: '0',
    WEBHOOK_DELIVERY_ENABLED: '0',
    CRM_ALLOW_LOCAL_TOKENS: '0',
  };
  const health = await handleWorkerRequest(new Request('https://crm.test/v1/health'), env, { waitUntil() {} });
  const healthBody = await health.json() as { automationDelivery: string; charges: boolean; intendedHost: string };
  assert.equal(health.status, 200);
  assert.equal(healthBody.charges, false);
  assert.equal(healthBody.automationDelivery, '0');
  assert.equal(healthBody.intendedHost, 'api.lvlupma.com');
  const form = await handleWorkerRequest(new Request('https://crm.test/v1/public/forms/waunakee-trial'), env, { waitUntil() {} });
  const formBody = await form.json() as { error: { code: string } };
  assert.equal(form.status, 503);
  assert.equal(formBody.error.code, 'database_unavailable');
});
