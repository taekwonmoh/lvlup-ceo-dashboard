import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signToken } from '../src/auth.ts';
import {
  defaultShowInLvlupMemberPortal,
  eventsForLocation,
  eventsForMemberBrand,
  filterStudioEvents,
  sampleStudioEvents,
  visibleToBrands,
  handleCrossBrandEvents,
} from '../src/cross-brand-events.ts';
import type { Actor } from '../src/auth.ts';
import { handleWorkerRequest, type CrmWorkerEnv } from '../worker/src/app.ts';

const root = dirname(fileURLToPath(import.meta.url));
const SECRET = 'cross-brand-test-secret';

await import(new URL('../ui/rules.js', import.meta.url).href);
const rules = (globalThis as unknown as {
  CrmRules: {
    studioEvents: (today?: string) => Array<{
      id: string;
      locationId: string;
      eventType: string;
      showInLvlupMemberPortal: boolean;
      visibleToBrands: string[];
      memberPriceCents: number;
      nonMemberPriceCents: number;
      brand: string;
    }>;
    defaultShowInLvlupMemberPortal: (locationId: string, eventType: string) => boolean;
    visibleToBrands: (locationId: string, show: boolean) => string[];
    filterStudioEvents: <T extends { locationId: string; showInLvlupMemberPortal: boolean }>(
      events: T[],
      filter: string,
      locationId?: string,
    ) => T[];
    memberPortalEvents: (today: string, brand: string, extras: unknown[]) => Array<{ id: string; showInLvlupMemberPortal: boolean }>;
  };
}).CrmRules;

function actor(role: Actor['role']): Actor {
  return {
    role,
    email: role + '@example.test',
    locationIds: ['waunakee', 'goninjaW', 'goninjaV'],
    familyIds: [],
    memberId: null,
    canFinance: role === 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

function flags(): CrmWorkerEnv {
  return {
    AUTHORIZENET_MODE: 'sandbox',
    BILLING_CHARGES_ENABLED: '0',
    CRM_ALLOW_LOCAL_TOKENS: '1',
    CRM_TOKEN_SECRET: SECRET,
  };
}

async function call(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await handleWorkerRequest(new Request('https://crm.test' + path, {
    method: init.method || 'GET',
    headers: {
      ...(init.token ? { authorization: 'Bearer ' + init.token } : {}),
      'content-type': 'application/json',
    },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  }), flags(), undefined, { pool: null });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {}, text };
}

test('Go Ninja camps and PNOs default into the LVLUP member portal', () => {
  assert.equal(defaultShowInLvlupMemberPortal('goninjaW', 'Summer Camp'), true);
  assert.equal(defaultShowInLvlupMemberPortal('goninjaV', 'camp'), true);
  assert.equal(defaultShowInLvlupMemberPortal('goninjaW', 'Parents\' Night Out'), true);
  assert.equal(defaultShowInLvlupMemberPortal('goninjaV', 'PNO'), true);
  assert.equal(defaultShowInLvlupMemberPortal('goninjaW', 'parents_night_out'), true);
  assert.equal(defaultShowInLvlupMemberPortal('goninjaW', 'Clinic'), false);
  assert.equal(defaultShowInLvlupMemberPortal('waunakee', 'Summer Camp'), false);
  assert.equal(defaultShowInLvlupMemberPortal('eastmad', 'Parents Night Out'), false);
  assert.equal(defaultShowInLvlupMemberPortal('verona', 'Belt test'), false);
  assert.deepEqual(visibleToBrands('goninjaW', true), ['goninja', 'lvlup']);
  assert.deepEqual(visibleToBrands('goninjaV', false), ['goninja']);
  assert.deepEqual(visibleToBrands('waunakee', true), ['lvlup']);
  assert.deepEqual(visibleToBrands('eastmad', false), ['lvlup']);
});

test('the portal filter is the cross-brand Go Ninja list and belt tests stay free', () => {
  const events = sampleStudioEvents('2026-11-27');
  const portal = filterStudioEvents(events, 'portal');
  assert.deepEqual(portal.map(row => row.id), ['gnw-summer-camp', 'gnv-summer-camp', 'gnw-pno', 'gnv-pno']);
  assert.equal(portal.every(row => row.showInLvlupMemberPortal && row.visibleToBrands.includes('lvlup')), true);
  assert.equal(events.find(row => row.id === 'gnw-skills')?.showInLvlupMemberPortal, false);
  const belt = events.find(row => row.id === 'belt-test');
  assert.equal(belt?.memberPriceCents, 0);
  assert.equal(belt?.nonMemberPriceCents, 0);
  assert.equal(events.some(row => row.eventType === 'belt_test' && (row.memberPriceCents !== 0 || row.nonMemberPriceCents !== 0)), false);
  assert.equal(events.some(row => /phone|ata|gymdesk/i.test(row.blurb + row.title)), false);

  const atWaunakee = eventsForLocation(events, 'waunakee').map(row => row.id);
  assert.ok(atWaunakee.includes('belt-test'));
  assert.ok(atWaunakee.includes('gnw-summer-camp'));
  assert.ok(atWaunakee.includes('gnv-pno'));
  assert.equal(atWaunakee.includes('gnw-skills'), false);
  assert.equal(atWaunakee.includes('clinic'), false);

  const atGo = eventsForLocation(events, 'goninjaW').map(row => row.id);
  assert.deepEqual(atGo.sort(), ['gnw-pno', 'gnw-skills', 'gnw-summer-camp']);

  const lvlup = eventsForMemberBrand(events, 'lvlup').map(row => row.id);
  assert.equal(lvlup.includes('gnw-summer-camp'), true);
  assert.equal(lvlup.includes('gnw-skills'), false);
  const ninja = eventsForMemberBrand(events, 'goninja').map(row => row.id);
  assert.equal(ninja.includes('gnw-skills'), true);
  assert.equal(ninja.includes('belt-test'), true);
});

test('the preview rules match the worker catalog', () => {
  const fromUi = rules.studioEvents('2026-11-27');
  const fromApi = sampleStudioEvents('2026-11-27');
  assert.deepEqual(fromUi.map(row => row.id), fromApi.map(row => row.id));
  for (const row of fromApi) {
    const ui = fromUi.find(item => item.id === row.id);
    assert.ok(ui);
    assert.equal(ui.locationId, row.locationId);
    assert.equal(ui.eventType, row.eventType);
    assert.equal(ui.showInLvlupMemberPortal, row.showInLvlupMemberPortal);
    assert.deepEqual(ui.visibleToBrands, row.visibleToBrands);
    assert.equal(ui.memberPriceCents, row.memberPriceCents);
    assert.equal(rules.defaultShowInLvlupMemberPortal(row.locationId, row.eventType), defaultShowInLvlupMemberPortal(row.locationId, row.eventType));
  }
  assert.deepEqual(
    rules.filterStudioEvents(fromUi, 'cross-brand').map(row => row.id),
    filterStudioEvents(fromApi, 'cross-brand').map(row => row.id),
  );
  const member = rules.memberPortalEvents('2026-11-27', 'lvlup', []);
  assert.equal(member.some(row => row.id === 'gnv-summer-camp' && row.showInLvlupMemberPortal), true);
  assert.equal(member.some(row => row.id === 'gnw-skills'), false);
});

test('GET /v1/events filters cross-brand offerings and writes stay off the database', async () => {
  const staff = signToken({
    role: 'staff', email: 'staff@example.test', locationIds: ['waunakee'], familyIds: [], memberId: null, canFinance: false,
  }, SECRET);
  const guardian = signToken({
    role: 'guardian', email: 'guardian@example.test', locationIds: [], familyIds: ['fam'], memberId: null, canFinance: false,
  }, SECRET);
  const list = await call('/v1/events?filter=portal', { token: staff });
  assert.equal(list.status, 200);
  assert.equal(list.json.charges, false);
  assert.equal(list.json.persisted, false);
  assert.deepEqual(list.json.events.map((row: { id: string }) => row.id), ['gnw-pno', 'gnv-pno', 'gnw-summer-camp', 'gnv-summer-camp']);
  assert.equal(list.json.events.every((row: { crossBrand: boolean; showInLvlupMemberPortal: boolean }) => row.crossBrand && row.showInLvlupMemberPortal), true);

  const waunakee = await call('/v1/events?locationId=waunakee', { token: guardian });
  assert.equal(waunakee.status, 200);
  assert.equal(waunakee.json.events.some((row: { id: string }) => row.id === 'gnw-summer-camp'), true);
  assert.equal(waunakee.json.events.some((row: { id: string }) => row.id === 'gnw-skills'), false);

  const created = await call('/v1/events', {
    method: 'POST',
    token: staff,
    body: { title: 'Summer Camp', locationId: 'goninjaV', eventType: 'summer_camp', startsOn: '2027-07-06' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.event.showInLvlupMemberPortal, true);
  assert.deepEqual(created.json.event.visibleToBrands, ['goninja', 'lvlup']);
  assert.equal(created.json.charges, false);
  assert.equal(created.json.persisted, false);

  const clinic = await call('/v1/events', {
    method: 'POST',
    token: staff,
    body: { title: 'Ninja skills night', locationId: 'goninjaW', eventType: 'clinic', startsOn: '2026-12-09', showInLvlupMemberPortal: false },
  });
  assert.equal(clinic.status, 201);
  assert.equal(clinic.json.event.showInLvlupMemberPortal, false);
  assert.deepEqual(clinic.json.event.visibleToBrands, ['goninja']);

  const patched = await call('/v1/events/gnw-summer-camp', {
    method: 'PATCH',
    token: staff,
    body: { showInLvlupMemberPortal: false },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.event.showInLvlupMemberPortal, false);
  assert.equal(patched.json.event.crossBrand, false);
  assert.deepEqual(patched.json.event.visibleToBrands, ['goninja']);
  assert.equal(patched.json.event.memberPriceCents > 0, true);

  const denied = await call('/v1/events', {
    method: 'POST',
    token: guardian,
    body: { title: 'Summer Camp', locationId: 'goninjaW', eventType: 'camp', startsOn: '2027-06-14' },
  });
  assert.equal(denied.status, 403);

  const direct = handleCrossBrandEvents({
    method: 'GET',
    parts: ['v1', 'events'],
    search: new URLSearchParams('filter=school&locationId=goninjaV'),
    actor: actor('staff'),
    body: {},
  });
  assert.deepEqual(
    ((direct.body || {}) as { events: { id: string }[] }).events.map(row => row.id),
    ['gnv-pno', 'gnv-summer-camp'],
  );
});

test('the migration keeps RLS and defaults Go Ninja camps and PNOs on', () => {
  const sql = readFileSync(join(root, '../migrations/017_cross_brand_event_visibility.sql'), 'utf8');
  assert.equal(readFileSync(join(root, '../supabase/migrations/017_cross_brand_event_visibility.sql'), 'utf8'), sql);
  assert.equal(readFileSync(join(root, '../supabase/migrations/20261127000019_cross_brand_event_visibility.sql'), 'utf8'), sql);
  assert.match(sql, /crm_default_show_in_lvlup_member_portal/);
  assert.match(sql, /show_in_lvlup_member_portal/);
  assert.match(sql, /visible_to_brands/);
  assert.match(sql, /goninjaW/);
  assert.match(sql, /goninjaV/);
  assert.match(sql, /summer_camp/);
  assert.match(sql, /'pno'/);
  assert.match(sql, /alter table events enable row level security/);
  assert.equal(/create policy/i.test(sql), false);
  assert.equal(/disable row level security/i.test(sql), false);
  assert.match(sql, /to_regclass\('public\.events'\)/);

  const staff = readFileSync(join(root, '../ui/staff.js'), 'utf8');
  const preview = readFileSync(join(root, '../preview/staff.html'), 'utf8');
  assert.match(staff, /Also show in LVLUP Member Portal/);
  assert.match(staff, /Shown to LVLUP members/);
  assert.match(staff, /Go Ninja Waunakee and Go Ninja Verona/);
  assert.match(preview, /staff\.js/);
  assert.equal(staff.includes("['today'") && staff.includes("['schedule', 'Schedule & Events'"), true);
});
