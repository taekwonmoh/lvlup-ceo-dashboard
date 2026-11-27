/* Growth desk: fee pass-through, pipeline, lists, reviews, and owner questions.
   Sample families only. Sends and charges stay off. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrmGrowth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var SCHOOLS = {
    waunakee: 'LVLUP Waunakee', verona: 'LVLUP Verona', eastmad: 'LVLUP East Madison',
    deforest: 'LVLUP DeForest', goninjaW: 'Go Ninja Waunakee', goninjaV: 'Go Ninja Verona',
  };
  var PULSE = [
    { id: 'waunakee', drafts: 800000, shown: 6, closes: 3 },
    { id: 'verona', drafts: 600000, shown: 5, closes: 2 },
    { id: 'eastmad', drafts: 500000, shown: 4, closes: 2 },
    { id: 'deforest', drafts: 300000, shown: 2, closes: 1 },
    { id: 'goninjaW', drafts: 80000, shown: 3, closes: 2 },
    { id: 'goninjaV', drafts: 70000, shown: 2, closes: 1 },
  ];
  var DEFAULTS = { cardBps: 290, cardFixedCents: 30, achMode: 'percent', achBps: 80, achFlatCents: 0, tuition: true, events: false, parties: false };
  var STAGES = [
    { id: 'new', title: 'New Lead' },
    { id: 'booked', title: 'Trial Booked' },
    { id: 'showed', title: 'Showed' },
    { id: 'noshow', title: 'No-Show' },
    { id: 'enrolled', title: 'Enrolled' },
  ];
  var PIPELINE = [
    { id: 'casey', first: 'Casey', last: 'Sample', school: 'waunakee', source: 'Website', stage: 'new', since: '2026-11-25', program: 'Taekwondo' },
    { id: 'indigo', first: 'Indigo', last: 'Sample', school: 'verona', source: 'Facebook', stage: 'new', since: '2026-11-16', program: 'Taekwondo' },
    { id: 'sage', first: 'Sage', last: 'Sample', school: 'eastmad', source: 'Google', stage: 'booked', since: '2026-11-26', program: 'Taekwondo' },
    { id: 'logan', first: 'Logan', last: 'Sample', school: 'deforest', source: 'Walk-in', stage: 'showed', since: '2026-11-22', program: 'Taekwondo' },
    { id: 'skyler', first: 'Skyler', last: 'Sample', school: 'goninjaV', source: 'Website', stage: 'noshow', since: '2026-11-12', program: 'Go Ninja' },
    { id: 'perry', first: 'Perry', last: 'Sample', school: 'goninjaW', source: 'Referral', stage: 'enrolled', since: '2026-11-20', program: 'Go Ninja' },
  ];
  var ROSTER = [
    { id: 'riley', first: 'Riley', last: 'Sample', role: 'student', school: 'waunakee', program: 'Taekwondo', rank: 'Yellow', source: 'Referral', tag: 'Active', streak: 'active', birthday: '11-30' },
    { id: 'morgan', first: 'Morgan', last: 'Sample', role: 'student', school: 'waunakee', program: 'Taekwondo', rank: 'Yellow', source: 'Website', tag: 'Active', streak: 'active', birthday: '03-02' },
    { id: 'rowan', first: 'Rowan', last: 'Sample', role: 'student', school: 'waunakee', program: 'Taekwondo', rank: 'Camo', source: 'Walk-in', tag: 'Active', streak: 'miss14', birthday: '12-09' },
    { id: 'harper', first: 'Harper', last: 'Sample', role: 'student', school: 'eastmad', program: 'Taekwondo', rank: 'Green', source: 'Google', tag: 'Active', streak: 'active', birthday: '12-06' },
    { id: 'finley', first: 'Finley', last: 'Sample', role: 'student', school: 'eastmad', program: 'Taekwondo', rank: 'White', source: 'Facebook', tag: 'Active', streak: 'miss14', birthday: '01-14' },
    { id: 'blake', first: 'Blake', last: 'Sample', role: 'student', school: 'verona', program: 'Taekwondo', rank: 'Red', source: 'Website', tag: 'Active', streak: 'active', birthday: '07-04' },
    { id: 'quinn', first: 'Quinn', last: 'Sample', role: 'student', school: 'deforest', program: 'Taekwondo', rank: 'Green', source: 'Referral', tag: 'Active', streak: 'miss14', birthday: '12-11' },
    { id: 'avery', first: 'Avery', last: 'Sample', role: 'student', school: 'goninjaW', program: 'Go Ninja', rank: 'White', source: 'Website', tag: 'Active', streak: 'miss14', birthday: '12-04' },
    { id: 'robin', first: 'Robin', last: 'Sample', role: 'student', school: 'goninjaW', program: 'Go Ninja', rank: 'Yellow', source: 'Walk-in', tag: 'Active', streak: 'active', birthday: '05-20' },
    { id: 'taylor', first: 'Taylor', last: 'Sample', role: 'student', school: 'goninjaV', program: 'Go Ninja', rank: 'Orange', source: 'Google', tag: 'Active', streak: 'active', birthday: '08-18' },
    { id: 'casey', first: 'Casey', last: 'Sample', role: 'lead', school: 'waunakee', program: 'Taekwondo', rank: 'New', source: 'Website', tag: 'Trial', streak: 'active', birthday: '04-04' },
    { id: 'indigo', first: 'Indigo', last: 'Sample', role: 'lead', school: 'verona', program: 'Taekwondo', rank: 'New', source: 'Facebook', tag: 'Trial', streak: 'active', birthday: '09-09' },
    { id: 'skyler', first: 'Skyler', last: 'Sample', role: 'lead', school: 'goninjaV', program: 'Go Ninja', rank: 'New', source: 'Website', tag: 'No-show', streak: 'miss14', birthday: '06-06' },
  ];
  var LISTS = [
    { id: 'yellow-lvlup', name: 'Yellow belts', filters: { role: 'student', rank: 'Yellow', program: 'Taekwondo' } },
    { id: 'miss-14', name: 'Missed 14 days', filters: { role: 'student', streak: 'miss14' } },
    { id: 'web-trials', name: 'Website trials', filters: { role: 'lead', source: 'Website' } },
  ];
  var REVIEWS = [
    { id: 'rev-harper', personId: 'harper', name: 'Harper Sample', schoolName: 'LVLUP East Madison', ruleLabel: '30 days enrolled', status: 'pending' },
    { id: 'rev-morgan', personId: 'morgan', name: 'Morgan Sample', schoolName: 'LVLUP Waunakee', ruleLabel: 'First belt test', status: 'asked' },
    { id: 'rev-avery', personId: 'avery', name: 'Avery Sample', schoolName: 'Go Ninja Waunakee', ruleLabel: 'Birthday party', status: 'posted' },
  ];
  var REFERRALS = [
    { id: 'ref-jordan', referrer: 'Jordan Sample', friend: 'Riley Sample', schoolName: 'LVLUP Waunakee', perk: 'Buddy pass', status: 'earned' },
    { id: 'ref-harper', referrer: 'Harper Sample', friend: 'Finley Sample', schoolName: 'LVLUP East Madison', perk: 'Class credit', status: 'used' },
    { id: 'ref-robin', referrer: 'Robin Sample', friend: 'Perry Sample', schoolName: 'Go Ninja Waunakee', perk: 'Buddy pass', status: 'earned' },
  ];

  function daysBetween(from, to) {
    return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
  }

  function feeGroup(categoryId) {
    if (categoryId === 'tuition' || categoryId === 'gn_classes' || categoryId === 'gn_after_school' || categoryId === 'private_lessons') return 'tuition';
    if (categoryId === 'retail' || categoryId === 'gn_retail') return 'proshop';
    if (categoryId === 'events' || categoryId === 'gn_events' || categoryId === 'tournaments' || categoryId === 'gn_summer_camp') return 'events';
    if (categoryId === 'lvlup_parties' || categoryId === 'gn_parties') return 'parties';
    if (categoryId === 'belt_test') return 'belt_test';
    return 'other';
  }

  function policyFeeCents(line, schedule) {
    var captured = Math.max(0, line.grossCents - (line.creditCents || 0));
    if (captured <= 0) return 0;
    var group = feeGroup(line.categoryId);
    if (group === 'proshop' || group === 'belt_test' || group === 'other') return 0;
    var method = line.method === 'ach' ? 'ach' : line.method === 'card' ? 'card' : 'other';
    if (method === 'other') return 0;
    var on = group === 'tuition' ? schedule.tuition : group === 'events' ? schedule.events : schedule.parties;
    if (!on) return 0;
    if (method === 'ach') return schedule.achMode === 'flat' ? schedule.achFlatCents : Math.round(captured * schedule.achBps / 10000);
    return Math.round(captured * schedule.cardBps / 10000) + schedule.cardFixedCents;
  }

  function bag(store) {
    if (!store.growth || typeof store.growth !== 'object') {
      store.growth = { schedule: null, passExport: true, moves: {}, reviewStatus: {}, chat: false, answer: null, view: 'pipeline', listId: 'yellow-lvlup' };
    }
    var g = store.growth;
    g.moves = g.moves || {};
    g.reviewStatus = g.reviewStatus || {};
    if (g.passExport == null) g.passExport = true;
    if (!g.view) g.view = 'pipeline';
    if (!g.listId) g.listId = 'yellow-lvlup';
    return g;
  }

  function scheduleOf(store) {
    var saved = bag(store).schedule;
    var schedule = Object.assign({}, DEFAULTS, saved || {});
    schedule.tuition = schedule.tuition !== false;
    schedule.events = schedule.events === true;
    schedule.parties = schedule.parties === true;
    schedule.achMode = schedule.achMode === 'flat' ? 'flat' : 'percent';
    return schedule;
  }

  function exportSchedule(store) {
    if (bag(store).passExport === false) return undefined;
    return scheduleOf(store);
  }

  function dollars(cents) {
    var sign = cents < 0 ? '-' : '';
    var abs = Math.abs(cents);
    return sign + '$' + (abs / 100).toFixed(2);
  }

  function feePreview(schedule) {
    return {
      cardTuitionFeeCents: policyFeeCents({ categoryId: 'tuition', grossCents: 20900, method: 'card' }, schedule),
      achTuitionFeeCents: policyFeeCents({ categoryId: 'tuition', grossCents: 20900, method: 'ach' }, schedule),
      cardShopFeeCents: policyFeeCents({ categoryId: 'retail', grossCents: 4500, method: 'card' }, schedule),
      cardPartyFeeCents: policyFeeCents({ categoryId: 'lvlup_parties', grossCents: 21900, method: 'card' }, schedule),
      beltTestPassedCents: policyFeeCents({ categoryId: 'belt_test', grossCents: 0, method: 'card' }, schedule),
    };
  }

  function cards(store, asOf) {
    var moves = bag(store).moves;
    return PIPELINE.map(function (card) {
      var move = moves[card.id];
      var stage = move ? move.stage : card.stage;
      var since = move ? move.since : card.since;
      var days = Math.max(0, daysBetween(since, asOf));
      return Object.assign({}, card, { stage: stage, since: since, daysInStage: days, stalled: stage !== 'enrolled' && days >= 7, schoolName: SCHOOLS[card.school] });
    });
  }

  function matchList(filters) {
    return ROSTER.filter(function (person) {
      if (filters.role && filters.role !== 'any' && person.role !== filters.role) return false;
      if (filters.rank && person.rank !== filters.rank) return false;
      if (filters.program && person.program !== filters.program) return false;
      if (filters.school && person.school !== filters.school) return false;
      if (filters.source && person.source !== filters.source) return false;
      if (filters.tag && person.tag !== filters.tag) return false;
      if (filters.streak && filters.streak !== 'any' && person.streak !== filters.streak) return false;
      return true;
    });
  }

  function birthdays(asOf) {
    var start = Date.parse(asOf + 'T00:00:00Z');
    var year = Number(asOf.slice(0, 4));
    return ROSTER.filter(function (person) { return person.role === 'student'; }).map(function (person) {
      var parts = person.birthday.split('-');
      var when = Date.UTC(year, Number(parts[0]) - 1, Number(parts[1]));
      if (when < start) when = Date.UTC(year + 1, Number(parts[0]) - 1, Number(parts[1]));
      var days = Math.round((when - start) / 86400000);
      return { id: person.id, name: person.first + ' ' + person.last, days: days, on: new Date(when).toISOString().slice(0, 10), program: person.program };
    }).filter(function (row) { return row.days >= 0 && row.days <= 14; }).sort(function (a, b) { return a.days - b.days; });
  }

  function answerQuestion(question, asOf) {
    var q = String(question || '').toLowerCase();
    if (/risk|quit|miss/.test(q)) {
      var rows = ROSTER.filter(function (person) { return person.streak === 'miss14' && person.role === 'student'; });
      return { title: 'Students at risk of quitting', detail: 'Attendance dropped off the sample roster.', rows: rows.map(function (person) { return person.first + ' ' + person.last + ' · ' + SCHOOLS[person.school]; }) };
    }
    if (/revenue|next month|project/.test(q)) {
      return { title: 'Projected revenue next month', detail: 'Sandbox scheduled drafts. This is not a GymDesk total.', rows: PULSE.map(function (row) { return SCHOOLS[row.id] + ' · drafts ' + dollars(row.drafts).replace(/\.00$/, ''); }) };
    }
    if (/trial|conversion|best school/.test(q)) {
      var ranked = PULSE.map(function (row) {
        return { name: SCHOOLS[row.id], pct: row.shown ? Math.round((row.closes / row.shown) * 100) : 0 };
      }).sort(function (a, b) { return b.pct - a.pct; });
      return { title: 'Best trial conversion', detail: ranked[0].name + ' closes ' + ranked[0].pct + '% of trials that show.', rows: ranked.map(function (row) { return row.name + ' · ' + row.pct + '%'; }) };
    }
    if (/birthday/.test(q)) {
      return { title: 'Birthdays in the next 14 days', detail: 'Buddy-pass drafts stay in the CRM.', rows: birthdays(asOf).map(function (row) { return row.name + ' · ' + row.on + ' · ' + row.days + ' days'; }) };
    }
    return { title: 'Pick a question', detail: 'Ask about risk, next month revenue, trial conversion, or birthdays.', rows: [] };
  }

  function post(ctx, body) {
    if (!ctx.live || !ctx.api) return Promise.resolve({ demo: true });
    body.asOf = ctx.asOf;
    return ctx.api('/v1/studio/growth', { method: 'POST', body: body });
  }

  function done(ctx, res, text) {
    ctx.ui.holdScroll = true;
    if (!ctx.live || !res || res.demo || res.ok) ctx.toast('ok', text);
    else ctx.toast('ok', 'Saved on this device. The sandbox did not take it. Nothing was sent.');
  }

  function feePanel(ctx) {
    var esc = ctx.esc;
    var schedule = scheduleOf(ctx.store);
    var preview = feePreview(schedule);
    var g = bag(ctx.store);
    function toggle(key, label, on, locked, note) {
      return '<div class="fee-row"><div><strong>' + esc(label) + '</strong><span class="meta">' + esc(note) + '</span></div>' +
        (locked
          ? '<span class="badge">' + esc(on ? 'On' : 'Off') + ' · locked</span>'
          : '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="fee-toggle" data-key="' + key + '">' + (on ? 'On' : 'Off') + '</button>') +
        '</div>';
    }
    return '<section class="fee-panel"><h2>Processing fee pass-through</h2>' +
      '<p class="lede">Tuition can pass the card or ACH fee. Pro Shop never does. Belt testing is included with tuition. Nothing is charged from this screen.</p>' +
      '<div class="fee-grid"><label>Card percent<input id="fee-card-pct" inputmode="decimal" value="' + esc((schedule.cardBps / 100).toFixed(1)) + '"></label>' +
      '<label>Card fixed fee<input id="fee-card-fixed" inputmode="decimal" value="' + esc((schedule.cardFixedCents / 100).toFixed(2)) + '"></label>' +
      '<label>ACH style<select id="fee-ach-mode"><option value="percent"' + (schedule.achMode === 'percent' ? ' selected' : '') + '>Percent</option><option value="flat"' + (schedule.achMode === 'flat' ? ' selected' : '') + '>Flat</option></select></label>' +
      '<label>ACH percent<input id="fee-ach-pct" inputmode="decimal" value="' + esc((schedule.achBps / 100).toFixed(1)) + '"></label>' +
      '<label>ACH flat fee<input id="fee-ach-flat" inputmode="decimal" value="' + esc((schedule.achFlatCents / 100).toFixed(2)) + '"></label></div>' +
      '<button type="button" class="big" data-act="fee-save">Save fee settings</button>' +
      '<div class="fee-matrix">' +
      toggle('tuition', 'Tuition / Memberships', schedule.tuition, false, 'Pass card and ACH fees') +
      toggle('proshop', 'Pro Shop Purchases', false, true, 'Never passed on. This stays off.') +
      toggle('events', 'Events / Clinics', schedule.events, false, 'Off until you turn it on') +
      toggle('parties', 'Birthday Parties', schedule.parties, false, 'Off until you turn it on') +
      '</div>' +
      '<p class="fee-note">Belt testing is included with tuition.</p>' +
      '<div class="fee-pair"><article class="card"><h3>Tuition · $209.00</h3><p>Card fee <strong>' + esc(dollars(preview.cardTuitionFeeCents)) + '</strong></p><p>ACH fee <strong>' + esc(dollars(preview.achTuitionFeeCents)) + '</strong></p></article>' +
      '<article class="card"><h3>Pro Shop · $45.00</h3><p>Card fee <strong>' + esc(dollars(preview.cardShopFeeCents)) + '</strong></p><p>ACH fee <strong>$0.00</strong></p><p class="meta">Party card fee ' + esc(dollars(preview.cardPartyFeeCents)) + ' when that switch is on.</p></article></div>' +
      '<button type="button" class="chip' + (g.passExport !== false ? ' on' : '') + '" data-act="fee-export">' + (g.passExport !== false ? 'QuickBooks preview uses this policy' : 'QuickBooks preview uses the old card fee') + '</button>' +
      '<p class="meta">The fee column on the export below follows this switch. Pro Shop stays $0 either way when the policy is on.</p></section>';
  }

  function askHtml(ctx) {
    var esc = ctx.esc;
    var g = bag(ctx.store);
    var answer = g.answer;
    var chips = ['Which students are at risk of quitting?', 'Projected revenue next month by school?', 'Best trial conversion school?', 'Who has a birthday next week?'];
    return '<section class="ask-bar"><h2>Ask LVLUP CRM</h2><div class="ask-row"><label class="grow">Question<input id="ask-q" placeholder="Which students are at risk of quitting?" value="' + esc(g.question || '') + '"></label>' +
      '<button type="button" class="big primary" data-act="ask-go">Ask</button></div>' +
      '<div class="chips">' + chips.map(function (text) {
        return '<button type="button" class="chip" data-act="ask-chip" data-q="' + esc(text) + '">' + esc(text) + '</button>';
      }).join('') + '</div>' +
      (answer ? '<article class="card"><h3>' + esc(answer.title) + '</h3><p>' + esc(answer.detail) + '</p>' + (answer.rows || []).map(function (row) { return '<p class="meta">' + esc(row) + '</p>'; }).join('') + '</article>' : '') +
      '</section>';
  }

  function feedHtml(ctx) {
    var esc = ctx.esc;
    var asOf = ctx.asOf;
    var risk = ROSTER.filter(function (person) { return person.streak === 'miss14' && person.role === 'student'; }).slice(0, 2);
    var stalled = cards(ctx.store, asOf).filter(function (card) { return card.stalled; }).slice(0, 1);
    var days = birthdays(asOf).slice(0, 2);
    var items = risk.map(function (person) {
      return { id: person.id, kind: 'risk', title: person.first + ' may quit', detail: 'No check-in in 14 days · ' + SCHOOLS[person.school] };
    }).concat(stalled.map(function (card) {
      return { id: card.id, kind: 'lead', title: card.first + ' has not moved', detail: card.daysInStage + ' days in stage · ' + card.schoolName };
    })).concat(days.map(function (row) {
      return { id: row.id, kind: 'birthday', title: row.name.split(' ')[0] + ' birthday in ' + row.days + ' days', detail: 'Draft a buddy pass. Nothing is sent.' };
    }));
    return '<section class="priority"><h2>Next priority</h2><div class="feed-grid">' + items.map(function (item) {
      var label = item.kind === 'birthday' ? 'Draft buddy pass' : item.kind === 'lead' ? 'Draft follow-up' : 'Draft check-in';
      return '<article class="card feed-card"><h3>' + esc(item.title) + '</h3><p class="meta">' + esc(item.detail) + '</p><button type="button" class="big primary" data-act="priority-go" data-kind="' + item.kind + '" data-id="' + esc(item.id) + '">' + label + '</button></article>';
    }).join('') + '</div></section>';
  }

  function page(ctx) {
    var esc = ctx.esc;
    var g = bag(ctx.store);
    var views = [['pipeline', 'Pipeline'], ['lists', 'Smart Lists'], ['reviews', 'Reviews'], ['revive', 'Reactivate'], ['referrals', 'Referrals']];
    var nav = '<div class="chips">' + views.map(function (view) {
      return '<button type="button" class="chip' + (g.view === view[0] ? ' on' : '') + '" data-act="growth-view" data-view="' + view[0] + '">' + esc(view[1]) + '</button>';
    }).join('') + '</div>';
    return nav + (g.view === 'lists' ? listsHtml(ctx) : g.view === 'reviews' ? reviewsHtml(ctx) : g.view === 'revive' ? reviveHtml(ctx) : g.view === 'referrals' ? referralsHtml(ctx) : pipelineHtml(ctx));
  }

  function pipelineHtml(ctx) {
    var esc = ctx.esc;
    var grouped = cards(ctx.store, ctx.asOf);
    var cols = STAGES.map(function (stage) {
      var rows = grouped.filter(function (card) { return card.stage === stage.id; });
      return '<section class="kanban-col" data-stage="' + stage.id + '"><h2>' + esc(stage.title) + '</h2><p class="meta">' + rows.length + '</p>' +
        rows.map(function (card) {
          var options = STAGES.map(function (item) {
            return '<option value="' + item.id + '"' + (item.id === card.stage ? ' selected' : '') + '>' + esc(item.title) + '</option>';
          }).join('');
          return '<article class="kanban-card" draggable="true" data-drag="' + esc(card.id) + '"><strong>' + esc(card.first + ' ' + card.last) + '</strong>' +
            '<p class="meta">' + esc(card.source + ' · ' + card.schoolName) + '</p>' +
            (card.stalled ? '<span class="badge">Stalled ' + card.daysInStage + ' days</span>' : '') +
            '<label class="meta">Move<select data-act="pipe-move" data-id="' + esc(card.id) + '">' + options + '</select></label>' +
            (card.stalled ? '<button type="button" class="big" data-act="priority-go" data-kind="lead" data-id="' + esc(card.id) + '">Draft follow-up</button>' : '') +
            '</article>';
        }).join('') + '</section>';
    }).join('');
    return '<h1>Lead pipeline</h1><p class="lede">Drag a card, or use Move. A lead sitting 7 days is flagged. Follow-ups are drafts.</p><div class="kanban">' + cols + '</div>';
  }

  function listsHtml(ctx) {
    var esc = ctx.esc;
    var g = bag(ctx.store);
    var current = LISTS.filter(function (list) { return list.id === g.listId; })[0] || LISTS[0];
    var people = matchList(current.filters);
    return '<h1>Smart lists</h1><p class="lede">These lists stay current as the sample roster changes. Bulk draft does not send.</p><div class="chips">' +
      LISTS.map(function (list) {
        return '<button type="button" class="chip' + (list.id === current.id ? ' on' : '') + '" data-act="list-open" data-id="' + esc(list.id) + '">' + esc(list.name) + '</button>';
      }).join('') + '</div>' +
      people.map(function (person) {
        return '<div class="card"><strong>' + esc(person.first + ' ' + person.last) + '</strong><p class="meta">' + esc(person.rank + ' · ' + person.program + ' · ' + SCHOOLS[person.school] + ' · ' + person.source) + '</p></div>';
      }).join('') +
      '<button type="button" class="big primary" data-act="list-draft" data-id="' + esc(current.id) + '">Draft a note to this list</button>';
  }

  function reviewsHtml(ctx) {
    var esc = ctx.esc;
    var g = bag(ctx.store);
    return '<h1>Review engine</h1><p class="lede">Invites after 30 days, a first belt test, or a birthday party. The tracker does not post or send.</p>' +
      REVIEWS.map(function (row) {
        var status = g.reviewStatus[row.id] || row.status;
        return '<article class="card"><strong>' + esc(row.name) + '</strong><p class="meta">' + esc(row.ruleLabel + ' · ' + row.schoolName) + '</p><span class="badge' + (status === 'posted' ? ' ok' : '') + '">' + esc(status) + '</span>' +
          '<button type="button" class="big" data-act="review-draft" data-id="' + esc(row.id) + '" data-person="' + esc(row.personId) + '">Draft review invite</button></article>';
      }).join('') +
      '<h2>Website trial chat</h2><p class="lede">Preview only. The assistant does not message families.</p>' +
      '<button type="button" class="chip' + (g.chat ? ' on' : '') + '" data-act="chat-toggle">' + (g.chat ? 'Chat preview on' : 'Chat preview off') + '</button>' +
      (g.chat ? '<article class="card"><p>Hi, I can book a trial at the sample studio. This preview does not message anyone.</p></article>' : '');
  }

  function reviveHtml(ctx) {
    var esc = ctx.esc;
    var cold = cards(ctx.store, ctx.asOf).filter(function (card) { return card.stage === 'noshow' || card.stalled; });
    return '<h1>Reactivate leads</h1><p class="lede">Cold and no-show leads. The note is a draft.</p>' +
      (cold.length ? cold.map(function (card) {
        return '<article class="card"><strong>' + esc(card.first + ' ' + card.last) + '</strong><p class="meta">' + esc(card.schoolName + ' · ' + card.source + ' · ' + card.daysInStage + ' days') + '</p>' +
          '<button type="button" class="big primary" data-act="revive-draft" data-id="' + esc(card.id) + '">Draft a new trial note</button></article>';
      }).join('') : '<p class="quiet">No cold leads in this sample.</p>');
  }

  function referralsHtml(ctx) {
    var esc = ctx.esc;
    var bySchool = {};
    REFERRALS.forEach(function (row) { bySchool[row.schoolName] = (bySchool[row.schoolName] || 0) + 1; });
    return '<h1>Referrals and perks</h1><p class="lede">Buddy passes and class credits for the sample families.</p>' +
      REFERRALS.map(function (row) {
        return '<article class="card"><strong>' + esc(row.referrer) + ' → ' + esc(row.friend) + '</strong><p class="meta">' + esc(row.schoolName + ' · ' + row.perk) + '</p><span class="badge' + (row.status === 'used' ? ' ok' : '') + '">' + esc(row.status) + '</span></article>';
      }).join('') +
      '<h2>By school</h2>' + Object.keys(bySchool).map(function (name) {
        return '<p class="meta">' + esc(name) + ' · ' + bySchool[name] + '</p>';
      }).join('');
  }

  function readSchedule(ctx) {
    var pct = Number((document.getElementById('fee-card-pct') || {}).value);
    var fixed = Number((document.getElementById('fee-card-fixed') || {}).value);
    var achPct = Number((document.getElementById('fee-ach-pct') || {}).value);
    var achFlat = Number((document.getElementById('fee-ach-flat') || {}).value);
    var mode = (document.getElementById('fee-ach-mode') || {}).value === 'flat' ? 'flat' : 'percent';
    var current = scheduleOf(ctx.store);
    return {
      cardBps: Math.round((isNaN(pct) ? 2.9 : pct) * 100),
      cardFixedCents: Math.round((isNaN(fixed) ? 0.3 : fixed) * 100),
      achMode: mode,
      achBps: Math.round((isNaN(achPct) ? 0.8 : achPct) * 100),
      achFlatCents: Math.round((isNaN(achFlat) ? 0 : achFlat) * 100),
      tuition: current.tuition,
      events: current.events,
      parties: current.parties,
    };
  }

  function move(id, stage, ctx) {
    if (!STAGES.some(function (row) { return row.id === stage; })) return;
    if (!PIPELINE.some(function (row) { return row.id === id; })) return;
    bag(ctx.store).moves[id] = { stage: stage, since: ctx.asOf };
    ctx.save();
    post(ctx, { action: 'pipeline', personKey: id, stage: stage }).then(function (res) {
      done(ctx, res, 'Moved to ' + stage + '. Nothing was sent.');
    });
  }

  function handle(act, el, ctx) {
    var g = bag(ctx.store);
    if (act === 'growth-view') { g.view = el.getAttribute('data-view') || 'pipeline'; ctx.render(); return true; }
    if (act === 'fee-toggle') {
      var key = el.getAttribute('data-key');
      if (key === 'proshop' || key === 'belt') return true;
      var schedule = scheduleOf(ctx.store);
      schedule[key] = !schedule[key];
      g.schedule = schedule;
      ctx.save();
      ctx.ui.qboRemote = null;
      ctx.ui.qboLiveKey = '';
      ctx.render();
      return true;
    }
    if (act === 'fee-save') {
      g.schedule = readSchedule(ctx);
      ctx.save();
      ctx.ui.qboRemote = null;
      ctx.ui.qboLiveKey = '';
      post(ctx, { action: 'fees', schedule: g.schedule }).then(function (res) {
        done(ctx, res, 'Fee settings saved. Pro Shop stays off. Nothing was charged.');
      });
      return true;
    }
    if (act === 'fee-export') {
      g.passExport = g.passExport === false;
      ctx.ui.qboRemote = null;
      ctx.ui.qboLiveKey = '';
      ctx.save();
      ctx.render();
      return true;
    }
    if (act === 'list-open') { g.listId = el.getAttribute('data-id'); ctx.render(); return true; }
    if (act === 'list-draft') {
      var list = LISTS.filter(function (row) { return row.id === g.listId; })[0];
      var people = matchList(list.filters);
      post(ctx, { action: 'list-draft', filters: list.filters }).then(function (res) {
        done(ctx, res, 'Draft saved for ' + people.length + ' sample families. Nothing was sent.');
      });
      return true;
    }
    if (act === 'review-draft') {
      g.reviewStatus[el.getAttribute('data-id')] = 'asked';
      ctx.save();
      post(ctx, { action: 'review', personKey: el.getAttribute('data-person') }).then(function (res) {
        done(ctx, res, 'Review invite drafted. Nothing was sent.');
      });
      return true;
    }
    if (act === 'chat-toggle') {
      g.chat = !g.chat;
      ctx.save();
      post(ctx, { action: 'chat', enabled: g.chat }).then(function (res) {
        done(ctx, res, g.chat ? 'Chat preview is on. Nothing was sent.' : 'Chat preview is off.');
      });
      return true;
    }
    if (act === 'revive-draft') {
      var lead = PIPELINE.filter(function (row) { return row.id === el.getAttribute('data-id'); })[0];
      post(ctx, { action: 'reactivate', personKey: lead.id, name: lead.first + ' ' + lead.last }).then(function (res) {
        done(ctx, res, 'Trial note drafted for ' + lead.first + '. Nothing was sent.');
      });
      return true;
    }
    if (act === 'ask-chip') {
      g.question = el.getAttribute('data-q');
      g.answer = answerQuestion(g.question, ctx.asOf);
      ctx.render();
      return true;
    }
    if (act === 'ask-go') {
      g.question = (document.getElementById('ask-q') || {}).value || '';
      g.answer = answerQuestion(g.question, ctx.asOf);
      post(ctx, { action: 'ask', question: g.question }).then(function () { ctx.render(); });
      ctx.render();
      return true;
    }
    if (act === 'priority-go') {
      var kind = el.getAttribute('data-kind');
      var id = el.getAttribute('data-id');
      var person = ROSTER.filter(function (row) { return row.id === id; })[0] || PIPELINE.filter(function (row) { return row.id === id; })[0];
      var name = person ? person.first + ' ' + person.last : 'the family';
      var action = kind === 'birthday' ? 'birthday' : kind === 'lead' ? 'reactivate' : 'priority';
      post(ctx, { action: action, personKey: id, name: name }).then(function (res) {
        var text = kind === 'birthday' ? 'Buddy-pass draft saved for ' + name + '. Nothing was sent.' : 'Draft saved for ' + name + '. Nothing was sent.';
        done(ctx, res, text);
      });
      return true;
    }
    return false;
  }

  return {
    feePanel: feePanel,
    askHtml: askHtml,
    feedHtml: feedHtml,
    page: page,
    handle: handle,
    move: move,
    exportSchedule: exportSchedule,
    scheduleOf: scheduleOf,
    feePreview: feePreview,
    answerQuestion: answerQuestion,
    birthdays: birthdays,
    policyFeeCents: policyFeeCents,
    cards: cards,
  };
});
