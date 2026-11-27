/* Go Ninja web flows. Sample studio preview. Nothing is charged. */
(function () {
  var HD = window.HouseholdDiscounts;
  var ACADEMY_CENTS = 18900;
  var HALF_CENTS = 14900;
  var FULL_CENTS = 24900;
  var AFTER_PRICE = { 1: 8000, 2: 15000, 3: 19500, 4: 24000, 5: 28000 };
  var CHILDREN = [
    { key: 'avery', name: 'Avery Sample' },
    { key: 'jordan', name: 'Jordan Sample' },
    { key: 'casey', name: 'Casey Sample' },
    { key: 'quinn', name: 'Quinn Sample' },
  ];
  var LOCS = [
    { id: 'goninjaW', name: 'Go Ninja Waunakee' },
    { id: 'goninjaV', name: 'Go Ninja Verona' },
  ];
  var TRACKS = [
    { id: 'all', name: 'All tracks' },
    { id: 'little', name: 'Little Ninjas' },
    { id: 'junior', name: 'Junior Ninjas' },
    { id: 'obstacle', name: 'Obstacle Ninjas' },
  ];
  var SLOTS = {
    goninjaW: [
      { id: 'w-little-tue', track: 'little', name: 'Little Ninjas', ages: 'Ages 4–6', day: 'Tue', time: '4:00 PM', spots: 8 },
      { id: 'w-little-sat', track: 'little', name: 'Little Ninjas', ages: 'Ages 4–6', day: 'Sat', time: '9:00 AM', spots: 5 },
      { id: 'w-junior-mon', track: 'junior', name: 'Junior Ninjas', ages: 'Ages 7–9', day: 'Mon', time: '5:00 PM', spots: 6 },
      { id: 'w-junior-wed', track: 'junior', name: 'Junior Ninjas', ages: 'Ages 7–9', day: 'Wed', time: '4:30 PM', spots: 4 },
      { id: 'w-obstacle-thu', track: 'obstacle', name: 'Obstacle Ninjas', ages: 'Ages 10–14', day: 'Thu', time: '5:30 PM', spots: 7 },
      { id: 'w-obstacle-sat', track: 'obstacle', name: 'Obstacle Ninjas', ages: 'Ages 10–14', day: 'Sat', time: '10:15 AM', spots: 3 },
    ],
    goninjaV: [
      { id: 'v-little-mon', track: 'little', name: 'Little Ninjas', ages: 'Ages 4–6', day: 'Mon', time: '4:00 PM', spots: 6 },
      { id: 'v-junior-tue', track: 'junior', name: 'Junior Ninjas', ages: 'Ages 7–9', day: 'Tue', time: '5:15 PM', spots: 5 },
      { id: 'v-junior-thu', track: 'junior', name: 'Junior Ninjas', ages: 'Ages 7–9', day: 'Thu', time: '4:00 PM', spots: 8 },
      { id: 'v-obstacle-wed', track: 'obstacle', name: 'Obstacle Ninjas', ages: 'Ages 10–14', day: 'Wed', time: '5:30 PM', spots: 4 },
      { id: 'v-obstacle-sat', track: 'obstacle', name: 'Obstacle Ninjas', ages: 'Ages 10–14', day: 'Sat', time: '9:30 AM', spots: 6 },
    ],
  };
  var WEEKS = [
    { id: 'w1', n: 1, theme: 'Obstacle Island', dates: 'Jun 14–18' },
    { id: 'w2', n: 2, theme: 'Balance Lab', dates: 'Jun 21–25' },
    { id: 'w3', n: 3, theme: 'Wall Week', dates: 'Jun 28–Jul 2' },
    { id: 'w4', n: 4, theme: 'Speed Trials', dates: 'Jul 6–10' },
    { id: 'w5', n: 5, theme: 'Parkour Lab', dates: 'Jul 13–17' },
    { id: 'w6', n: 6, theme: 'Team Games', dates: 'Jul 20–24' },
    { id: 'w7', n: 7, theme: 'Grip Week', dates: 'Jul 27–31' },
    { id: 'w8', n: 8, theme: 'Ninja Games', dates: 'Aug 3–7' },
    { id: 'w9', n: 9, theme: 'Warp Walls', dates: 'Aug 10–14' },
    { id: 'w10', n: 10, theme: 'Final Course', dates: 'Aug 17–21' },
  ];
  var CAMP_SPOTS = {
    goninjaW: [14, 12, 11, 16, 10, 13, 9, 15, 12, 8],
    goninjaV: [10, 9, 8, 12, 7, 11, 8, 10, 9, 6],
  };
  var SCHOOLS = {
    goninjaW: ['Sample Prairie School', 'Sample Heritage School', 'Sample Arboretum School'],
    goninjaV: ['Sample Glacier School', 'Sample Stoner School', 'Sample Country View School'],
  };
  var RELATIONS = ['Parent', 'Grandparent', 'Neighbor', 'Caregiver', 'Other'];
  var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  var state = {
    loc: 'goninjaW',
    flow: 'academy',
    track: 'all',
    academy: [],
    camp: null,
    after: null,
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(cents) {
    var n = Math.round(Number(cents) || 0);
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n);
    var dollars = Math.floor(abs / 100).toLocaleString('en-US');
    return sign + '$' + dollars + '.' + String(abs % 100).padStart(2, '0');
  }

  function childName(key) {
    var found = CHILDREN.filter(function (row) { return row.key === key; })[0];
    return found ? found.name : 'Sample child';
  }

  function locName() {
    return LOCS.filter(function (row) { return row.id === state.loc; })[0].name;
  }

  function slots() { return SLOTS[state.loc]; }

  function slotById(id) {
    return slots().filter(function (row) { return row.id === id; })[0] || null;
  }

  function weekById(id) {
    return WEEKS.filter(function (row) { return row.id === id; })[0];
  }

  function freshAcademy(loc) {
    var list = SLOTS[loc];
    return [
      { childKey: 'avery', slotId: list[Math.min(2, list.length - 1)].id },
      { childKey: 'jordan', slotId: list[0].id },
    ];
  }

  function freshCamp() {
    return {
      mode: 'multi',
      weeks: ['w1', 'w2', 'w3'],
      kids: ['avery', 'jordan'],
      cells: { 'avery|w1': 'full', 'avery|w2': 'full', 'avery|w3': 'full', 'jordan|w1': 'full' },
    };
  }

  function freshAfter() {
    return {
      school: 0,
      enrolled: [{ childKey: 'avery', days: [1, 2, 3, 4, 5] }],
      added: [{ childKey: 'jordan', days: [1, 2, 3, 4, 5] }],
      contacts: [
        { id: 'sam', name: 'Sam Sample', relation: 'Parent', note: 'Any open day' },
        { id: 'alex', name: 'Alex Sample', relation: 'Grandparent', note: 'Tuesday and Thursday' },
      ],
      note: 'Sample note: early pickup on the first Friday.',
      draftName: '',
      draftRelation: 'Parent',
      draftNote: '',
    };
  }

  function flowFromHash() {
    var hash = String(location.hash || '').replace(/^#/, '');
    if (hash === 'camp' || hash === 'summer' || hash === 'summer-camp') return 'camp';
    if (hash === 'afterschool' || hash === 'after-school' || hash === 'family') return 'afterschool';
    return 'academy';
  }

  function boot() {
    var params = new URLSearchParams(location.search);
    state.loc = params.get('loc') === 'goninjaV' ? 'goninjaV' : 'goninjaW';
    state.flow = flowFromHash();
    state.academy = freshAcademy(state.loc);
    state.camp = freshCamp();
    state.after = freshAfter();
  }

  function rules() {
    try {
      var saved = HD.rulesFromStorage(localStorage.getItem(HD.STORAGE_KEY));
      if (saved) return saved;
    } catch (err) { /* sample defaults */ }
    return HD.defaultRules();
  }

  function quote(lines, enrolled) {
    return HD.quoteHousehold({ rules: rules(), lines: lines, enrolled: enrolled || [] });
  }

  function programForFlow() {
    if (state.flow === 'camp') return 'summer_camp';
    if (state.flow === 'afterschool') return 'afterschool';
    return 'ninja_8wk';
  }

  function summary(lines, enrolled) {
    var program = programForFlow();
    var result = lines.length || (enrolled && enrolled.length) ? quote(lines, enrolled) : null;
    var rule = HD.pickRule(rules(), state.loc, program);
    var rows = '';
    if (!result || !result.lines.length) {
      rows = '<p class="empty">Add a child to see the household total.</p>';
    } else {
      rows = result.lines.filter(function (line) { return !line.alreadyEnrolled; }).map(function (line) {
        return '<div class="line"><span>' + esc(line.label || childName(line.childKey)) + '</span><strong class="price">' + esc(money(line.listCents)) + '</strong></div>';
      }).join('') + result.children.map(function (child) {
        var bits = '';
        if (child.siblingDiscountCents) bits += '<div class="off"><span>' + esc(child.siblingLabel) + '</span><span>' + esc('−' + money(child.siblingDiscountCents)) + '</span></div>';
        if (child.multiWeekDiscountCents) bits += '<div class="off"><span>' + esc(child.multiWeekLabel) + '</span><span>' + esc('−' + money(child.multiWeekDiscountCents)) + '</span></div>';
        return bits;
      }).join('') +
        '<div class="total"><span>Due</span><strong>' + esc(money(result.dueCents)) + '</strong></div>' +
        '<p class="fine">List ' + esc(money(result.listCents)) + ' · Household savings ' + esc(money(result.discountCents)) + '</p>';
    }
    var title = state.flow === 'afterschool' ? 'Upcoming sample bill' : 'Household checkout';
    return '<aside class="summary" id="summary"><p class="kicker">Sample studio preview</p><h2>' + title + '</h2>' +
      '<p class="rule">' + esc(rule ? HD.describeRule(rule) : 'Add a discount rule to price this household.') + '</p>' +
      rows +
      '<p class="fine">No real charges. ' + esc(locName()) + '.</p>' +
      '<a href="staff.html#billing">Household discount settings</a></aside>';
  }

  function shell(stage, aside) {
    return '<header class="top"><img class="logo" src="../../images/goninja-logo-white.png" alt="Go Ninja">' +
      '<div class="locs" role="group" aria-label="Location">' + LOCS.map(function (loc) {
        var on = loc.id === state.loc;
        return '<button type="button" data-act="loc" data-id="' + loc.id + '" aria-pressed="' + on + '">' + esc(loc.name) + '</button>';
      }).join('') + '</div><span class="pill">Sample studio preview</span></header>' +
      '<nav class="flows" aria-label="Go Ninja flows">' +
      '<a href="#academy" data-act="flow" data-id="academy"' + (state.flow === 'academy' ? ' aria-current="page"' : '') + '>8-Week Academy</a>' +
      '<a href="#camp" data-act="flow" data-id="camp"' + (state.flow === 'camp' ? ' aria-current="page"' : '') + '>Summer Camp</a>' +
      '<a href="#afterschool" data-act="flow" data-id="afterschool"' + (state.flow === 'afterschool' ? ' aria-current="page"' : '') + '>Afterschool</a>' +
      '</nav><div class="layout" data-flow="' + state.flow + '"><div class="stage">' + stage + '</div>' + aside + '</div>';
  }

  function academyLines() {
    return state.academy.map(function (row) {
      var slot = slotById(row.slotId);
      if (!slot) return null;
      return {
        lineId: 'ac-' + row.childKey,
        childKey: row.childKey,
        label: childName(row.childKey) + ' · ' + slot.name + ' · ' + slot.day + ' ' + slot.time,
        program: 'ninja_8wk',
        locationId: state.loc,
        unitPriceCents: ACADEMY_CENTS,
      };
    }).filter(Boolean);
  }

  function renderAcademy() {
    var visible = slots().filter(function (slot) { return state.track === 'all' || slot.track === state.track; });
    var counts = {};
    state.academy.forEach(function (row) { counts[row.slotId] = (counts[row.slotId] || 0) + 1; });
    var cards = visible.map(function (slot) {
      var left = Math.max(0, slot.spots - (counts[slot.id] || 0));
      return '<article class="slot' + ((counts[slot.id] || 0) ? ' on' : '') + '"><strong>' + esc(slot.name) + '</strong>' +
        '<span class="meta">' + esc(slot.ages) + ' · ' + esc(slot.day) + ' ' + esc(slot.time) + '</span>' +
        '<span class="meta">Sample ' + esc(money(ACADEMY_CENTS)) + '</span>' +
        '<span class="spot">' + left + ' spots left</span>' +
        '<button type="button" class="add" data-act="add-slot" data-id="' + esc(slot.id) + '">Add a child here</button></article>';
    }).join('');
    var people = state.academy.map(function (row) {
      var options = slots().map(function (slot) {
        return '<option value="' + esc(slot.id) + '"' + (slot.id === row.slotId ? ' selected' : '') + '>' + esc(slot.name + ' · ' + slot.day + ' ' + slot.time) + '</option>';
      }).join('');
      return '<div class="person"><div class="row"><strong>' + esc(childName(row.childKey)) + '</strong>' +
        '<button type="button" class="textbtn" data-act="remove-academy" data-id="' + esc(row.childKey) + '">Remove</button></div>' +
        '<label>Class time<select data-act="academy-slot" data-id="' + esc(row.childKey) + '">' + options + '</select></label></div>';
    }).join('');
    var stage = '<section class="hero"><img class="mark" src="../../images/goninja-logo.png" alt="Go Ninja"><p class="kicker">' + esc(locName()) + '</p>' +
      '<h1>Ninja Movement Academy</h1><p class="lede">Eight weeks for Little Ninjas, Junior Ninjas, and Obstacle Ninjas. Add every child in the household to one checkout.</p>' +
      '<p class="dates">January 11 – March 5, 2027</p></section>' +
      '<div class="chips" role="group" aria-label="Age track">' + TRACKS.map(function (track) {
        return '<button type="button" class="chip" data-act="track" data-id="' + track.id + '" aria-pressed="' + (state.track === track.id) + '">' + esc(track.name) + '</button>';
      }).join('') + '</div><div class="slots" style="margin-top:8px">' + cards + '</div>' +
      '<div class="section"><h2>Household</h2>' + people +
      '<button type="button" class="btn" data-act="add-academy">Add a sibling</button></div>';
    return shell(stage, summary(academyLines()));
  }

  function campLines() {
    var lines = [];
    state.camp.weeks.forEach(function (weekId) {
      var week = weekById(weekId);
      state.camp.kids.forEach(function (key) {
        var day = state.camp.cells[key + '|' + weekId];
        if (day !== 'half' && day !== 'full') return;
        lines.push({
          lineId: key + '-' + weekId,
          childKey: key,
          label: childName(key) + ' · Week ' + week.n + ' ' + week.theme + ' · ' + (day === 'half' ? 'Half day' : 'Full day'),
          program: 'summer_camp',
          locationId: state.loc,
          unitPriceCents: day === 'half' ? HALF_CENTS : FULL_CENTS,
          quantity: 1,
          weeks: 1,
        });
      });
    });
    return lines;
  }

  function renderCamp() {
    var assigned = {};
    state.camp.weeks.forEach(function (weekId) {
      assigned[weekId] = state.camp.kids.filter(function (key) {
        return state.camp.cells[key + '|' + weekId];
      }).length;
    });
    var cards = WEEKS.map(function (week, index) {
      var on = state.camp.weeks.indexOf(week.id) >= 0;
      var left = Math.max(0, CAMP_SPOTS[state.loc][index] - (assigned[week.id] || 0));
      return '<button type="button" class="week' + (on ? ' on' : '') + '" data-act="week" data-id="' + week.id + '" aria-pressed="' + on + '">' +
        '<span class="meta">Week ' + week.n + '</span><strong>' + esc(week.theme) + '</strong>' +
        '<span class="meta">' + esc(week.dates) + '</span>' +
        '<span class="meta">Half ' + esc(money(HALF_CENTS)) + ' · Full ' + esc(money(FULL_CENTS)) + '</span>' +
        '<span class="spot">' + left + ' spots left</span></button>';
    }).join('');
    var selected = state.camp.weeks.slice().sort(function (a, b) { return weekById(a).n - weekById(b).n; });
    var assign = selected.map(function (weekId) {
      var week = weekById(weekId);
      var kids = state.camp.kids.map(function (key) {
        var day = state.camp.cells[key + '|' + weekId] || '';
        var on = day === 'half' || day === 'full';
        var select = on
          ? '<label class="meta">Day<select data-act="camp-day" data-child="' + esc(key) + '" data-week="' + weekId + '">' +
            '<option value="half"' + (day === 'half' ? ' selected' : '') + '>Half day</option>' +
            '<option value="full"' + (day === 'full' ? ' selected' : '') + '>Full day</option></select></label>'
          : '';
        return '<button type="button" class="kid" data-act="camp-kid" data-child="' + esc(key) + '" data-week="' + weekId + '" aria-pressed="' + on + '">' + esc(childName(key)) + '</button>' + select;
      }).join('');
      return '<div class="panel"><strong>Week ' + week.n + ' · ' + esc(week.theme) + '</strong><div class="assign-kids">' + kids + '</div></div>';
    }).join('');
    var household = state.camp.kids.map(function (key) {
      return '<span class="badge">' + esc(childName(key)) + '</span>';
    }).join(' ');
    var stage = '<section class="hero"><p class="kicker">' + esc(locName()) + ' · Summer 2027</p><h1>Summer Camp</h1>' +
      '<p class="lede">Tap one week, or turn on multiple weeks. Assign each child, then check out once.</p></section>' +
      '<div class="mode" role="group" aria-label="Week picker">' +
      '<button type="button" data-act="camp-mode" data-id="single" aria-pressed="' + (state.camp.mode === 'single') + '">1 specific week</button>' +
      '<button type="button" data-act="camp-mode" data-id="multi" aria-pressed="' + (state.camp.mode === 'multi') + '">Multiple weeks</button></div>' +
      '<div class="weeks" style="margin-top:8px">' + cards + '</div>' +
      '<div class="section"><div class="row"><h2>Who is going</h2><div>' + household + '</div></div>' +
      (assign || '<p class="meta">Pick a week to assign children.</p>') +
      '<button type="button" class="btn" data-act="add-camp">Add a sibling</button></div>';
    return shell(stage, summary(campLines()));
  }

  function dayLabel(days) {
    if (days.length === 5) return 'Mon–Fri';
    return days.slice().sort(function (a, b) { return a - b; }).map(function (day) { return DAY_NAMES[day - 1]; }).join(' ');
  }

  function afterRows() {
    return state.after.enrolled.concat(state.after.added);
  }

  function afterLines() {
    return afterRows().map(function (row) {
      var count = row.days.length;
      if (!AFTER_PRICE[count]) return null;
      return {
        lineId: 'as-' + row.childKey,
        childKey: row.childKey,
        label: childName(row.childKey) + ' · ' + dayLabel(row.days),
        program: 'afterschool',
        locationId: state.loc,
        unitPriceCents: AFTER_PRICE[count],
      };
    }).filter(Boolean);
  }

  function dayButtons(row, enrolled) {
    return '<div class="days" role="group" aria-label="Days for ' + esc(childName(row.childKey)) + '">' + DAY_NAMES.map(function (name, index) {
      var day = index + 1;
      var on = row.days.indexOf(day) >= 0;
      return '<button type="button" class="day" data-act="after-day" data-child="' + esc(row.childKey) + '" data-day="' + day + '" data-enrolled="' + (enrolled ? '1' : '0') + '" aria-pressed="' + on + '">' + name + '</button>';
    }).join('') + '</div>';
  }

  function renderAfter() {
    var schools = SCHOOLS[state.loc];
    var school = schools[Math.min(state.after.school, schools.length - 1)];
    var enrolled = state.after.enrolled.map(function (row) {
      return '<article class="person"><div class="row"><strong>' + esc(childName(row.childKey)) + '</strong><span class="badge">Enrolled</span></div>' +
        '<p class="meta">' + esc(school) + ' · ' + esc(dayLabel(row.days)) + ' · Sample ' + esc(money(AFTER_PRICE[row.days.length] || 0)) + '</p>' +
        dayButtons(row, true) + '</article>';
    }).join('');
    var added = state.after.added.map(function (row) {
      return '<article class="person"><div class="row"><strong>' + esc(childName(row.childKey)) + '</strong>' +
        '<button type="button" class="textbtn" data-act="remove-after" data-id="' + esc(row.childKey) + '">Remove</button></div>' +
        '<p class="meta">New sibling · ' + esc(dayLabel(row.days) || 'Pick days') + '</p>' + dayButtons(row, false) + '</article>';
    }).join('');
    var options = schools.map(function (name, index) {
      return '<option value="' + index + '"' + (index === state.after.school ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
    var contacts = state.after.contacts.map(function (row) {
      return '<article class="contact"><div class="row"><strong>' + esc(row.name) + '</strong>' +
        '<button type="button" class="textbtn" data-act="remove-contact" data-id="' + esc(row.id) + '">Remove</button></div>' +
        '<p class="meta">' + esc(row.relation) + (row.note ? ' · ' + esc(row.note) : '') + '</p></article>';
    }).join('');
    var relations = RELATIONS.map(function (name) {
      return '<option' + (name === state.after.draftRelation ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
    var stage = '<section class="hero"><p class="kicker">' + esc(locName()) + '</p><h1>Afterschool</h1>' +
      '<p class="lede">Enroll, add a sibling, and update pickup contacts from this page.</p></section>' +
      '<label>School pickup<select data-act="after-school">' + options + '</select></label>' +
      '<div class="section"><h2>Enrolled now</h2>' + enrolled + '</div>' +
      '<div class="section"><h2>Siblings in this checkout</h2>' + added +
      '<button type="button" class="btn" data-act="add-after">Add a sibling</button></div>' +
      '<div class="section"><h2>Authorized pickup</h2><p class="meta">Names and notes only. Sample contacts.</p><div class="contacts">' + contacts + '</div>' +
      '<div class="stack"><label>Name<input id="gn-contact-name" maxlength="40" autocomplete="off" placeholder="Sample contact" value="' + esc(state.after.draftName) + '"></label>' +
      '<label>Relationship<select id="gn-contact-relation">' + relations + '</select></label>' +
      '<label>Note<input id="gn-contact-note" maxlength="80" autocomplete="off" value="' + esc(state.after.draftNote) + '"></label>' +
      '<button type="button" class="btn ghost" data-act="add-contact">Save pickup contact</button></div></div>' +
      '<div class="section"><label>Schedule note<textarea id="gn-note" maxlength="240">' + esc(state.after.note) + '</textarea></label></div>';
    return shell(stage, summary(afterLines()));
  }

  function render() {
    var html = state.flow === 'camp' ? renderCamp() : state.flow === 'afterschool' ? renderAfter() : renderAcademy();
    document.getElementById('app').innerHTML = html;
    document.title = (state.flow === 'camp' ? 'Summer Camp' : state.flow === 'afterschool' ? 'Afterschool' : 'Ninja Movement Academy') + ' · Go Ninja sample preview';
  }

  function syncUrl() {
    var hash = state.flow === 'camp' ? '#camp' : state.flow === 'afterschool' ? '#afterschool' : '#academy';
    history.replaceState(null, '', location.pathname + '?loc=' + state.loc + hash);
  }

  function capture() {
    var note = document.getElementById('gn-note');
    if (note) state.after.note = note.value;
    var name = document.getElementById('gn-contact-name');
    if (name) state.after.draftName = name.value;
    var relation = document.getElementById('gn-contact-relation');
    if (relation) state.after.draftRelation = relation.value;
    var extra = document.getElementById('gn-contact-note');
    if (extra) state.after.draftNote = extra.value;
  }

  function nextChild(used) {
    return CHILDREN.filter(function (row) { return used.indexOf(row.key) < 0; })[0] || null;
  }

  function findAfter(key, enrolled) {
    var list = enrolled ? state.after.enrolled : state.after.added;
    return list.filter(function (row) { return row.childKey === key; })[0];
  }

  function onClick(event) {
    var el = event.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'flow') {
      event.preventDefault();
      capture();
      state.flow = el.getAttribute('data-id');
      syncUrl();
      render();
      return;
    }
    capture();
    if (act === 'loc') {
      state.loc = el.getAttribute('data-id') === 'goninjaV' ? 'goninjaV' : 'goninjaW';
      state.academy.forEach(function (row) { if (!slotById(row.slotId)) row.slotId = slots()[0].id; });
      syncUrl();
      render();
      return;
    }
    if (act === 'track') { state.track = el.getAttribute('data-id'); render(); return; }
    if (act === 'add-slot' || act === 'add-academy') {
      var next = nextChild(state.academy.map(function (row) { return row.childKey; }));
      if (!next) return;
      var slotId = act === 'add-slot' ? el.getAttribute('data-id') : slots()[0].id;
      state.academy.push({ childKey: next.key, slotId: slotId });
      render();
      return;
    }
    if (act === 'remove-academy') {
      state.academy = state.academy.filter(function (row) { return row.childKey !== el.getAttribute('data-id'); });
      render();
      return;
    }
    if (act === 'week') {
      var id = el.getAttribute('data-id');
      if (state.camp.mode === 'single') state.camp.weeks = [id];
      else if (state.camp.weeks.indexOf(id) >= 0) state.camp.weeks = state.camp.weeks.filter(function (week) { return week !== id; });
      else state.camp.weeks.push(id);
      render();
      return;
    }
    if (act === 'camp-mode') {
      state.camp.mode = el.getAttribute('data-id') === 'single' ? 'single' : 'multi';
      if (state.camp.mode === 'single') state.camp.weeks = state.camp.weeks.slice(0, 1);
      if (!state.camp.weeks.length) state.camp.weeks = ['w1'];
      render();
      return;
    }
    if (act === 'camp-kid') {
      var key = el.getAttribute('data-child') + '|' + el.getAttribute('data-week');
      if (state.camp.cells[key]) delete state.camp.cells[key];
      else state.camp.cells[key] = 'full';
      render();
      return;
    }
    if (act === 'add-camp') {
      var campNext = nextChild(state.camp.kids);
      if (campNext) state.camp.kids.push(campNext.key);
      render();
      return;
    }
    if (act === 'after-day') {
      var person = findAfter(el.getAttribute('data-child'), el.getAttribute('data-enrolled') === '1');
      if (!person) return;
      var day = Number(el.getAttribute('data-day'));
      if (person.days.indexOf(day) >= 0) person.days = person.days.filter(function (item) { return item !== day; });
      else person.days.push(day);
      render();
      return;
    }
    if (act === 'add-after') {
      var afterNext = nextChild(afterRows().map(function (row) { return row.childKey; }));
      if (afterNext) state.after.added.push({ childKey: afterNext.key, days: [1, 2, 3, 4, 5] });
      render();
      return;
    }
    if (act === 'remove-after') {
      state.after.added = state.after.added.filter(function (row) { return row.childKey !== el.getAttribute('data-id'); });
      render();
      return;
    }
    if (act === 'add-contact') {
      var contactName = state.after.draftName.trim();
      if (contactName.length < 2) return;
      if (contactName.indexOf('://') >= 0 || state.after.draftNote.indexOf('://') >= 0) return;
      state.after.contacts.push({
        id: 'c' + Date.now().toString(36),
        name: contactName.slice(0, 40),
        relation: state.after.draftRelation,
        note: state.after.draftNote.trim().slice(0, 80),
      });
      state.after.draftName = '';
      state.after.draftNote = '';
      render();
      return;
    }
    if (act === 'remove-contact') {
      state.after.contacts = state.after.contacts.filter(function (row) { return row.id !== el.getAttribute('data-id'); });
      render();
    }
  }

  function onChange(event) {
    var el = event.target;
    var act = el.getAttribute('data-act');
    if (act === 'academy-slot') {
      var row = state.academy.filter(function (item) { return item.childKey === el.getAttribute('data-id'); })[0];
      if (row) row.slotId = el.value;
      render();
      return;
    }
    if (act === 'camp-day') {
      state.camp.cells[el.getAttribute('data-child') + '|' + el.getAttribute('data-week')] = el.value === 'half' ? 'half' : 'full';
      render();
      return;
    }
    if (act === 'after-school') {
      state.after.school = Number(el.value) || 0;
      render();
    }
  }

  boot();
  document.getElementById('app').addEventListener('click', onClick);
  document.getElementById('app').addEventListener('change', onChange);
  window.addEventListener('hashchange', function () {
    capture();
    state.flow = flowFromHash();
    render();
  });
  render();
})();
