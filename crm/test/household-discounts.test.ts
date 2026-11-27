import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../lib/household-discounts.js');

const HD = (globalThis as typeof globalThis & {
  HouseholdDiscounts: {
    defaultRules: () => Rule[];
    quoteHousehold: (input: QuoteInput) => Quote;
    cleanRule: (rule: Rule) => Rule;
    ruleFromRow: (row: Record<string, unknown>) => Rule;
    rulesFromStorage: (raw: string) => Rule[] | null;
    pickRule: (rules: Rule[], locationId: string, program: string) => Rule | null;
    describeRule: (rule: Rule) => string;
    STORAGE_KEY: string;
  };
}).HouseholdDiscounts;

type Spec = { kind: 'percent' | 'amount'; percentOff: number | null; amountOffCents: number | null };
type Rule = {
  id: string;
  locationId: string;
  program: string;
  active: boolean;
  mode: 'stackable' | 'best';
  secondChild: Spec;
  thirdPlus: Spec;
  multiWeek: { minWeeks: number; discount: Spec } | null;
};
type Line = {
  lineId: string;
  childKey: string;
  program: string;
  locationId: string;
  unitPriceCents: number;
  quantity?: number;
  weeks?: number;
  alreadyEnrolled?: boolean;
  label?: string;
};
type QuoteInput = { rules?: Rule[]; lines: Line[]; enrolled?: Array<{ childKey: string; program: string; locationId: string }> };
type Child = {
  childKey: string;
  rank: number;
  listCents: number;
  dueCents: number;
  discountCents: number;
  siblingDiscountCents: number;
  multiWeekDiscountCents: number;
  alreadyEnrolled: boolean;
  weekCount: number;
  ruleId: string | null;
  chosen: string;
};
type Quote = {
  charged: boolean;
  preview: boolean;
  listCents: number;
  discountCents: number;
  dueCents: number;
  children: Child[];
  lines: Array<{ lineId: string; discountCents: number; dueCents: number; listCents: number }>;
};

const root = dirname(fileURLToPath(import.meta.url));
const rules = () => HD.defaultRules();

function line(partial: Line): Line {
  return partial;
}

function child(quote: Quote, key: string) {
  const found = quote.children.find(row => row.childKey === key);
  assert.ok(found, key);
  return found;
}

test('one child pays the sample list price', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: [line({ lineId: 'a', childKey: 'avery', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 18900 })],
  });
  assert.equal(quote.charged, false);
  assert.equal(quote.preview, true);
  assert.equal(quote.listCents, 18900);
  assert.equal(quote.discountCents, 0);
  assert.equal(quote.dueCents, 18900);
  assert.equal(child(quote, 'avery').rank, 1);
  assert.equal(JSON.stringify(quote).includes('tel:'), false);
});

test('two children give the 2nd child 10 percent off', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: [
      line({ lineId: 'a', childKey: 'avery', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 18900 }),
      line({ lineId: 'b', childKey: 'jordan', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 18900 }),
    ],
  });
  assert.equal(child(quote, 'avery').dueCents, 18900);
  assert.equal(child(quote, 'jordan').rank, 2);
  assert.equal(child(quote, 'jordan').siblingDiscountCents, 1890);
  assert.equal(child(quote, 'jordan').dueCents, 17010);
  assert.equal(quote.dueCents, 35910);
});

test('three and four children use the 3rd+ rate', () => {
  const keys = ['avery', 'jordan', 'casey', 'quinn'];
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: keys.map((key, index) => line({
      lineId: 'n' + index, childKey: key, program: 'afterschool', locationId: 'goninjaV', unitPriceCents: 28000,
    })),
  });
  assert.equal(child(quote, 'avery').discountCents, 0);
  assert.equal(child(quote, 'jordan').siblingDiscountCents, 2800);
  assert.equal(child(quote, 'casey').rank, 3);
  assert.equal(child(quote, 'casey').siblingDiscountCents, 5600);
  assert.equal(child(quote, 'quinn').rank, 4);
  assert.equal(child(quote, 'quinn').siblingDiscountCents, 5600);
  assert.equal(quote.dueCents, 28000 + 25200 + 22400 + 22400);
});

test('an enrolled sibling makes the new child the 2nd child', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: [line({ lineId: 'new', childKey: 'jordan', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 18900 })],
    enrolled: [{ childKey: 'avery', program: 'ninja_8wk', locationId: 'goninjaW' }],
  });
  assert.equal(child(quote, 'avery').rank, 1);
  assert.equal(child(quote, 'avery').alreadyEnrolled, true);
  assert.equal(child(quote, 'avery').dueCents, 0);
  assert.equal(child(quote, 'jordan').rank, 2);
  assert.equal(child(quote, 'jordan').dueCents, 17010);
  assert.equal(quote.dueCents, 17010);
});

test('two enrolled siblings make the new child 3rd+', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: [line({ lineId: 'new', childKey: 'casey', program: 'afterschool', locationId: 'goninjaW', unitPriceCents: 28000 })],
    enrolled: [
      { childKey: 'avery', program: 'afterschool', locationId: 'goninjaW' },
      { childKey: 'jordan', program: 'afterschool', locationId: 'goninjaW' },
    ],
  });
  assert.equal(child(quote, 'casey').rank, 3);
  assert.equal(child(quote, 'casey').dueCents, 22400);
});

test('a single camp week discounts the 2nd child and skips the multi-week bundle', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: [
      line({ lineId: 'a', childKey: 'avery', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 24900, weeks: 1 }),
      line({ lineId: 'b', childKey: 'jordan', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 24900, weeks: 1 }),
    ],
  });
  assert.equal(child(quote, 'avery').multiWeekDiscountCents, 0);
  assert.equal(child(quote, 'avery').dueCents, 24900);
  assert.equal(child(quote, 'jordan').siblingDiscountCents, 2490);
  assert.equal(child(quote, 'jordan').multiWeekDiscountCents, 0);
  assert.equal(child(quote, 'jordan').weekCount, 1);
});

test('multi-week camp stacks across siblings', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: [
      line({ lineId: 'a1', childKey: 'avery', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 24900, label: 'Avery Sample · Obstacle Island' }),
      line({ lineId: 'a2', childKey: 'avery', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 24900 }),
      line({ lineId: 'a3', childKey: 'avery', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 24900 }),
      line({ lineId: 'b1', childKey: 'jordan', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 24900 }),
    ],
  });
  const avery = child(quote, 'avery');
  assert.equal(avery.rank, 1);
  assert.equal(avery.weekCount, 3);
  assert.equal(avery.listCents, 74700);
  assert.equal(avery.siblingDiscountCents, 0);
  assert.equal(avery.multiWeekDiscountCents, 3735);
  assert.equal(avery.dueCents, 70965);
  const jordan = child(quote, 'jordan');
  assert.equal(jordan.rank, 2);
  assert.equal(jordan.siblingDiscountCents, 2490);
  assert.equal(jordan.multiWeekDiscountCents, 0);
  assert.equal(jordan.dueCents, 22410);
  assert.equal(quote.listCents, 99600);
  assert.equal(quote.dueCents, 93375);
  const shares = quote.lines.filter(row => row.lineId.startsWith('a')).reduce((sum, row) => sum + row.discountCents, 0);
  assert.equal(shares, 3735);
});

test('best mode keeps the larger discount and a tie keeps the sibling discount', () => {
  const base = HD.cleanRule({
    id: 'camp-best',
    locationId: 'goninjaW',
    program: 'summer_camp',
    active: true,
    mode: 'best',
    secondChild: { kind: 'percent', percentOff: 10, amountOffCents: null },
    thirdPlus: { kind: 'percent', percentOff: 20, amountOffCents: null },
    multiWeek: { minWeeks: 3, discount: { kind: 'percent', percentOff: 5, amountOffCents: null } },
  });
  const stacked = HD.quoteHousehold({
    rules: [{ ...base, mode: 'stackable' }],
    lines: [line({ lineId: 'b', childKey: 'jordan', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 20000, quantity: 4 })],
    enrolled: [{ childKey: 'avery', program: 'summer_camp', locationId: 'goninjaW' }],
  });
  assert.equal(child(stacked, 'jordan').siblingDiscountCents, 8000);
  assert.equal(child(stacked, 'jordan').multiWeekDiscountCents, 4000);
  assert.equal(child(stacked, 'jordan').dueCents, 68000);
  const best = HD.quoteHousehold({
    rules: [base],
    lines: [line({ lineId: 'b', childKey: 'jordan', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 20000, quantity: 4 })],
    enrolled: [{ childKey: 'avery', program: 'summer_camp', locationId: 'goninjaW' }],
  });
  assert.equal(child(best, 'jordan').siblingDiscountCents, 8000);
  assert.equal(child(best, 'jordan').multiWeekDiscountCents, 0);
  assert.equal(child(best, 'jordan').chosen, 'sibling');
  const biggerWeek = HD.quoteHousehold({
    rules: [HD.cleanRule({ ...base, multiWeek: { minWeeks: 3, discount: { kind: 'percent', percentOff: 25, amountOffCents: null } } })],
    lines: [line({ lineId: 'b', childKey: 'jordan', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 20000, quantity: 4 })],
    enrolled: [{ childKey: 'avery', program: 'summer_camp', locationId: 'goninjaW' }],
  });
  assert.equal(child(biggerWeek, 'jordan').chosen, 'multiWeek');
  assert.equal(child(biggerWeek, 'jordan').multiWeekDiscountCents, 20000);
  assert.equal(child(biggerWeek, 'jordan').siblingDiscountCents, 0);
});

test('afterschool bills three kids with the household rates', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: ['avery', 'jordan', 'casey'].map((key, index) => line({
      lineId: 'as' + index, childKey: key, program: 'afterschool', locationId: 'goninjaW', unitPriceCents: 28000,
    })),
  });
  assert.equal(quote.listCents, 84000);
  assert.equal(quote.discountCents, 2800 + 5600);
  assert.equal(quote.dueCents, 75600);
  assert.equal(child(quote, 'casey').ruleId, 'gnw-afterschool');
});

test('programs and locations do not share a rank', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: [
      line({ lineId: 'ac', childKey: 'avery', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 18900 }),
      line({ lineId: 'as', childKey: 'jordan', program: 'afterschool', locationId: 'goninjaW', unitPriceCents: 28000 }),
      line({ lineId: 'v', childKey: 'casey', program: 'ninja_8wk', locationId: 'goninjaV', unitPriceCents: 18900 }),
    ],
  });
  assert.equal(child(quote, 'avery').rank, 1);
  assert.equal(child(quote, 'jordan').rank, 1);
  assert.equal(child(quote, 'casey').rank, 1);
  assert.equal(quote.discountCents, 0);
});

test('a program rule beats the all-programs rule and an off rule falls through', () => {
  const custom = rules().map(rule => {
    if (rule.id === 'gnw-afterschool') {
      return HD.cleanRule({ ...rule, secondChild: { kind: 'amount', percentOff: null, amountOffCents: 2500 } });
    }
    return rule;
  });
  const quote = HD.quoteHousehold({
    rules: custom,
    lines: [
      line({ lineId: 'a', childKey: 'avery', program: 'afterschool', locationId: 'goninjaW', unitPriceCents: 28000 }),
      line({ lineId: 'b', childKey: 'jordan', program: 'afterschool', locationId: 'goninjaW', unitPriceCents: 28000 }),
    ],
  });
  assert.equal(child(quote, 'jordan').siblingDiscountCents, 2500);
  assert.equal(child(quote, 'jordan').ruleId, 'gnw-afterschool');
  const off = custom.map(rule => rule.id === 'gnw-summer-camp' ? { ...rule, active: false } : rule);
  const camp = HD.quoteHousehold({
    rules: off,
    lines: [line({ lineId: 'c', childKey: 'avery', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 24900, quantity: 4 })],
  });
  assert.equal(child(camp, 'avery').ruleId, 'gnw-all');
  assert.equal(child(camp, 'avery').multiWeekDiscountCents, 0);
  assert.equal(HD.pickRule(off, 'goninjaW', 'summer_camp')?.id, 'gnw-all');
  assert.equal(HD.pickRule(rules(), 'goninjaW', 'summer_camp')?.id, 'gnw-summer-camp');
});

test('amount discounts are capped and a zero price stays zero', () => {
  const amount = HD.cleanRule({
    id: 'amt',
    locationId: 'goninjaV',
    program: 'pno',
    active: true,
    mode: 'stackable',
    secondChild: { kind: 'amount', percentOff: null, amountOffCents: 5000 },
    thirdPlus: { kind: 'amount', percentOff: null, amountOffCents: 8000 },
    multiWeek: null,
  });
  const quote = HD.quoteHousehold({
    rules: [amount],
    lines: [
      line({ lineId: 'a', childKey: 'avery', program: 'pno', locationId: 'goninjaV', unitPriceCents: 3500 }),
      line({ lineId: 'b', childKey: 'jordan', program: 'pno', locationId: 'goninjaV', unitPriceCents: 3500 }),
      line({ lineId: 'c', childKey: 'casey', program: 'pno', locationId: 'goninjaV', unitPriceCents: 0 }),
    ],
  });
  assert.equal(child(quote, 'jordan').dueCents, 0);
  assert.equal(child(quote, 'jordan').discountCents, 3500);
  assert.equal(child(quote, 'casey').dueCents, 0);
});

test('stackable discounts never exceed the list price', () => {
  const rule = HD.cleanRule({
    id: 'cap',
    locationId: 'goninjaW',
    program: 'summer_camp',
    active: true,
    mode: 'stackable',
    secondChild: { kind: 'percent', percentOff: 90, amountOffCents: null },
    thirdPlus: { kind: 'percent', percentOff: 90, amountOffCents: null },
    multiWeek: { minWeeks: 2, discount: { kind: 'percent', percentOff: 20, amountOffCents: null } },
  });
  const quote = HD.quoteHousehold({
    rules: [rule],
    lines: [line({ lineId: 'b', childKey: 'jordan', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 10000, quantity: 2 })],
    enrolled: [{ childKey: 'avery', program: 'summer_camp', locationId: 'goninjaW' }],
  });
  assert.equal(child(quote, 'jordan').discountCents, 20000);
  assert.equal(child(quote, 'jordan').dueCents, 0);
});

test('an already enrolled line holds rank and is not charged again', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: [
      line({ lineId: 'old', childKey: 'avery', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 18900, alreadyEnrolled: true }),
      line({ lineId: 'new', childKey: 'jordan', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 18900 }),
    ],
  });
  assert.equal(quote.listCents, 18900);
  assert.equal(child(quote, 'jordan').rank, 2);
  assert.equal(quote.lines.find(row => row.lineId === 'old')?.dueCents, 0);
  assert.equal(quote.dueCents, 17010);
});

test('half days and full days count as weeks for the bundle', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: [
      line({ lineId: 'h', childKey: 'avery', program: 'summer_camp', locationId: 'goninjaV', unitPriceCents: 14900 }),
      line({ lineId: 'f1', childKey: 'avery', program: 'summer_camp', locationId: 'goninjaV', unitPriceCents: 24900 }),
      line({ lineId: 'f2', childKey: 'avery', program: 'summer_camp', locationId: 'goninjaV', unitPriceCents: 24900 }),
    ],
  });
  assert.equal(child(quote, 'avery').weekCount, 3);
  assert.equal(child(quote, 'avery').listCents, 14900 + 24900 + 24900);
  assert.equal(child(quote, 'avery').multiWeekDiscountCents, Math.round((14900 + 24900 + 24900) * 5 / 100));
});

test('parents night out uses the household rule', () => {
  const quote = HD.quoteHousehold({
    rules: rules(),
    lines: [
      line({ lineId: 'a', childKey: 'avery', program: 'pno', locationId: 'goninjaV', unitPriceCents: 3500 }),
      line({ lineId: 'b', childKey: 'jordan', program: 'pno', locationId: 'goninjaV', unitPriceCents: 3500 }),
    ],
  });
  assert.equal(child(quote, 'jordan').ruleId, 'gnv-pno');
  assert.equal(child(quote, 'jordan').dueCents, 3150);
});

test('bad money, duplicate lines, and phone links are refused', () => {
  assert.throws(() => HD.quoteHousehold({
    rules: rules(),
    lines: [line({ lineId: 'a', childKey: 'avery', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 10.5 as unknown as number })],
  }), /unitPriceCents/);
  assert.throws(() => HD.quoteHousehold({
    rules: rules(),
    lines: [
      line({ lineId: 'a', childKey: 'avery', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 100 }),
      line({ lineId: 'a', childKey: 'jordan', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 100 }),
    ],
  }), /unique/);
  assert.throws(() => HD.quoteHousehold({
    rules: rules(),
    lines: [line({ lineId: 'a', childKey: 'avery', program: 'ninja_8wk', locationId: 'goninjaW', unitPriceCents: 100, label: 'tel:example' })],
  }), /phone link/);
  assert.throws(() => HD.cleanRule({
    id: 'bad',
    locationId: 'goninjaW',
    program: 'all',
    active: true,
    mode: 'stackable',
    secondChild: { kind: 'percent', percentOff: 110, amountOffCents: null },
    thirdPlus: { kind: 'percent', percentOff: 20, amountOffCents: null },
    multiWeek: null,
  }), /percent/);
});

test('a database row and stored rules round-trip', () => {
  const rule = HD.ruleFromRow({
    id: 'gnw-summer-camp',
    location_id: 'goninjaW',
    program: 'summer_camp',
    active: true,
    mode: 'stackable',
    second_kind: 'percent',
    second_percent: '10.00',
    second_amount_cents: null,
    third_kind: 'percent',
    third_percent: '20.00',
    third_amount_cents: null,
    multi_week_min: 3,
    multi_week_kind: 'percent',
    multi_week_percent: '5.00',
    multi_week_amount_cents: null,
  });
  assert.equal(rule.secondChild.percentOff, 10);
  assert.equal(rule.multiWeek?.minWeeks, 3);
  assert.equal(rule.multiWeek?.discount.percentOff, 5);
  const stored = HD.rulesFromStorage(JSON.stringify(HD.defaultRules()));
  assert.equal(stored?.length, 10);
  assert.equal(HD.rulesFromStorage('not-json'), null);
  assert.equal(HD.STORAGE_KEY, 'lvlupGnHouseholdRulesV1');
});

test('default rules cover both Go Ninja schools', () => {
  const list = rules();
  assert.equal(list.length, 10);
  for (const loc of ['goninjaW', 'goninjaV']) {
    for (const program of ['all', 'ninja_8wk', 'summer_camp', 'afterschool', 'pno']) {
      const rule = list.find(row => row.locationId === loc && row.program === program);
      assert.ok(rule, loc + ' ' + program);
      assert.equal(rule.secondChild.percentOff, 10);
      assert.equal(rule.thirdPlus.percentOff, 20);
      assert.equal(rule.mode, 'stackable');
    }
  }
  const camp = list.find(row => row.id === 'gnv-summer-camp');
  assert.equal(camp?.multiWeek?.minWeeks, 3);
  assert.equal(camp?.multiWeek?.discount.percentOff, 5);
  assert.match(HD.describeRule(camp!), /2nd child 10% off/);
  assert.match(HD.describeRule(camp!), /3 or more camp weeks save 5% off/);
  assert.equal(HD.describeRule(camp!).includes('tel:'), false);
});

test('the same cart quotes the same way twice', () => {
  const input = {
    rules: rules(),
    lines: [
      line({ lineId: 'a', childKey: 'avery', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 24900, quantity: 3 }),
      line({ lineId: 'b', childKey: 'jordan', program: 'summer_camp', locationId: 'goninjaW', unitPriceCents: 14900 }),
    ],
  };
  assert.deepEqual(HD.quoteHousehold(input), HD.quoteHousehold(input));
});

test('household migration enables RLS and seeds both schools', () => {
  const sql = readFileSync(join(root, '../supabase/migrations/018_goninja_household_discounts.sql'), 'utf8');
  const ordered = readFileSync(join(root, '../supabase/migrations/20261127000019_goninja_household_discounts.sql'), 'utf8');
  const local = readFileSync(join(root, '../migrations/019_goninja_household_discounts.sql'), 'utf8');
  assert.equal(ordered, sql);
  assert.equal(local, sql);
  assert.match(sql, /create table if not exists household_discount_rules/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /goninjaW/);
  assert.match(sql, /goninjaV/);
  assert.match(sql, /ninja_8wk/);
  assert.match(sql, /summer_camp/);
  assert.match(sql, /afterschool/);
  assert.match(sql, /'pno'/);
  assert.match(sql, /on conflict \(id\) do nothing/i);
  assert.equal(sql.includes('tel:'), false);
  assert.equal(sql.includes('sms:'), false);
  assert.equal(sql.includes('proshop_on'), false);
  assert.equal(sql.includes('belt_test_fee'), false);
  assert.equal(sql.includes('family_discount_rules'), true);
});

test('Go Ninja preview files stay free of phone links', () => {
  const files = [
    '../preview/goninja.html',
    '../ui/goninja.js',
    '../ui/goninja.css',
    '../ui/household-panel.js',
  ];
  files.forEach(file => {
    const text = readFileSync(join(root, file), 'utf8');
    assert.equal(text.includes('tel:'), false, file);
    assert.equal(text.includes('sms:'), false, file);
    assert.equal(/\b\d{3}[-.)]\s*\d{3}[-.]\d{4}\b/.test(text), false, file);
  });
  const page = readFileSync(join(root, '../ui/goninja.js'), 'utf8');
  assert.match(page, /quoteHousehold/);
  assert.match(page, /academy/);
  assert.match(page, /camp/);
  assert.match(page, /afterschool/);
  const staff = readFileSync(join(root, '../ui/staff.js'), 'utf8');
  assert.match(staff, /CrmHousehold/);
  assert.match(staff, /feePanel/);
  const panel = readFileSync(join(root, '../ui/household-panel.js'), 'utf8');
  assert.match(panel, /Household & Sibling Discounts|Household &amp; Sibling Discounts/);
});
