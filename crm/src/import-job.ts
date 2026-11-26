/**
 * GymDesk staging import. Parses export text. Writes only through the caller.
 * Tests pass fixture files. This module does not open a network connection.
 */
import { cadenceForPlan, merchantAccountFor } from './billing.ts';
import { findCardPayload } from './charge-gate.ts';
import { locationIdFromName, matchCimProfiles, type CimProfile } from './gymdesk.ts';
import { resolveRank } from './ranks.ts';

export type Db = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

export type StagingMember = {
  memberId: string;
  firstName: string;
  lastName: string;
  status: string;
  joined: string | null;
  rank: string;
  email: string;
  locationId: string;
  plan: string;
  amountCents: number;
  nextBillOn: string | null;
  paidThroughOn: string | null;
  prepaid: boolean;
  discountBps: number;
  firebaseFamilyId: string | null;
  firebaseFamilyScheme: string;
  firebaseStudentKey: string;
};

export type StagingHold = { memberId: string; startOn: string; endOn: string; reason: string };
export type StagingWaiver = { memberId: string; version: string; signedOn: string };

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim()));
}

function headerIndex(header: string[], name: string) {
  return header.indexOf(name);
}

function cell(row: string[], header: string[], name: string) {
  const index = headerIndex(header, name);
  return index < 0 ? '' : (row[index] || '').trim();
}

export function parseStagingMembers(text: string): StagingMember[] {
  if (findCardPayload(text)) throw new Error('Import rejected a card-like value');
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const out: StagingMember[] = [];
  for (const row of rows.slice(1)) {
    const memberId = cell(row, header, 'member_id');
    const firstName = cell(row, header, 'first_name');
    if (!memberId || !firstName) continue;
    if (!/^\d{4,12}$/.test(memberId)) throw new Error('member_id must be the numeric GymDesk id');
    const locationId = locationIdFromName(cell(row, header, 'location'));
    const amount = Number(cell(row, header, 'amount') || 0);
    const joinedRaw = cell(row, header, 'joined');
    let joined: string | null = null;
    const us = joinedRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) joined = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(joinedRaw)) joined = joinedRaw;
    const email = cell(row, header, 'email').toLowerCase();
    out.push({
      memberId,
      firstName,
      lastName: cell(row, header, 'last_name'),
      status: (cell(row, header, 'status') || 'active').toLowerCase(),
      joined,
      rank: cell(row, header, 'rank'),
      email,
      locationId,
      plan: cell(row, header, 'plan') || 'Standard',
      amountCents: Math.round(amount * 100),
      nextBillOn: cell(row, header, 'next_bill_on') || null,
      paidThroughOn: cell(row, header, 'paid_through_on') || null,
      prepaid: ['1', 'true', 'yes'].includes(cell(row, header, 'prepaid').toLowerCase()),
      discountBps: Number(cell(row, header, 'discount_bps') || 0),
      firebaseFamilyId: cell(row, header, 'firebase_family_id') || null,
      firebaseFamilyScheme: cell(row, header, 'firebase_family_scheme'),
      firebaseStudentKey: cell(row, header, 'firebase_student_key') || `gymdesk_${memberId}`,
    });
  }
  return out;
}

export function collapseFamilies(members: StagingMember[]) {
  const byEmail = new Map<string, { familyIds: Set<string>; memberIds: string[] }>();
  for (const member of members) {
    const email = member.email || `missing:${member.memberId}`;
    let group = byEmail.get(email);
    if (!group) {
      group = { familyIds: new Set(), memberIds: [] };
      byEmail.set(email, group);
    }
    if (member.firebaseFamilyId) group.familyIds.add(member.firebaseFamilyId);
    group.memberIds.push(member.memberId);
  }
  const collapsed = [...byEmail.values()].filter(group => group.familyIds.size > 1).length;
  return {
    families: byEmail.size,
    collapsed,
    childLinks: members.reduce((sum, group) => sum + 1, 0),
    groups: byEmail,
  };
}

export function parsePayments(text: string) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(row => ({
    memberId: cell(row, header, 'member_id'),
    on: cell(row, header, 'date'),
    amountCents: Math.round(Number(cell(row, header, 'amount') || 0) * 100),
    status: (cell(row, header, 'status') || 'approved').toLowerCase(),
    locationId: locationIdFromName(cell(row, header, 'location')),
  })).filter(row => row.memberId && row.on && row.locationId);
}

function rankProgram(plan: string) {
  if (/mini/i.test(plan)) return 'mini_tiger';
  if (/go ninja/i.test(plan)) return 'goninja';
  return 'songahm';
}

export async function importStaging(client: Db, input: {
  members: StagingMember[];
  profiles: CimProfile[];
  holds: StagingHold[];
  waivers: StagingWaiver[];
}) {
  const located = input.members.filter(m => m.locationId && (m.status === 'active' || m.status === 'hold'));
  const collapse = collapseFamilies(located);
  const report = matchCimProfiles(
    located.map(m => ({ memberId: m.memberId, locationId: m.locationId })),
    input.profiles,
  );
  await client.query(`select crm_private.set_actor('import', '', '')`);
  const familyByEmail = new Map<string, string>();
  for (const member of located) {
    let familyId = familyByEmail.get(member.email);
    if (!familyId) {
      const existing = await client.query(
        `select gf.family_id from guardians g
         join guardian_families gf on gf.guardian_id = g.id and gf.role = 'payer'
         where g.email = $1 limit 1`,
        [member.email],
      );
      familyId = existing.rows[0]?.family_id as string | undefined;
      if (!familyId) {
        const fam = await client.query(
          `insert into families (display_name) values ($1) returning id`,
          [member.lastName || 'Sample'],
        );
        familyId = fam.rows[0].id as string;
        const guardian = await client.query(
          `insert into guardians (email, first_name, last_name) values ($1, $2, $3)
           on conflict (email) do update set last_name = excluded.last_name returning id`,
          [member.email, 'Guardian', member.lastName || 'Sample'],
        );
        await client.query(
          `insert into guardian_families (family_id, guardian_id, role) values ($1, $2, 'payer')
           on conflict do nothing`,
          [familyId, guardian.rows[0].id],
        );
      }
      familyByEmail.set(member.email, familyId);
    }
    const saved = await client.query(
      `insert into members (family_id, location_id, first_name, last_name, status, firebase_student_key)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (firebase_student_key) do update set first_name = excluded.first_name
       returning id`,
      [familyId, member.locationId, member.firstName, member.lastName, member.status === 'hold' ? 'hold' : 'active', member.firebaseStudentKey],
    );
    const memberUuid = saved.rows[0].id as string;
    const keptIds = collapse.groups.get(member.email)?.familyIds || new Set<string>();
    await client.query(
      `insert into crm_private.identity_crosswalk
         (member_id, family_id, location_id, merchant_location_id, gymdesk_member_id, firebase_student_key, firebase_family_ids)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (location_id, gymdesk_member_id) do update
         set firebase_family_ids = excluded.firebase_family_ids`,
      [
        memberUuid,
        familyId,
        member.locationId,
        merchantAccountFor(member.locationId).merchantLocationId,
        member.memberId,
        member.firebaseStudentKey,
        [...keptIds],
      ],
    );
    await client.query(
      `insert into external_ids (entity_type, entity_id, system, value)
       values ('member', $1, 'gymdesk', $2)
       on conflict (system, entity_type, value) do nothing`,
      [memberUuid, member.memberId],
    );
    for (const firebaseFamilyId of keptIds) {
      await client.query(
        `insert into external_ids (entity_type, entity_id, system, value)
         values ('family', $1, 'firebase_family', $2)
         on conflict (system, entity_type, value) do nothing`,
        [familyId, firebaseFamilyId],
      );
    }
    let plan = await client.query(
      `select id from plans where location_id = $1 and name = $2 limit 1`,
      [member.locationId, member.plan],
    );
    if (!plan.rowCount) {
      const interval = cadenceForPlan({ name: member.plan, grandfathered: /grandfather/i.test(member.plan) });
      const program = /mini/i.test(member.plan) ? 'mini_tigers' : 'taekwondo';
      plan = await client.query(
        `insert into plans (location_id, name, program, amount_cents, interval, grandfathered)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [member.locationId, member.plan, program, member.amountCents, interval, /grandfather/i.test(member.plan)],
      );
    }
    const status = member.status === 'hold' ? 'hold' : 'active';
    const existingMs = await client.query(
      `select id from memberships where location_id = $1 and gymdesk_member_id = $2`,
      [member.locationId, member.memberId],
    );
    let membershipId = existingMs.rows[0]?.id as string | undefined;
    if (!membershipId) {
      const ms = await client.query(
        `insert into memberships
           (family_id, location_id, plan_id, status, biller, started_on, anchor_on, next_bill_on, paid_through_on, gymdesk_member_id, discount_bps, prepaid)
         values ($1, $2, $3, $4, 'gymdesk', $5, $5, $6, $7, $8, $9, $10) returning id`,
        [
          familyId,
          member.locationId,
          plan.rows[0].id,
          status,
          member.joined || '2026-01-01',
          member.nextBillOn,
          member.paidThroughOn,
          member.memberId,
          member.discountBps,
          member.prepaid,
        ],
      );
      membershipId = ms.rows[0].id as string;
    }
    await client.query(
      `insert into membership_members (membership_id, member_id) values ($1, $2) on conflict do nothing`,
      [membershipId, memberUuid],
    );
    const resolved = resolveRank(rankProgram(member.plan), member.rank);
    if (resolved?.rank) {
      const rank = await client.query(`select id from ranks where canonical_id = $1`, [resolved.rank.canonicalId]);
      if (rank.rowCount) {
        await client.query(
          `insert into member_rank_events (member_id, rank_id, awarded_on, source)
           select $1, $2, $3, 'gymdesk_import'
           where not exists (
             select 1 from member_rank_events where member_id = $1 and rank_id = $2
           )`,
          [memberUuid, rank.rows[0].id, member.joined || '2026-01-01'],
        );
      }
    }
    const hit = report.matched.find(row => row.memberId === member.memberId && row.paymentProfileId);
    if (hit) {
      const merchantLocation = merchantAccountFor(member.locationId).merchantLocationId;
      let merchant = await client.query(`select id from merchant_accounts where location_id = $1`, [merchantLocation]);
      if (!merchant.rowCount) {
        merchant = await client.query(
          `insert into merchant_accounts (location_id, label, environment, live_billing_enabled)
           values ($1, $2, 'sandbox', false) returning id`,
          [merchantLocation, merchantLocation + ' sandbox'],
        );
      }
      await client.query(
        `insert into payment_profiles
           (location_id, family_id, customer_profile_id, payment_profile_id, brand, last4, is_default, environment)
         values ($1, $2, $3, $4, $5, $6, true, 'sandbox')
         on conflict (location_id, customer_profile_id, payment_profile_id) do nothing`,
        [merchantLocation, familyId, hit.customerProfileId, hit.paymentProfileId, hit.brand, hit.last4],
      );
      await client.query(
        `update crm_private.identity_crosswalk
         set customer_profile_id = $2, payment_profile_id = $3
         where member_id = $1`,
        [memberUuid, hit.customerProfileId, hit.paymentProfileId],
      );
    }
  }
  for (const hold of input.holds) {
    const ms = await client.query(
      `select id from memberships where gymdesk_member_id = $1 limit 1`,
      [hold.memberId],
    );
    if (!ms.rowCount) continue;
    await client.query(
      `insert into holds (membership_id, start_on, end_on, reason, status)
       select $1, $2, $3, $4, 'approved'
       where not exists (
         select 1 from holds where membership_id = $1 and start_on = $2
       )`,
      [ms.rows[0].id, hold.startOn, hold.endOn, hold.reason],
    );
  }
  let waivers = 0;
  for (const waiver of input.waivers) {
    const member = await client.query(
      `select id, family_id, location_id from members where firebase_student_key = $1`,
      [`gymdesk_${waiver.memberId}`],
    );
    if (!member.rowCount) continue;
    await client.query(
      `insert into waivers (family_id, member_id, location_id, waiver_version, signed_on, minor)
       values ($1, $2, $3, $4, $5, true)`,
      [member.rows[0].family_id, member.rows[0].id, member.rows[0].location_id, waiver.version, waiver.signedOn],
    );
    waivers += 1;
  }
  const summary = {
    members: located.length,
    guardians: familyByEmail.size,
    families: familyByEmail.size,
    familiesCollapsed: collapse.collapsed,
    childLinksKept: located.length,
    matched: report.matched.filter(row => row.hasPaymentMethod).length,
    memberWithoutProfile: report.memberWithoutProfile,
    profileWithoutMember: report.profileWithoutMember,
    profileWithoutPaymentMethod: report.profileWithoutPaymentMethod,
    firebaseFamilyIdsRetained: [...new Set(located.flatMap(m => m.firebaseFamilyId ? [m.firebaseFamilyId] : []))],
    waivers,
    holds: input.holds.length,
  };
  await client.query(
    `insert into import_runs (source, status, summary, finished_at) values ('gymdesk-staging', 'ok', $1::jsonb, now())`,
    [JSON.stringify(summary)],
  );
  return summary;
}
