/** Read-only GymDesk import planning. Parses fixtures. Never calls the network. */

export type MemberRow = {
  memberId: string;
  firstName: string;
  lastName: string;
  status: string;
  joined: string | null;
  rank: string;
  email: string;
  locationName: string;
  plan: string;
  amountCents: number;
};

export type CimProfile = {
  locationId: string;
  customerProfileId: string;
  merchantCustomerId: string;
  paymentProfileId: string | null;
  brand: string | null;
  last4: string | null;
};

export type LeadRow = {
  gymdeskLeadId: string;
  locationId: string;
  guardianName: string;
  phone: string;
  email: string;
  childName: string;
  childAge: string;
  source: string;
};

const LOC: Record<string, string> = {
  waunakee: 'waunakee',
  verona: 'verona',
  'east madison': 'eastmad',
  eastmadison: 'eastmad',
  eastmad: 'eastmad',
  deforest: 'deforest',
  'go ninja waunakee': 'goninjaW',
  'go ninja verona': 'goninjaV',
};

export function locationIdFromName(name: string) {
  const key = String(name || '').trim().toLowerCase();
  return LOC[key] || '';
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

export function parseMembersCsv(text: string): MemberRow[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const hdr = rows[0].map(h => h.trim().toLowerCase());
  const col = (n: string) => hdr.indexOf(n);
  const out: MemberRow[] = [];
  for (const row of rows.slice(1)) {
    const memberId = (row[col('member_id')] || '').trim();
    const first = (row[col('first_name')] || '').trim();
    const last = (row[col('last_name')] || '').trim();
    if (!memberId || !first) continue;
    if (!/^\d{4,12}$/.test(memberId)) throw new Error('member_id must be the numeric GymDesk id');
    const amount = Number(row[col('amount')] || 0);
    const joinedRaw = (row[col('joined')] || '').trim();
    let joined: string | null = null;
    const m = joinedRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) joined = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(joinedRaw)) joined = joinedRaw;
    out.push({
      memberId,
      firstName: first,
      lastName: last,
      status: (row[col('status')] || 'active').trim().toLowerCase(),
      joined,
      rank: (row[col('rank')] || '').trim(),
      email: (row[col('email')] || '').trim().toLowerCase(),
      locationName: (row[col('location')] || '').trim(),
      plan: (row[col('plan')] || 'Standard').trim(),
      amountCents: Math.round(amount * 100),
    });
  }
  return out;
}

export function parseAttendanceCsv(text: string) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const hdr = rows[0].map(h => h.trim().toLowerCase());
  const id = hdr.indexOf('member_id');
  const date = hdr.indexOf('date');
  return rows.slice(1).map(r => ({
    memberId: (r[id] || '').trim(),
    date: (r[date] || '').trim(),
  })).filter(r => r.memberId && r.date);
}

export type ProfileMatch = {
  memberId: string;
  locationId: string;
  customerProfileId: string;
  paymentProfileId: string | null;
  brand: string | null;
  last4: string | null;
  hasPaymentMethod: boolean;
};

export type MatchReport = {
  matched: ProfileMatch[];
  memberWithoutProfile: string[];
  profileWithoutMember: string[];
  profileWithoutPaymentMethod: string[];
};

export function matchCimProfiles(members: { memberId: string; locationId: string }[], profiles: CimProfile[]): MatchReport {
  const byMerchant = new Map<string, CimProfile>();
  for (const p of profiles) {
    if (p.last4 && !/^\d{4}$/.test(p.last4)) throw new Error('last4 must be 4 digits');
    byMerchant.set(p.locationId + ':' + p.merchantCustomerId, p);
  }
  const memberKeys = new Set(members.map(m => m.locationId + ':' + m.memberId));
  const matched: ProfileMatch[] = [];
  const memberWithoutProfile: string[] = [];
  const profileWithoutPaymentMethod: string[] = [];
  for (const m of members) {
    const p = byMerchant.get(m.locationId + ':' + m.memberId);
    if (!p) { memberWithoutProfile.push(m.memberId); continue; }
    if (!p.paymentProfileId) profileWithoutPaymentMethod.push(m.memberId);
    matched.push({
      memberId: m.memberId,
      locationId: m.locationId,
      customerProfileId: p.customerProfileId,
      paymentProfileId: p.paymentProfileId,
      brand: p.brand,
      last4: p.last4,
      hasPaymentMethod: !!p.paymentProfileId,
    });
  }
  const profileWithoutMember = profiles
    .filter(p => !memberKeys.has(p.locationId + ':' + p.merchantCustomerId))
    .map(p => p.customerProfileId);
  return { matched, memberWithoutProfile, profileWithoutMember, profileWithoutPaymentMethod };
}
