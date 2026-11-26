import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextBelt, pathAhead, martialRoadmap } from '../src/journey.ts';
import { compareShadowDay } from '../src/shadow-billing.ts';
import { parsePayments, parseStagingMembers, collapseFamilies } from '../src/import-job.ts';
import { prepareCharge } from '../src/charge-gate.ts';
import { distanceMeters, insideGeofence } from '../src/geofence.ts';
import { dunningSchedule } from '../src/dunning.ts';
import { isAtRisk } from '../src/at-risk.ts';
import { promoteWaitlist } from '../src/waitlist.ts';
import { journalEntry, instructorBill, assertQboOffline } from '../src/qbo.ts';
import { payoutReport } from '../src/payouts.ts';
import { verifyFirebaseIdToken } from '../src/firebase-auth.ts';
import { ranksForProgram } from '../src/ranks.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'platform');

test('belt names and transitions match the catalog', () => {
  assert.equal(ranksForProgram('mini_tiger').length, 18);
  assert.equal(ranksForProgram('tiger').length, 18);
  assert.equal(ranksForProgram('mini_tiger')[2].name, 'Orange');
  assert.equal(nextBelt('mini_tiger.orange')?.rank.name, 'Baeoh the Tiger');
  assert.equal(nextBelt('mini_tiger.baron')?.rank.canonicalId, 'tiger.white');
  assert.equal(nextBelt('mini_tiger.baron')?.via, 'program_transition');
  assert.equal(nextBelt('tiger.baron')?.rank.canonicalId, 'songahm.white');
  assert.equal(nextBelt('songahm.red_black')?.rank.name, '1st Degree Black Belt');
  assert.equal(nextBelt('songahm.bb4')?.rank.name, '5th Degree Black Belt');
  assert.equal(nextBelt('songahm.bb9'), null);
  const ahead = pathAhead('songahm.yellow');
  assert.equal(ahead.next?.name, 'Camo - Recommended');
  assert.equal(ahead.current?.name, 'Yellow');
  const roadmap = martialRoadmap();
  assert.equal(roadmap[0].name, 'White');
  assert.equal(roadmap.at(-1)?.name, '9th Degree Black Belt');
  const owner = ahead.pathways.find(p => p.code === 'school_owner');
  assert.equal(owner?.needsSignoff, true);
  assert.equal(owner?.milestones[0].minClasses, null);
  assert.equal(ahead.pathways.find(p => p.code === 'master')?.note.includes('9th Degree'), true);
  assert.equal(ahead.proposedTitles.find(t => t.title === 'Junior Instructor')?.milestoneId, null);
});

test('shadow compare separates holds, prepaid, and double-charge risk', async () => {
  const members = parseStagingMembers(await readFile(join(root, 'members.csv'), 'utf8'))
    .filter(m => m.status === 'active' || m.status === 'hold');
  const payments = parsePayments(await readFile(join(root, 'payments.csv'), 'utf8'));
  const collapse = collapseFamilies(members);
  assert.equal(collapse.collapsed, 1);
  assert.equal(collapse.childLinks, 6);
  const report = compareShadowDay({
    on: '2027-01-04',
    merchantLocationId: 'waunakee',
    payments,
    members: members.map(m => ({
      memberId: m.memberId,
      locationId: m.locationId,
      status: m.status === 'hold' ? 'hold' : 'active',
      biller: 'gymdesk',
      nextBillOn: m.nextBillOn,
      paidThroughOn: m.paidThroughOn,
      amountCents: m.amountCents,
      discountBps: m.discountBps,
      prepaid: m.prepaid,
      hold: m.memberId === '20000006' ? { status: 'approved', startOn: '2026-12-01', endOn: '2027-02-01' } : null,
    })),
  });
  assert.deepEqual(report.matched.map(row => row.memberId).sort(), ['20000001', '20000003']);
  assert.deepEqual(report.doubleChargeRisk.map(row => row.memberId).sort(), ['20000004', '20000099']);
  assert.equal(report.skipped.find(row => row.memberId === '20000006')?.reason, 'skipped_hold');
  assert.equal(report.skipped.find(row => row.memberId === '20000004')?.reason, 'skipped_prepaid');
});

test('charge gate, geofence, dunning, waitlist, and qbo stay offline', () => {
  assert.throws(() => prepareCharge({}, { customerProfileId: '910000001', paymentProfileId: '810000001', amountCents: 100, invoiceNumber: 't' }), /Charging is off/);
  assert.throws(() => prepareCharge({ BILLING_CHARGES_ENABLED: '1', AUTHORIZENET_MODE: 'sandbox' }, { cardNumber: '4111111111111111' }), /Card numbers/);
  const inside = insideGeofence({ latitude: 43.01, longitude: -89.01, schoolLatitude: 43.01, schoolLongitude: -89.01, radiusM: 120 });
  assert.equal(inside.inside, true);
  const outside = insideGeofence({ latitude: 43.02, longitude: -89.01, schoolLatitude: 43.01, schoolLongitude: -89.01, radiusM: 120 });
  assert.equal(outside.inside, false);
  assert.ok(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) > 100000);
  const schedule = dunningSchedule('2027-01-04');
  assert.equal(schedule.every(row => row.send === false), true);
  assert.equal(schedule[3].membershipStatus, 'past_due');
  assert.equal(isAtRisk({ recent: 1, baseline: 8 }), true);
  assert.equal(isAtRisk({ recent: 1, baseline: 2 }), false);
  const promoted = promoteWaitlist([
    { id: 'a', status: 'booked', createdAt: '1' },
    { id: 'b', status: 'waitlist', createdAt: '2' },
    { id: 'c', status: 'waitlist', createdAt: '3' },
  ], 'a');
  assert.equal(promoted.promotedId, 'b');
  const doc = instructorBill({
    companyId: 'moh',
    txnDate: '2027-01-04',
    vendorName: 'Instructor Sample',
    amountCents: 4000,
    expenseAccount: 'FIX-5000',
    payableAccount: 'FIX-2000',
    className: 'waunakee',
    description: 'Fixture share',
  });
  assert.equal(doc.submitted, false);
  assert.equal(assertQboOffline({}).submitted, false);
  assert.throws(() => assertQboOffline({ QBO_ENABLED: '1' }));
  assert.throws(() => journalEntry({
    companyId: 'moh',
    txnDate: '2027-01-04',
    privateNote: 'bad',
    lines: [{ amountCents: 100, postingType: 'Debit', accountCode: 'FIX-1', description: 'x' }],
  }));
  const report = payoutReport({
    companyFor: () => ({ id: 'moh', legalName: "Moh's Martial Arts LLC" }),
    clockMinutes: [{ staffId: 's1', minutes: 60 }],
    rules: [{ staffId: 's1', locationId: 'waunakee', lessonType: 'private', percentBps: 4000, effectiveOn: '2026-01-01', endsOn: null }],
    lessons: [{
      staffId: 's1', staffName: 'Instructor Sample', locationId: 'waunakee', lessonType: 'private',
      on: '2027-01-04', priceCents: 10000, paid: true, status: 'taught', durationMin: 30,
    }],
  });
  assert.equal(report[0].shareCents, 4000);
  assert.equal(report[0].totalMinutes, 90);
});

test('firebase token verification uses a local cert and does not call Google', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    aud: 'lvlup-members-app',
    iss: 'https://securetoken.google.com/lvlup-members-app',
    sub: 'fixture-user',
    email: 'avery.sample@example.test',
    email_verified: true,
    exp: now + 600,
    iat: now,
  })).toString('base64url');
  const sig = createSign('RSA-SHA256').update(`${header}.${payload}`).end().sign(privateKey).toString('base64url');
  const claims = await verifyFirebaseIdToken(`${header}.${payload}.${sig}`, {
    projectId: 'lvlup-members-app',
    certs: { fixture: pem },
    nowSec: now,
  });
  assert.equal(claims.email, 'avery.sample@example.test');
});
