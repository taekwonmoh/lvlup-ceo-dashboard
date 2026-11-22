import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandTemplates, fitsHours, openHours, type ClassTemplate } from '../src/class-calendar.ts';
import { publicEventBooking, type LaunchEvent } from '../src/events.ts';
import type { PromoCode } from '../src/pricing.ts';

const clinic: PromoCode = {
  code: 'CLINIC10',
  discountType: 'percent',
  percentOff: 10,
  audience: 'all',
  stacks: false,
  active: true,
  scopes: [{ scopeType: 'event_type', eventType: 'clinic' }],
};

function event(partial: Partial<LaunchEvent> = {}): LaunchEvent {
  return {
    id: 'evt_clinic',
    title: 'Saturday clinic',
    locationId: 'waunakee',
    brand: 'lvlup',
    eventType: 'clinic',
    startsAt: '2026-11-21T15:00:00-06:00',
    capacity: 20,
    registered: 8,
    memberPriceCents: 4000,
    nonMemberPriceCents: 5500,
    published: true,
    registrationOpensOn: '2026-11-01',
    registrationClosesOn: '2026-11-21',
    ...partial,
  };
}

test('member and non-member prices, capacity, and a promo', () => {
  const member = publicEventBooking({ event: event(), buyer: 'member', on: '2026-11-10' });
  assert.equal(member.listPriceCents, 4000);
  assert.equal(member.spotsLeft, 12);
  assert.equal(member.available, true);
  const guest = publicEventBooking({ event: event(), buyer: 'new_customer', on: '2026-11-10' });
  assert.equal(guest.listPriceCents, 5500);
  const discounted = publicEventBooking({
    event: event(),
    buyer: 'member',
    on: '2026-11-10',
    codes: ['CLINIC10'],
    catalog: [clinic],
  });
  assert.equal(discounted.dueCents, 3600);
  assert.equal(discounted.discountCents, 400);
  const full = publicEventBooking({
    event: event({ registered: 20 }),
    buyer: 'member',
    on: '2026-11-10',
  });
  assert.equal(full.spotsLeft, 0);
  assert.equal(full.available, false);
  const draft = publicEventBooking({
    event: event({ published: false }),
    buyer: 'member',
    on: '2026-11-10',
  });
  assert.equal(draft.available, false);
});

test('recurring classes stay inside open hours and skip closures', () => {
  assert.equal(openHours('deforest', '2026-11-21'), null);
  assert.deepEqual(openHours('waunakee', '2026-11-20'), { start: '15:00', end: '19:30' });
  assert.equal(openHours('eastmad', '2026-11-20'), null);
  assert.equal(fitsHours('waunakee', '2026-11-16', '17:00', 60), true);
  assert.equal(fitsHours('waunakee', '2026-11-16', '13:00', 60), false);
  assert.equal(fitsHours('deforest', '2026-11-21', '10:00', 60), false);

  const templates: ClassTemplate[] = [
    { id: 'tue', locationId: 'waunakee', title: 'Beginners', weekday: 1, startLocal: '17:00', durationMin: 60, capacity: 20, instructor: 'Ash' },
    { id: 'fri-w', locationId: 'waunakee', title: 'Friday class', weekday: 5, startLocal: '16:00', durationMin: 60, capacity: 16, instructor: 'Ash' },
    { id: 'fri-e', locationId: 'eastmad', title: 'Should not run', weekday: 5, startLocal: '16:00', durationMin: 60, capacity: 16, instructor: 'Ash' },
    { id: 'sat-d', locationId: 'deforest', title: 'Saturday DeForest', weekday: 6, startLocal: '10:00', durationMin: 60, capacity: 12, instructor: 'Joey' },
    { id: 'sat-v', locationId: 'verona', title: 'Saturday Verona', weekday: 6, startLocal: '10:00', durationMin: 60, capacity: 12, instructor: 'Bryan' },
  ];
  const sessions = expandTemplates({
    templates,
    from: '2026-11-16',
    through: '2026-11-22',
    closures: [{ date: '2026-11-16', locationId: 'waunakee' }],
  });
  const titles = sessions.map(s => s.date + ' ' + s.title + ' ' + s.status);
  assert.ok(titles.includes('2026-11-16 Beginners cancelled'));
  assert.ok(titles.some(t => t.startsWith('2026-11-20 Friday class scheduled')));
  assert.equal(sessions.some(s => s.title === 'Should not run'), false);
  assert.equal(sessions.some(s => s.title === 'Saturday DeForest'), false);
  assert.ok(sessions.some(s => s.title === 'Saturday Verona' && s.status === 'scheduled'));
});
