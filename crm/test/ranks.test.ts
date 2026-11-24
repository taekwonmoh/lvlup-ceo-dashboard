import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeCycle } from '../src/cycles.ts';
import { curriculumForRank, lessonsFor, vimeoPlayerUrl } from '../src/curriculum.ts';
import { homeSummary, previewPaymentRetry } from '../src/home.ts';
import {
  ADP_ALIASES, ALIASES, COLOR_BELT_STRIPES, DEGREE_REQUIREMENTS, RANKS,
  countByProgram, degreeRequirementFor, programByCode, ranksForProgram, resolveRank, sessionsFor,
} from '../src/ranks.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CORE = [
  'White', 'Orange', 'Yellow',
  'Camo - Recommended', 'Camo - Decided',
  'Green - Recommended', 'Green - Decided',
  'Purple - Recommended', 'Purple - Decided',
  'Blue - Recommended', 'Blue - Decided',
  'Brown - Recommended', 'Brown - Decided',
  'Red - Recommended', 'Red - Decided',
  'Red / Black',
  '1st Degree Black Belt', '2nd Degree Black Belt', '3rd Degree Black Belt',
  '4th Degree Black Belt', '5th Degree Black Belt',
];

const JUNIOR = [
  'White', 'Ara the Turtle', 'Orange', 'Baeoh the Tiger', 'Yellow', 'Cheeri the Cheetah',
  'Camo', 'Raon the Lion', 'Green', 'Suri the Eagle', 'Purple', 'Choa the Phoenix',
  'Blue', 'Mir the Dragon', 'Brown', 'Narsha the Snake', 'Red', 'Baron the Panther',
];

test('every ladder is seeded with GymDesk aliases', async () => {
  const counts = countByProgram();
  assert.equal(counts.mini_tiger, 18);
  assert.equal(counts.tiger, 18);
  assert.equal(counts.songahm, 25);
  assert.equal(counts.legacy, 9);
  assert.equal(counts.ata_instructor, 4);
  assert.equal(counts.goninja, 8);
  assert.equal(counts.mpk, 21);
  assert.equal(RANKS.length, 103);

  const songahm = ranksForProgram('songahm');
  assert.deepEqual(songahm.slice(0, 21).map(rank => rank.name), CORE);
  assert.deepEqual(songahm.slice(21).map(rank => rank.name), [
    '6th Degree Black Belt', '7th Degree Black Belt', '8th Degree Black Belt', '9th Degree Black Belt',
  ]);
  assert.deepEqual(ranksForProgram('mini_tiger').map(rank => rank.name), JUNIOR);
  assert.deepEqual(ranksForProgram('tiger').map(rank => rank.name), JUNIOR);
  assert.deepEqual(ranksForProgram('goninja').map(rank => rank.name), [
    'Recruit', 'Rookie', 'Ranger', 'Raider', 'Rover', 'Rebel', 'Ronin', 'Completed',
  ]);
  assert.equal(ranksForProgram('legacy')[0].name, 'Level 1 - Connector');
  assert.equal(ranksForProgram('legacy')[8].name, 'Level 9 - Class Commander');
  assert.deepEqual(ranksForProgram('ata_instructor').map(rank => [rank.name, rank.minAge]), [
    ['Red Collar', 10], ['Red/Black Collar', 14], ['Black/Red/Black Collar', 16], ['Black Collar', 18],
  ]);
  assert.equal(ranksForProgram('mpk')[14].name, 'Black Black Stripe');

  for (const step of JUNIOR) {
    const belt = 'Tiger ' + step.split(' ')[0] + ' Belt';
    assert.equal(resolveRank('mini_tiger', step)?.rank?.canonicalId, resolveRank('mini_tiger', belt)?.rank?.canonicalId);
    assert.equal(resolveRank('tiger', step)?.rank?.canonicalId, resolveRank('tiger', belt)?.rank?.canonicalId);
    assert.notEqual(resolveRank('mini_tiger', step)?.rank?.canonicalId, resolveRank('tiger', step)?.rank?.canonicalId);
  }
  assert.equal(resolveRank('songahm', 'Tiger White Belt'), null);
  assert.equal(resolveRank('songahm', 'Camo - Recommended')?.rank?.canonicalId, 'songahm.camo_recommended');
  assert.equal(resolveRank('songahm', 'Camo')?.rank?.canonicalId, 'songahm.camo_decided');
  assert.equal(resolveRank('songahm', 'Red/Black')?.rank?.canonicalId, 'songahm.red_black');
  assert.equal(resolveRank('songahm', '1st Degree Black')?.rank?.name, '1st Degree Black Belt');
  assert.equal(ADP_ALIASES.length, 21);
  for (const row of ADP_ALIASES) {
    assert.equal(resolveRank('adp', row.alias)?.rank?.canonicalId, row.canonicalId);
    const onSongahm = resolveRank('songahm', row.alias);
    if (row.alias.includes('Grade') || row.alias.endsWith(' - R') || row.alias.endsWith(' - D')) {
      assert.equal(onSongahm, null);
    } else {
      assert.equal(onSongahm?.rank?.canonicalId, row.canonicalId);
    }
  }
  assert.equal(resolveRank('fitboxing', '')?.rank, null);
  assert.equal(resolveRank('competition', 'White'), null);
  assert.equal(resolveRank('events_camps', '')?.curriculumLevel, null);
  assert.equal(resolveRank('tiger_leaders', '')?.rank, null);
  assert.equal(resolveRank('birthday_parties', '')?.rank, null);
  assert.equal(resolveRank('summer_camp', '')?.rank, null);
  assert.equal(programByCode('trials')?.ranked, false);

  const sql = await readFile(join(root, 'migrations/005_ranks_curriculum.sql'), 'utf8');
  assert.match(sql, /DO NOT APPLY/);
  assert.match(sql, /xxyndswrierztzdbjvrd/);
  for (const rank of RANKS) assert.ok(sql.includes(rank.canonicalId), rank.canonicalId);
  for (const row of ALIASES) assert.ok(sql.includes(row.alias), row.alias);
});

test('program and rank pick one curriculum level and the active cycle', () => {
  const asOf = '2026-11-24';
  const mini = curriculumForRank({ program: 'mini_tiger', rank: 'Orange', asOf });
  const tiger = curriculumForRank({ program: 'tiger', rank: 'White', asOf });
  const color = curriculumForRank({ program: 'songahm', rank: 'Yellow', asOf });
  const camo = curriculumForRank({ program: 'songahm', rank: 'Camo - Decided', asOf });
  const green = curriculumForRank({ program: 'songahm', rank: 'Green - Recommended', asOf });
  const brown = curriculumForRank({ program: 'songahm', rank: 'Brown - Decided', asOf });
  const redBlack = curriculumForRank({ program: 'songahm', rank: 'Red / Black', asOf, locationId: 'waunakee' });
  const black = curriculumForRank({ program: 'songahm', rank: '2nd Degree Black Belt', asOf, locationId: 'verona' });
  const gn = curriculumForRank({ program: 'goninja', rank: 'Ranger', asOf });
  assert.equal(mini?.curriculumLevel, 'mini_tigers');
  assert.equal(tiger?.curriculumLevel, 'tigers');
  assert.equal(color?.curriculumLevel, 'beginners');
  assert.equal(camo?.curriculumLevel, 'beginners');
  assert.equal(green?.curriculumLevel, 'intermediate');
  assert.equal(brown?.curriculumLevel, 'advanced');
  assert.equal(redBlack?.curriculumLevel, 'black_belt');
  assert.equal(black?.curriculumLevel, 'black_belt');
  assert.equal(gn?.curriculumLevel, 'go_ninja');
  assert.notEqual(mini?.rank.canonicalId, tiger?.rank.canonicalId);
  assert.notEqual(tiger?.rank.canonicalId, color?.rank.canonicalId);

  const cycle = activeCycle(asOf);
  assert.equal(cycle.cycleNo, 6);
  assert.equal(cycle.theme, 'Honesty');
  assert.equal(cycle.week, 6);
  assert.equal(cycle.testOn, '2026-12-12');
  assert.equal(cycle.daysUntilTest, 18);
  assert.equal(mini?.cycle.theme, 'Honesty');
  assert.equal(mini?.sections[0].sample, true);
  assert.equal(tiger?.sections[0].sample, false);
  assert.ok(tiger?.sections[0].lessons.some(lesson => lesson.category === 'form'));
  assert.ok(color?.sections[0].lessons.some(lesson => lesson.category === 'weapon'));
  assert.ok(color?.sections[0].lessons.some(lesson => lesson.category === 'one_step'));
  assert.ok(color?.sections[0].lessons.some(lesson => lesson.category === 'sparring'));
  assert.ok(color?.sections[0].lessons.some(lesson => lesson.category === 'board_break'));
  assert.equal(redBlack?.sessionsRequired, 36);
  assert.equal(sessionsFor(redBlack!.rank, 'eastmad'), 12);
  assert.equal(black?.sessionsRequired, 104);
  assert.equal(mini?.sessionsRequired, 6);
  assert.equal(tiger?.sessionsRequired, 12);
  assert.deepEqual(COLOR_BELT_STRIPES.map(step => [step.name, step.credits, step.optional]), [
    ['White', 4, false], ['Blue', 8, false], ['Red', 12, false],
    ['Gold', null, true], ['Silver', null, true], ['Green', null, true],
  ]);
  assert.equal(COLOR_BELT_STRIPES.find(step => step.name === 'Green')?.meaning, 'Set to Test');
  assert.equal(redBlack?.stripeSteps.length, 4);
  assert.equal(degreeRequirementFor('songahm.red_black')?.passScore, '7/10');
  assert.equal(degreeRequirementFor('songahm.bb1')?.minYears, 1);
  assert.equal(degreeRequirementFor('songahm.bb3')?.teamGate, 'Athlete Development or Legacy');
  assert.equal(degreeRequirementFor('songahm.bb4')?.notes, 'Set with the instructor. No coded requirements.');
  assert.equal(DEGREE_REQUIREMENTS.length, 5);
  assert.equal(degreeRequirementFor('songahm.bb5'), null);

  const withLegacy = curriculumForRank({
    program: 'songahm', rank: 'Green - Decided', asOf, overlays: ['legacy', 'competition', 'xma'],
  });
  assert.deepEqual(withLegacy?.sections.map(section => section.level), ['intermediate', 'legacy', 'advanced', 'advanced']);
  assert.equal(withLegacy?.sections[1].overlay, true);

  const url = vimeoPlayerUrl('12345', 'abc');
  assert.match(url, /texttrack=false/);
  assert.match(url, /player\.vimeo\.com\/video\/12345/);
  for (const level of ['mini_tigers', 'tigers', 'beginners', 'intermediate', 'advanced', 'black_belt'] as const) {
    for (const lesson of lessonsFor(level, 6, 'Honesty')) {
      const player = lesson.vimeoId ? vimeoPlayerUrl(lesson.vimeoId) : null;
      if (player) assert.match(player, /texttrack=false/);
    }
  }
});

test('home summary rolls up LVLUP, Go Ninja, and all schools', () => {
  const wau = homeSummary('waunakee');
  assert.equal(wau.brand, 'lvlup');
  assert.equal(wau.members.active, 140);
  assert.equal(wau.members.netChange, 4);
  assert.equal(wau.members.attritionPct, 2.1);
  assert.equal(wau.members.attritionOnTrack, true);
  assert.equal(wau.payments.overdueCents, 45000);
  assert.equal(wau.payments.armCents, 20000);
  assert.equal(wau.funnel.day1ClosePct, 50);
  assert.equal(wau.goninja, null);
  assert.equal(wau.cycle.week, 6);

  const forest = homeSummary('deforest');
  assert.equal(forest.members.attritionOnTrack, false);
  assert.equal(forest.members.attritionPct, 5.7);

  const lvlup = homeSummary('lvlup');
  assert.equal(lvlup.members.active, 410);
  assert.equal(lvlup.members.lost, 12);
  assert.equal(lvlup.members.attritionOnTrack, true);
  assert.equal(lvlup.goninja, null);
  assert.equal(lvlup.holds.pendingTotal, 5);
  assert.equal(lvlup.queues.overdue.length, 2);

  const gn = homeSummary('goninja');
  assert.equal(gn.brand, 'goninja');
  assert.equal(gn.goninja?.academyStudents, 84);
  assert.equal(gn.goninja?.partiesBooked, 9);
  assert.equal(gn.goninja?.afterSchoolFillPct, 90.9);
  assert.equal(gn.goninja?.ninjaClassFillPct, 78.4);
  assert.equal(gn.payments.collectedCents, 720000);

  const veronaOnly = homeSummary('goninjaV');
  assert.equal(veronaOnly.goninja?.afterSchoolFillPct, null);
  assert.equal(veronaOnly.goninja?.partiesBooked, 3);
  const wauNinja = homeSummary('goninjaW');
  assert.equal(wauNinja.goninja?.afterSchoolFillPct, 90.9);

  const all = homeSummary('all');
  assert.equal(all.brand, 'all');
  assert.equal(all.members.active, 494);
  assert.equal(all.schools.length, 6);
  assert.equal(all.goninja?.academyStudents, 84);
  assert.equal(all.attendance.checkinsToday, 18 + 11 + 13 + 8 + 7 + 5);
  assert.equal(all.queues.promotions.some(row => row.id === 'skyler'), true);

  const retry = previewPaymentRetry('inv_casey');
  assert.equal(retry.submitted, false);
  assert.equal(retry.sandbox, true);
  assert.match(retry.message, /No charge was sent/);
  assert.throws(() => homeSummary('eastmadison'), /Unknown scope/);
});

test('the preview opens on Home and can jump from a rank to curriculum', async () => {
  const html = await readFile(join(root, '..', 'index.html'), 'utf8');
  assert.match(html, /state\.crmTab = tabMatch \? tabMatch\[1\] : 'home'/);
  assert.match(html, /function crmOpenCurriculum/);
  assert.match(html, /Mini Tigers/);
  assert.match(html, /Ara the Turtle/);
  assert.match(html, /Red \/ Black/);
  assert.match(html, /texttrack=false/);
  assert.match(html, /Launch check-in/);
});
