/* Front desk CRM. A new teammate should be able to run today from this screen. */
(function () {
  var rules = window.CrmRules;
  var data = window.CRM_PREVIEW;
  var uiLib = window.CrmUi;
  var esc = uiLib.esc;
  var store = uiLib.load();
  var ui = {
    tab: 'today',
    toast: null,
    query: '',
    filter: 'all',
    drawer: '',
    editPay: false,
    view: 'day',
    day: store.today,
    draft: '',
    connect: false,
    eventName: '',
    eventType: 'Belt test',
    eventDate: store.today,
    todayView: location.hash === '#tasks' ? 'tasks' : 'desk',
    onePhase: 'opening',
    oneTitle: '',
    liveNote: 'Live sandbox. Charges are off.',
    liveMembers: null,
    liveBilling: null,
    liveShifts: null,
    signOpen: false,
    qboEntity: 'all',
    qboPeriod: 'month',
    qboFrom: '',
    qboThrough: '',
    qboMap: false,
    qboRemote: null,
    qboLiveKey: '',
    qboLiveError: '',
    qboDraft: null,
    qboMapError: '',
  };

  var TABS = [
    ['today', 'Today', 'home', 'Today'],
    ['people', 'Members & Leads', 'users', 'Members'],
    ['schedule', 'Schedule & Events', 'calendar', 'Schedule'],
    ['money', 'Financials & Billing', 'chart', 'Billing'],
    ['inbox', 'Messages & Automations', 'message', 'Messages'],
  ];

  function save() { uiLib.save(store); }
  function toast(tone, text) { ui.toast = { tone: tone, text: text }; render(); }
  function schoolId() { return store.staffSchool || 'waunakee'; }

  function tabButton(tab, kind) {
    var on = ui.tab === tab[0];
    var label = kind === 'short' ? tab[3] : tab[1];
    return '<button type="button" class="' + (kind === 'short' ? 'navbtn' : 'railbtn') + (on ? ' on' : '') + '" data-act="tab" data-tab="' + tab[0] + '"' + (on ? ' aria-current="page"' : '') + '>' +
      uiLib.icon(tab[2]) + '<span>' + esc(label) + '</span></button>';
  }

  function render() {
    var go = String(schoolId()).indexOf('goninja') === 0 ? uiLib.logo('go') : '';
    document.getElementById('app').innerHTML =
      uiLib.header('staff') +
      '<div class="desk"><nav class="rail" aria-label="Front desk"><div class="rail-logo">' + uiLib.logo('mark') + go + '</div>' +
      TABS.map(function (tab) { return tabButton(tab, 'full'); }).join('') +
      '</nav><main class="desk-main">' +
      uiLib.toast(ui.toast) +
      screen() +
      '</main></div>' +
      '<nav class="bottom staff-tabs" aria-label="Front desk">' +
      TABS.map(function (tab) { return tabButton(tab, 'short'); }).join('') +
      '</nav>' + connectSheet() + drawer() + qboDrawer();
  }

  function screen() {
    if (ui.tab === 'people') return people();
    if (ui.tab === 'schedule') return schedule();
    if (ui.tab === 'money') return money();
    if (ui.tab === 'inbox') return inbox();
    return today();
  }

  function schoolChips() {
    return '<div class="chips school-strip" aria-label="School">' + data.schools.map(function (row) {
      return '<button type="button" class="chip' + (schoolId() === row.id ? ' on' : '') + '" data-act="school" data-id="' + esc(row.id) + '">' + esc(row.name) + '</button>';
    }).join('') + '</div>';
  }

  function classesHere(date) {
    var monday = rules.mondayOf(date || ui.day);
    return rules.classesForWeek(monday).concat(store.duplicated || []).filter(function (cls) {
      return cls.locationId === schoolId() && (!date || cls.date === date);
    });
  }

  function upcomingHere() {
    var monday = rules.mondayOf(store.today);
    var rows = rules.classesForWeek(monday).concat(rules.classesForWeek(rules.addDays(monday, 7)), store.duplicated || []);
    return rows.filter(function (cls) {
      return cls.locationId === schoolId() && cls.date >= store.today;
    }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  }

  var DESK_TASKS = [
    { id: 'open-door', phase: 'opening', title: 'Unlock the front door and turn on the lights' },
    { id: 'open-computer', phase: 'opening', title: 'Start the front desk computer' },
    { id: 'open-pickup', phase: 'opening', title: 'Check the Pro Shop pickup shelf' },
    { id: 'open-roster', phase: 'opening', title: "Review today's class roster" },
    { id: 'open-sheet', phase: 'opening', title: 'Set out the sign-in sheet' },
    { id: 'open-walk', phase: 'opening', title: 'Walk the lobby and the mats' },
    { id: 'mid-stock', phase: 'mid', title: 'Restock the front desk' },
    { id: 'mid-wipe', phase: 'mid', title: 'Wipe the check-in counter' },
    { id: 'mid-roster', phase: 'mid', title: 'Confirm the next class roster' },
    { id: 'mid-lost', phase: 'mid', title: 'Check the lost-and-found bin' },
    { id: 'mid-towels', phase: 'mid', title: 'Refill paper towels' },
    { id: 'mid-billing', phase: 'mid', title: 'Note billing alerts for the lead' },
    { id: 'close-cabinet', phase: 'closing', title: 'Lock the Pro Shop cabinet' },
    { id: 'close-trash', phase: 'closing', title: 'Empty the front desk trash' },
    { id: 'close-lights', phase: 'closing', title: 'Turn off the lobby lights' },
    { id: 'close-lockset', phase: 'closing', title: 'Confirm the door is set to lock' },
    { id: 'close-note', phase: 'closing', title: 'Write the next-shift note' },
    { id: 'close-door', phase: 'closing', title: 'Lock the front door' },
  ];
  var DESK_PHASES = [
    ['opening', 'Opening'],
    ['mid', 'Mid-Shift'],
    ['closing', 'Closing'],
  ];

  function deskState() {
    if (!store.desk || typeof store.desk !== 'object') {
      store.desk = { initials: '', punch: null, history: [], done: {}, extras: [] };
    }
    store.desk.done = store.desk.done || {};
    store.desk.extras = store.desk.extras || [];
    store.desk.history = store.desk.history || [];
    store.desk.done[schoolId()] = store.desk.done[schoolId()] || {};
    return store.desk;
  }

  function taskRows() {
    var extras = deskState().extras.filter(function (row) { return row.locationId === schoolId(); });
    return DESK_TASKS.concat(extras.map(function (row) {
      return { id: row.id, phase: row.phase, title: row.title, oneOff: true };
    }));
  }

  function stamp(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }).format(new Date(iso));
    } catch (err) { return iso; }
  }

  function payBounds(iso) {
    var parts = String(iso || store.today).split('-');
    var day = Number(parts[2]);
    if (day <= 15) return { start: parts[0] + '-' + parts[1] + '-01', end: parts[0] + '-' + parts[1] + '-15' };
    var last = new Date(Date.UTC(Number(parts[0]), Number(parts[1]), 0)).getUTCDate();
    return { start: parts[0] + '-' + parts[1] + '-16', end: parts[0] + '-' + parts[1] + '-' + String(last).padStart(2, '0') };
  }

  function elapsedMs(punch, now) {
    if (!punch || !punch.inAt) return 0;
    var end = punch.outAt ? Date.parse(punch.outAt) : now;
    var br = (Number(punch.breakMinutes) || 0) * 60000;
    if (punch.onBreak && punch.breakStartedAt) br += Math.max(0, now - Date.parse(punch.breakStartedAt));
    return Math.max(0, end - Date.parse(punch.inAt) - br);
  }

  function formatElapsed(ms) {
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return h + ':' + pad(m) + ':' + pad(s);
  }

  function chicagoDate(iso) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(iso));
    } catch (err) { return String(iso || '').slice(0, 10); }
  }

  function hoursInPeriod() {
    var bounds = payBounds(store.today);
    return deskState().history.filter(function (row) {
      var date = row.date || chicagoDate(row.inAt);
      return date >= bounds.start && date <= bounds.end;
    });
  }

  function csvEscape(value) {
    var text = String(value == null ? '' : value);
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function localPayrollCsv(rows) {
    var header = 'Date,Initials,School,Clock in,Clock out,Break minutes,Hours,Memo';
    var memo = 'Dry-run preview. QuickBooks was not updated.';
    var lines = rows.map(function (row) {
      var minutes = Math.round(elapsedMs(row, Date.parse(row.outAt)) / 60000);
      var hours = (minutes / 60).toFixed(2);
      return [row.date || chicagoDate(row.inAt), row.initials, uiLib.school(row.locationId).name, row.inAt, row.outAt, row.breakMinutes || 0, hours, memo].map(csvEscape).join(',');
    });
    return [header].concat(lines).join('\n') + '\n';
  }

  function downloadCsv(csv) {
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'payroll-preview.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function todaySwitch(view) {
    function btn(id, label) {
      var on = view === id;
      return '<button type="button" role="tab" class="' + (on ? 'on' : '') + '" data-act="today-view" data-view="' + id + '" aria-selected="' + (on ? 'true' : 'false') + '">' + label + '</button>';
    }
    return '<div class="segment" role="tablist" aria-label="Today">' + btn('desk', 'Front Desk') + btn('tasks', 'Tasks &amp; Clock-In') + '</div>';
  }

  function tasksView() {
    var desk = deskState();
    var punch = desk.punch;
    var clocked = punch && !punch.outAt;
    var elapsed = formatElapsed(elapsedMs(punch, Date.now()));
    var bounds = payBounds(store.today);
    var rows = taskRows();
    var phases = DESK_PHASES.map(function (phase) {
      var list = rows.filter(function (task) { return task.phase === phase[0]; });
      var done = list.filter(function (task) { return desk.done[schoolId()][task.id]; }).length;
      var width = list.length ? Math.round((done / list.length) * 100) : 0;
      return '<h2>' + esc(phase[1]) + '</h2><p class="meta">' + done + ' of ' + list.length + ' complete</p><div class="bar" aria-hidden="true"><span style="width:' + width + '%"></span></div>' +
        list.map(function (task) {
          var mark = desk.done[schoolId()][task.id];
          return '<button type="button" class="rowbtn task-row' + (mark ? ' on' : '') + '" data-act="task-toggle" data-id="' + esc(task.id) + '"><span class="box" aria-hidden="true"></span><span><strong>' + esc(task.title) + '</strong>' +
            (mark ? '<span class="meta">' + esc(mark.initials) + ' · ' + esc(stamp(mark.at)) + '</span>' : '<span class="meta">Tap to complete</span>') +
            '</span></button>';
        }).join('');
    }).join('');
    var hours = hoursInPeriod();
    var hourList = hours.length ? hours.map(function (row) {
      var minutes = Math.round(elapsedMs(row, Date.parse(row.outAt)) / 60000);
      return '<div class="card"><strong>' + esc(row.initials) + ' · ' + esc(uiLib.school(row.locationId).name) + '</strong><div class="meta">' + esc(rules.prettyDate(row.date || chicagoDate(row.inAt))) + ' · ' + (minutes / 60).toFixed(2) + ' hours · break ' + esc(row.breakMinutes || 0) + ' min</div></div>';
    }).join('') : '<p class="quiet">No finished shifts in this pay period yet.</p>';
    return uiLib.liveNote(ui.liveNote) +
      (ui.signOpen || uiLib.token() ? uiLib.signCard('staff') : '') +
      '<p class="lede">' + esc(uiLib.school(schoolId()).name) + '. Shift sheet and checklists. Nothing is sent to QuickBooks.</p>' +
      schoolChips() +
      '<div class="card clock-card"><div class="meta">' + (clocked ? (punch.onBreak ? 'On break' : 'On the clock') : 'Not clocked in') + '</div>' +
      '<div class="timer" id="shift-elapsed">' + esc(elapsed) + '</div>' +
      '<label>Initials<input id="desk-initials" maxlength="4" autocomplete="off" value="' + esc(desk.initials || '') + '" placeholder="AM"></label>' +
      '<button type="button" class="big primary clock-btn" data-act="clock">' + (clocked ? 'Clock Out' : 'Clock In') + '</button>' +
      '<button type="button" class="big" data-act="break"' + (clocked ? '' : ' disabled') + '>' + (punch && punch.onBreak ? 'End break' : 'Start break') + '</button></div>' +
      phases +
      '<h2>This pay period</h2><p class="meta">' + esc(rules.prettyDate(bounds.start) + ' – ' + rules.prettyDate(bounds.end)) + '</p>' + hourList +
      '<button type="button" class="big" data-act="payroll">Export Payroll CSV (QuickBooks-ready preview)</button>' +
      '<h2>Add one-off task</h2><div class="card stack"><label>Task<input id="one-title" value="' + esc(ui.oneTitle) + '" placeholder="Sweep the entry mat"></label>' +
      '<label>When<select id="one-phase">' + DESK_PHASES.map(function (phase) {
        return '<option value="' + phase[0] + '"' + (ui.onePhase === phase[0] ? ' selected' : '') + '>' + esc(phase[1]) + '</option>';
      }).join('') + '</select></label>' +
      '<button type="button" class="big primary" data-act="task-add">Add one-off task</button></div>';
  }

  function today() {
    var view = ui.todayView === 'tasks' ? 'tasks' : 'desk';
    return '<h1>Today</h1>' + todaySwitch(view) + (view === 'tasks' ? tasksView() : frontDesk());
  }

  function frontDesk() {
    var todayRows = classesHere(store.today);
    var rows = todayRows.length ? todayRows : upcomingHere().slice(0, 1);
    var heading = todayRows.length ? 'Classes' : 'Next class';
    var locked = store.kiosk && store.kiosk.locationId === schoolId();
    var place = uiLib.school(schoolId());
    var where = place.id === 'eastmad' ? place.name + ' · ' + place.city : place.name;
    var checked = store.checkins.filter(function (row) { return row.ok; }).length;
    var readyCount = store.orders.filter(function (order) {
      return order.fulfillmentMethod === 'studio_pickup' && order.fulfillmentStatus === 'ready_for_pickup' && order.pickupLocationId === schoolId();
    }).length;
    var alerts = uiLib.people().filter(function (row) { return row.school === schoolId() && row.card === 'expired'; }).length;
    var sign = uiLib.dataMode() === 'live'
      ? uiLib.liveNote(ui.liveNote) + (ui.signOpen || uiLib.token() ? uiLib.signCard('staff') : '<button type="button" class="big" data-act="sign-open">Sign in to the sandbox</button>')
      : '';
    return sign + '<p class="lede">' + esc(where) + '. Start here.</p>' +
      '<div class="kpis"><div class="kpi"><span>Classes Today</span><strong>' + (classesHere(store.today).length) + '</strong></div>' +
      '<div class="kpi"><span>Checked In</span><strong>' + checked + '</strong></div>' +
      '<div class="kpi"><span>Pro Shop Pickups Ready</span><strong>' + readyCount + '</strong></div>' +
      '<div class="kpi"><span>Billing Alerts</span><strong>' + alerts + '</strong></div></div>' +
      schoolChips() +
      '<h2>' + heading + '</h2>' + (rows.length ? rows.map(function (cls) {
        var isLocked = locked && store.kiosk.classId === cls.id;
        return '<div class="card' + (isLocked ? ' kiosk-lock' : '') + '"><h3>' + esc(cls.title) + '</h3><div>' + esc(rules.prettyDate(cls.date) + ' · ' + rules.prettyTime(cls.time) + ' · ' + cls.program) + '</div>' +
          (isLocked
            ? '<div class="note">Kiosk locked on ' + esc(cls.title) + ' · ' + esc(rules.prettyTime(cls.time)) + '.</div><button type="button" class="big" data-act="kiosk-off">Unlock kiosk</button>'
            : '<button type="button" class="big primary" data-act="kiosk" data-id="' + esc(cls.id) + '">' + uiLib.icon('lock') + ' Lock kiosk on this class</button>') +
          '</div>';
      }).join('') : '<div class="card"><p>No classes at this school today. Check the schedule for the week.</p></div>') +
      '<h2>Quick check-in</h2><label>Name<input id="checkin-q" placeholder="Riley" value="' + esc(ui.query) + '"></label>' +
      '<div class="stack">' + checkinRows() + '</div>' +
      '<h2>Pro Shop pickup queue</h2>' + queue('studio_pickup') +
      '<h2>Shipping</h2>' + queue('ship_to_home');
  }

  function roster() {
    if (ui.liveMembers && ui.liveMembers.length) return ui.liveMembers;
    return uiLib.people();
  }

  function findPerson(id) {
    var live = (ui.liveMembers || []).filter(function (row) { return row.id === id; })[0];
    return live || uiLib.person(id);
  }

  function checkinRows() {
    var q = ui.query.trim().toLowerCase();
    var rows = roster().filter(function (row) {
      if (row.role === 'parent') return false;
      if (row.school !== schoolId() && q) return (row.first + ' ' + row.last).toLowerCase().indexOf(q) >= 0;
      if (row.school !== schoolId()) return false;
      if (!q) return true;
      return (row.first + ' ' + row.last).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 6);
    if (!rows.length) return '<div class="toast bad" role="alert">No one matches that.</div>';
    return rows.map(function (row) {
      var dot = row.card === 'expired' ? '<span class="dot hot"></span> ' : '';
      var pill = row.card === 'expired' ? '<span class="badge bad">Card expired</span>' : '<span class="badge ok">Ready</span>';
      return '<button type="button" class="rowbtn roster-row" data-act="checkin" data-id="' + esc(row.id) + '"><span class="avatar ' + (row.belt === 'Yellow' ? 'belt-yellow' : row.belt === 'White' || row.belt === 'New' ? 'belt-white' : row.belt === 'Green' ? 'belt-green' : 'belt-gold') + '"><span class="face">' + esc(row.first.slice(0, 1)) + '</span></span><span><strong>' + dot + 'Check in ' + esc(row.first + ' ' + row.last) + '</strong><span class="meta">' + esc(row.belt + ' · ' + row.plan) + '</span></span>' + pill + '</button>';
    }).join('');
  }

  function queue(method) {
    var rows = store.orders.filter(function (order) {
      if (order.fulfillmentMethod !== method) return false;
      if (order.fulfillmentStatus === 'picked_up' || order.fulfillmentStatus === 'delivered') return false;
      if (method === 'studio_pickup') return order.pickupLocationId === schoolId();
      return uiLib.person(order.personId).school === schoolId();
    });
    if (!rows.length) return '<p class="quiet">Nothing waiting.</p>';
    return rows.map(function (order) {
      var next = rules.nextFulfillmentStatus(order.fulfillmentMethod, order.fulfillmentStatus);
      var who = uiLib.person(order.personId);
      var track = next === 'shipped'
        ? '<label>Tracking, optional<input id="track-' + esc(order.id) + '" placeholder="SAMPLETRACK"></label>'
        : '';
      return '<div class="card queue-card"><strong>' + uiLib.icon(method === 'studio_pickup' ? 'store' : 'truck') + ' <span>' + esc(rules.orderStatusLabel(order, uiLib.names())) + '</span></strong><div class="meta">' + esc(who.first + ' · ' + (order.lines[0] ? order.lines[0].name : 'Item')) + '</div>' +
        track +
        (next ? '<button type="button" class="big primary" data-act="fulfill" data-id="' + esc(order.id) + '">' + esc(rules.actionLabel(next)) + '</button>' : '') +
        '</div>';
    }).join('');
  }

  function people() {
    var rows = filtered();
    return '<h1>Members &amp; Leads</h1><p class="lede">Search, then tap a name. Pinned notes are at the top of the card.</p>' +
      '<label>Search<input id="people-q" placeholder="Search the sample studio" value="' + esc(ui.query) + '"></label>' +
      '<div class="chips">' +
      chip('all', 'All') + chip('active', 'Active') + chip('expired', 'Expired Card') + chip('trial', 'Tag · Trial') + chip('alex', 'Sold by Alex') +
      '</div><div class="stack">' + rows.map(function (row) {
        return '<button type="button" class="rowbtn roster-row" data-act="open" data-id="' + esc(row.id) + '"><span class="avatar belt-gold"><span class="face">' + esc(row.first.slice(0, 1)) + '</span></span><span><strong>' + esc(row.first + ' ' + row.last) + '</strong><span class="meta">' + esc(row.belt + ' · ' + row.tag + ' · ' + uiLib.school(row.school).name) + '</span></span></button>';
      }).join('') + '</div>';
  }

  function chip(id, label) {
    return '<button type="button" class="chip' + (ui.filter === id ? ' on' : '') + '" data-act="filter" data-id="' + id + '">' + esc(label) + '</button>';
  }

  function filtered() {
    var q = ui.query.trim().toLowerCase();
    return roster().filter(function (row) {
      if (row.role === 'parent') return false;
      if (q && (row.first + ' ' + row.last + ' ' + row.tag).toLowerCase().indexOf(q) < 0) return false;
      if (ui.filter === 'active') return row.status === 'active';
      if (ui.filter === 'expired') return row.card === 'expired';
      if (ui.filter === 'trial') return row.tag === 'Trial';
      if (ui.filter === 'alex') return row.soldBy === 'Alex Sample';
      return true;
    });
  }

  function drawer() {
    if (!ui.drawer) return '';
    var who = findPerson(ui.drawer);
    if (!who.note) who.note = who.live ? 'No pinned note on the sandbox yet.' : 'No note yet.';
    who.stripes = who.stripes || 0;
    who.stripesNeed = who.stripesNeed || 1;
    var contacts = store.contacts.filter(function (row) { return row.personId === who.id; });
    var cents = store.paymentPreview[who.id] != null ? store.paymentPreview[who.id] : who.planCents;
    var pay = ui.editPay
      ? '<label>Draft amount, dollars<input id="pay-amt" inputmode="decimal" value="' + esc((cents / 100).toFixed(2)) + '"></label><button type="button" class="big primary" data-act="pay-save">Save preview</button>'
      : '<div class="split"><div><div class="meta">Upcoming draft</div><strong>' + esc(uiLib.money(cents)) + '</strong></div><button type="button" class="ghost" data-act="pay-edit">Edit</button></div>' +
        (store.paymentPreview[who.id] != null ? '<button type="button" class="textbtn" data-act="pay-undo">Undo</button>' : '');
    var next = nextClassFor(who);
    return '<div class="drawer" role="dialog" aria-modal="true" aria-label="' + esc(who.first + ' ' + who.last) + '"><div class="panel">' +
      '<div class="sheet-pin"><div class="pin-note">Pinned note · ' + esc(who.note) + '</div>' +
      '<button type="button" class="sheet-close" data-act="close">' + uiLib.icon('x') + ' Close</button></div>' +
      '<h1>' + esc(who.first + ' ' + who.last) + '</h1><p class="lede">' + esc(who.program + ' · ' + uiLib.school(who.school).name) + '</p>' +
      '<h2>Emergency and pickup</h2>' + (contacts.length ? contacts.map(function (row) {
        return '<div class="card"><strong>' + esc(row.name) + '</strong><div class="meta">' + esc(row.kind + ' · ' + row.relationship) + '</div></div>';
      }).join('') : '<p class="quiet">None saved.</p>') +
      '<h2>Rank</h2><p>' + esc(who.belt) + ' belt · ' + esc(who.stripes) + ' of ' + esc(who.stripesNeed) + ' stripes</p><div class="bar"><span style="width:' + Math.round((who.stripes / Math.max(1, who.stripesNeed)) * 100) + '%"></span></div>' +
      '<h2>Tags</h2><span class="badge">' + esc(who.tag) + '</span> <span class="badge">' + esc(who.soldBy) + '</span>' +
      '<h2>Upcoming payment</h2><div class="card">' + pay + '<p class="meta">Preview only. Nothing was charged.</p></div>' +
      (next ? '<button type="button" class="big primary" data-act="book-next" data-id="' + esc(next.id) + '">Book into ' + esc(next.title) + '</button>' : '<p class="quiet">No open class this week for this program.</p>') +
      '</div></div>';
  }

  function nextClassFor(who) {
    var monday = rules.mondayOf(store.today);
    var rows = rules.classesForWeek(monday).concat(store.duplicated || []).filter(function (cls) {
      return rules.classFits(who, cls) && cls.date >= store.today && rules.seatsLeft(cls, store.bookings) > 0;
    });
    rows.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    return rows[0] || null;
  }

  function schedule() {
    var viewChips = ['day', 'week', 'month'].map(function (view) {
      return '<button type="button" class="chip' + (ui.view === view ? ' on' : '') + '" data-act="view" data-view="' + view + '">' + esc(view[0].toUpperCase() + view.slice(1)) + '</button>';
    }).join('');
    var shifts = (ui.liveShifts || []).slice(0, 6).map(function (row) {
      return '<div class="card"><strong>' + esc(row.role || 'Shift') + '</strong><div class="meta">' + esc((row.shift_date || row.date || '') + ' · ' + (row.start_local || '') + '–' + (row.end_local || '')) + '</div></div>';
    }).join('');
    return '<h1>Schedule &amp; Events</h1>' + uiLib.liveNote(ui.liveNote) + '<p class="lede">' + esc(uiLib.school(schoolId()).name) + '</p>' + schoolChips() +
      (shifts ? '<h2>Sandbox shifts</h2>' + shifts : '') +
      '<div class="chips">' + viewChips + '</div>' + viewBody() +
      '<h2>Add an event</h2><div class="card stack"><label>Name<input id="event-name" value="' + esc(ui.eventName) + '" placeholder="Parents Night Out"></label>' +
      '<label>Date<input id="event-date" type="date" value="' + esc(ui.eventDate) + '"></label>' +
      '<label>Type<select id="event-type"><option>Belt test</option><option>Clinic</option><option>Tournament</option><option>Parents Night Out</option><option>Party</option></select></label>' +
      '<button type="button" class="big primary" data-act="add-event">Add event</button></div>' +
      '<h2>Bookings and waitlist</h2>' + bookingList();
  }

  function viewBody() {
    if (ui.view === 'month') {
      var cells = rules.monthCells(ui.day);
      var busy = {};
      rules.classesForWeek(rules.mondayOf(ui.day)).concat(store.duplicated || [], store.extraEvents || []).forEach(function (row) {
        if (row.locationId === schoolId() || !row.locationId) busy[row.date] = true;
      });
      return '<div class="cal">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function (d) { return '<div class="dow">' + d + '</div>'; }).join('') +
        cells.map(function (cell) {
          if (!cell.inMonth) return '<span></span>';
          var cls = (cell.iso === ui.day ? ' on' : '') + (busy[cell.iso] ? ' has' : '');
          return '<button type="button" class="' + cls + '" data-act="pick-day" data-date="' + cell.iso + '">' + cell.day + '</button>';
        }).join('') + '</div>';
    }
    if (ui.view === 'week') {
      var monday = rules.mondayOf(ui.day);
      return [0, 1, 2, 3, 4, 5, 6].map(function (offset) {
        var iso = rules.addDays(monday, offset);
        var rows = classesHere(iso);
        return '<h2>' + esc(rules.prettyDate(iso)) + '</h2>' + (rows.length ? rows.map(sessionCard).join('') : '<p class="quiet">No classes.</p>');
      }).join('');
    }
    var rows = classesHere(ui.day);
    return '<h2>' + esc(rules.prettyDate(ui.day)) + '</h2>' + (rows.length ? rows.map(sessionCard).join('') : '<p class="quiet">No classes this day.</p>') + extraEvents();
  }

  function sessionCard(cls) {
    return '<div class="card"><h3>' + esc(cls.title) + '</h3><div>' + esc(rules.prettyTime(cls.time) + ' · ' + cls.program) + '</div><div class="meta">' + esc(cls.booked) + ' already in the sample · capacity ' + esc(cls.capacity) + '</div>' +
      '<button type="button" class="big" data-act="duplicate" data-id="' + esc(cls.id) + '">Duplicate session</button></div>';
  }

  function extraEvents() {
    var rows = (store.extraEvents || []).filter(function (row) { return row.locationId === schoolId(); });
    if (!rows.length) return '';
    return rows.map(function (row) {
      return '<div class="card"><span class="badge">' + esc(row.type) + '</span><h3>' + esc(row.title) + '</h3><div>' + esc(rules.prettyDate(row.date)) + '</div></div>';
    }).join('');
  }

  function bookingList() {
    var ids = classesHere(ui.day).map(function (cls) { return cls.id; });
    var rows = store.bookings.filter(function (row) { return ids.indexOf(row.classId) >= 0 && row.status !== 'cancelled'; });
    if (!rows.length) return '<p class="quiet">No one booked from the member app yet.</p>';
    return rows.map(function (row) {
      var who = uiLib.person(row.personId);
      var cls = classesHere(ui.day).filter(function (item) { return item.id === row.classId; })[0];
      return '<div class="card"><strong>' + esc(who.first) + '</strong><div class="meta">' + esc((cls ? cls.title : 'Class') + ' · ' + (row.status === 'waitlist' ? 'Waitlist' : 'Booked')) + '</div></div>';
    }).join('');
  }

  function qboEdits() {
    try {
      var saved = JSON.parse(localStorage.getItem('lvlupQboMapV1') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (err) { return []; }
  }

  function qboIsLive() { return !!(uiLib.apiBase() && uiLib.token()); }

  function qboQueryKey() {
    return [ui.qboEntity, ui.qboPeriod, ui.qboFrom, ui.qboThrough, store.today, uiLib.apiBase(), qboIsLive() ? '1' : '0'].join('|');
  }

  function ensureQboLive() {
    if (!qboIsLive()) { ui.qboRemote = null; ui.qboLiveKey = ''; return; }
    var key = qboQueryKey();
    if (ui.qboLiveKey === key) return;
    ui.qboLiveKey = key;
    var params = new URLSearchParams({ entity: ui.qboEntity, period: ui.qboPeriod, format: 'preview', asOf: store.today });
    if (ui.qboPeriod === 'custom') {
      if (ui.qboFrom) params.set('from', ui.qboFrom);
      if (ui.qboThrough) params.set('through', ui.qboThrough);
    }
    fetch(uiLib.apiBase() + '/v1/financials/quickbooks-export?' + params.toString(), {
      headers: { authorization: 'Bearer ' + uiLib.token() },
    }).then(function (res) {
      return res.json().then(function (body) { return { ok: res.ok, body: body }; });
    }).then(function (res) {
      if (ui.qboLiveKey !== key) return;
      ui.qboRemote = res.ok ? res.body : null;
      ui.qboLiveError = res.ok ? '' : ((res.body && res.body.error && res.body.error.message) || 'Could not load the export.');
      render();
    }).catch(function () {
      if (ui.qboLiveKey !== key) return;
      ui.qboRemote = null;
      ui.qboLiveError = 'Could not reach the sandbox API. Showing the sample file.';
      render();
    });
  }

  function qboLocal() {
    var catalog = window.LvlupQbo.applyMappingEdits(window.LvlupQbo.defaultCatalog(), qboEdits());
    return window.LvlupQbo.buildQuickbooksExport({
      entity: ui.qboEntity,
      period: ui.qboPeriod,
      from: ui.qboFrom,
      through: ui.qboThrough,
      asOf: store.today,
      catalog: catalog,
    });
  }

  function qboReport() {
    if (ui.qboPeriod === 'custom' && (!ui.qboFrom || !ui.qboThrough)) return null;
    if (qboIsLive() && ui.qboRemote && ui.qboRemote.entities) return ui.qboRemote;
    try { return qboLocal(); }
    catch (err) { ui.qboLiveError = err && err.message ? err.message : 'Check the dates.'; return null; }
  }

  function qboField(id, field, fallback) {
    var lists = [ui.qboDraft || [], qboEdits()];
    for (var i = 0; i < lists.length; i++) {
      var hit = lists[i].filter(function (row) { return row.id === id; })[0];
      if (hit && hit[field] != null) return hit[field];
    }
    return fallback;
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function qboDownload(kind) {
    var report = qboReport();
    if (!report) { toast('bad', 'Choose a start and end date first.'); return; }
    var files = kind === 'journal' ? (report.journalFiles || []) : (report.files || []);
    if (!files.length) { toast('bad', 'Nothing to download for that range.'); return; }
    files.forEach(function (file, index) {
      setTimeout(function () { downloadText(file.filename, file.body); }, index * 250);
    });
    var fromApi = qboIsLive() && ui.qboRemote;
    var count = files.length === 1 ? 'Saved the file. ' : 'Saved ' + files.length + ' files. ';
    toast('ok', count + (fromApi ? 'Loaded from the sandbox export. Nothing was sent to QuickBooks.' : 'Demo file on this iPad. Nothing was sent to QuickBooks.'));
  }

  function qboCard() {
    ensureQboLive();
    var entities = [
      ['all', 'All 3 Entities'],
      ['moh', "Moh's Martial Arts LLC"],
      ['lvlup2', 'LVLUP Martial Arts 2 LLC'],
      ['lvlup3', 'LVLUP Martial Arts 3 LLC'],
    ];
    var periods = [['month', 'This Month'], ['last', 'Last Month'], ['custom', 'Custom']];
    var pills = function (rows, current, act) {
      return '<div class="qbo-pill-row" role="group">' + rows.map(function (row) {
        return '<button type="button" class="chip' + (current === row[0] ? ' on' : '') + '" data-act="' + act + '" data-id="' + esc(row[0]) + '">' + esc(row[1]) + '</button>';
      }).join('') + '</div>';
    };
    var report = qboReport();
    var dates = ui.qboPeriod === 'custom'
      ? '<div class="qbo-dates"><label>Start<input id="qbo-from" type="date" value="' + esc(ui.qboFrom) + '"></label><label>End<input id="qbo-through" type="date" value="' + esc(ui.qboThrough) + '"></label></div>'
      : '';
    if (!report) {
      return qboShell(pills(entities, ui.qboEntity, 'qbo-entity'), pills(periods, ui.qboPeriod, 'qbo-period'), dates, '<p class="lede">Choose both dates. The file stays on this iPad until you download it.</p>');
    }
    var view = report.entities.length === 1 ? report.entities[0] : null;
    var cats = view ? view.categories : report.summary.categories;
    var totals = view ? view.totals : report.summary;
    var balanced = view ? view.journal.balanced && view.totals.formulaOk : report.summary.balanced;
    var mode = qboIsLive() && ui.qboRemote ? 'Live sandbox' : 'Demo';
    var splits = report.entities.length > 1
      ? '<div class="qbo-entity-totals">' + report.entities.map(function (entity) {
        return '<div><span>' + esc(entity.legalName) + '</span><strong>' + esc(uiLib.money(entity.totals.depositCents)) + '</strong></div>';
      }).join('') + '</div>'
      : '';
    var table = '<div class="qbo-table-wrap"><table class="qbo-table"><thead><tr><th>Category</th><th>Count</th><th>Gross</th><th>Refunds</th><th>Fees</th><th>Net</th></tr></thead><tbody>' +
      cats.map(function (row) {
        return '<tr><td class="qbo-name"><strong>' + esc(row.name) + '</strong><span class="qbo-acct">' + esc(row.accountName) + '</span></td>' +
          '<td class="qbo-nums" data-label="Count">' + esc(row.count) + '</td>' +
          '<td class="qbo-nums" data-label="Gross">' + esc(uiLib.money(row.grossCents)) + '</td>' +
          '<td class="qbo-nums" data-label="Refunds">' + esc(uiLib.money(row.refundCents)) + '</td>' +
          '<td class="qbo-nums" data-label="Fees">' + esc(uiLib.money(row.feeCents)) + '</td>' +
          '<td class="qbo-nums" data-label="Net">' + esc(uiLib.money(row.netCents)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var check = '<div class="qbo-check' + (balanced ? '' : ' bad') + '" role="status">' +
      (balanced ? 'Debits = Credits' : 'Out of balance') +
      ' · Net = Gross − Refunds − Fees · Deposit ' + esc(uiLib.money(totals.depositCents)) +
      ' · Family credits ' + esc(uiLib.money(totals.creditCents)) + '</div>';
    var note = ui.qboLiveError ? '<div class="toast bad" role="alert">' + esc(ui.qboLiveError) + '</div>' : '';
    return qboShell(pills(entities, ui.qboEntity, 'qbo-entity'), pills(periods, ui.qboPeriod, 'qbo-period'), dates,
      note + splits + check +
      '<div class="qbo-actions"><button type="button" class="big primary" data-act="qbo-csv">Download QuickBooks CSV</button>' +
      '<button type="button" class="big" data-act="qbo-journal">Download QBO Journal Entry CSV</button>' +
      '<button type="button" class="big qbo-edit" data-act="qbo-map">Edit QuickBooks Account Names</button></div>' +
      table +
      '<p class="meta">' + esc(mode) + ' · ' + esc(report.period.label) + ' · ' + esc(report.period.from) + ' to ' + esc(report.period.through) + '. Nothing is charged.</p>');
  }

  function qboShell(entities, periods, dates, body) {
    return '<section class="qbo-card" id="qbo-export" data-qbo="export">' +
      '<div class="qbo-top"><div class="qbo-logos">' + uiLib.logo('mark') + uiLib.logo('go') + '</div>' +
      '<div class="qbo-copy"><p class="qbo-kicker">QuickBooks</p><h2>QuickBooks Export for Richelle</h2>' +
      '<p class="lede">One file per LLC. Account names match her chart. Nothing is sent to QuickBooks.</p></div></div>' +
      entities + periods + dates + body + '</section>';
  }

  function qboDrawer() {
    if (!ui.qboMap || !window.LvlupQbo) return '';
    var catalog = window.LvlupQbo.defaultCatalog();
    var block = function (title, rows, account) {
      return '<h2 class="qbo-brand">' + esc(title) + '</h2>' + rows.map(function (row) {
        var accountField = account
          ? '<label>QuickBooks account name<input id="qbo-acct-' + esc(row.id) + '" value="' + esc(qboField(row.id, 'accountName', row.accountName)) + '" autocomplete="off"></label>'
          : '';
        var classLabel = account ? 'Class, if it should not follow the school' : 'QuickBooks class / location';
        return '<div class="card qbo-map-row"><strong>' + esc(row.name) + '</strong>' + accountField +
          '<label>' + esc(classLabel) + '<input id="qbo-class-' + esc(row.id) + '" value="' + esc(qboField(row.id, 'className', row.className)) + '" autocomplete="off"></label></div>';
      }).join('');
    };
    return '<div class="drawer qbo-drawer" data-qbo="mapping"><div class="panel"><button type="button" class="textbtn" data-act="qbo-map-close">Close</button>' +
      '<div class="qbo-logos">' + uiLib.logo('mark') + uiLib.logo('go') + '</div>' +
      '<h1>Edit QuickBooks Account Names</h1><p class="lede">Change a name once. The next download uses it. Nothing is posted to QuickBooks.</p>' +
      (ui.qboMapError ? '<div class="toast bad" role="alert">' + esc(ui.qboMapError) + '</div>' : '') +
      block('LVLUP Martial Arts', catalog.categories.filter(function (row) { return row.brand === 'lvlup'; }), true) +
      block('Go Ninja', catalog.categories.filter(function (row) { return row.brand === 'goninja'; }), true) +
      block('Refunds, fees, and the deposit', catalog.accounts, true) +
      block('School class / location', catalog.schools, false) +
      '<button type="button" class="big primary" data-act="qbo-map-save">Save account names</button>' +
      '<button type="button" class="big" data-act="qbo-map-reset">Restore suggested names</button></div></div>';
  }

  function saveQboMap() {
    var catalog = window.LvlupQbo.defaultCatalog();
    var edits = [];
    catalog.categories.concat(catalog.accounts).forEach(function (row) {
      var account = document.getElementById('qbo-acct-' + row.id);
      var klass = document.getElementById('qbo-class-' + row.id);
      edits.push({
        id: row.id,
        accountName: account ? account.value : row.accountName,
        className: klass ? klass.value : '',
      });
    });
    catalog.schools.forEach(function (row) {
      var klass = document.getElementById('qbo-class-' + row.id);
      edits.push({ id: row.id, className: klass ? klass.value : row.className });
    });
    try { window.LvlupQbo.applyMappingEdits(window.LvlupQbo.defaultCatalog(), edits); }
    catch (err) {
      ui.qboDraft = edits;
      ui.qboMapError = err && err.message ? err.message : 'Check the account names.';
      render();
      return;
    }
    try { localStorage.setItem('lvlupQboMapV1', JSON.stringify(edits)); } catch (err) { /* private mode */ }
    ui.qboDraft = null;
    ui.qboMapError = '';
    ui.qboMap = false;
    ui.qboLiveKey = '';
    if (qboIsLive()) {
      fetch(uiLib.apiBase() + '/v1/financials/quickbooks-categories', {
        method: 'PUT',
        headers: { authorization: 'Bearer ' + uiLib.token(), 'content-type': 'application/json' },
        body: JSON.stringify({ rows: edits }),
      }).then(function (res) {
        return res.json().then(function (body) { return { ok: res.ok, body: body }; });
      }).then(function (res) {
        toast(res.ok ? 'ok' : 'bad', res.ok ? 'Account names saved in the sandbox. Nothing was posted to QuickBooks.' : ((res.body && res.body.error && res.body.error.message) || 'Could not save.'));
      }).catch(function () {
        toast('ok', 'Saved on this iPad. The sandbox API did not answer.');
      });
      return;
    }
    toast('ok', 'Account names saved on this iPad. Nothing was posted to QuickBooks.');
  }

  function money() {
    var fin = data.financials;
    var max = fin.categories[0].cents;
    var liveMoney = ui.liveBilling && ui.liveBilling.tiles
      ? '<div class="note">Sandbox billing summary. Charges are off. Collected ' + esc(uiLib.money(ui.liveBilling.tiles.collected.cents)) + '.</div>'
      : '';
    return '<h1>Financials &amp; Billing</h1>' + uiLib.liveNote(ui.liveNote) + liveMoney +
      '<p class="lede">Sample month unless a finance sign-in loaded the sandbox summary. Nothing is charged.</p>' +
      qboCard() +
      '<div class="note">' + esc(data.tuitionNote) + '</div>' +
      '<div class="tiles money-tiles"><div class="card"><div class="meta">Collected</div><div class="price">' + esc(uiLib.money(fin.collectedCents)) + '</div></div>' +
      '<div class="card"><div class="meta">Last month</div><div class="price">' + esc(uiLib.money(fin.lastMonthCents)) + '</div></div>' +
      '<div class="card"><div class="meta">Scheduled</div><div class="price">' + esc(uiLib.money(fin.scheduledCents)) + '</div></div>' +
      '<div class="card"><div class="meta">Past due</div><div class="price">' + esc(uiLib.money(fin.pastDueCents)) + '</div></div></div>' +
      '<h2>Income categories</h2>' + fin.categories.map(function (row) {
        return '<div class="card"><div class="split"><strong>' + esc(row.name) + '</strong><span class="tabular">' + esc(uiLib.money(row.cents)) + '</span></div><div class="bar"><span style="width:' + Math.round((row.cents / max) * 100) + '%"></span></div></div>';
      }).join('') +
      '<h2>Sold by</h2><div class="sold" role="table" aria-label="Sold by">' +
      '<div class="sold-row sold-head" role="row"><span role="columnheader">Name</span><span role="columnheader">Memberships</span><span role="columnheader">Amount</span></div>' +
      fin.soldBy.map(function (row) {
        return '<div class="sold-row" role="row"><span data-label="Name">' + esc(row.name) + '</span><span data-label="Memberships">' + esc(row.memberships) + '</span><span class="tabular" data-label="Amount">' + esc(uiLib.money(row.cents)) + '</span></div>';
      }).join('') + '</div>';
  }

  function inbox() {
    var changed = false;
    store.messages.forEach(function (row) {
      if (row.author === 'family' && !row.readByStaff) { row.readByStaff = true; changed = true; }
    });
    if (changed) save();
    var school = schoolId();
    return '<h1>Messages</h1><p class="lede">Family inbox for the sample studio. Toggles do not send email.</p>' +
      store.messages.map(function (row) {
        var label = row.author === 'studio' ? 'Studio' : 'Family';
        var read = row.author === 'studio' ? (row.readByFamily ? 'Read by the family' : 'Not read yet') : 'Read';
        return '<div class="card"><strong>' + esc(label) + '</strong><p>' + esc(row.body) + '</p><div class="meta">' + esc(read) + '</div></div>';
      }).join('') +
      '<label>Reply<textarea id="staff-draft">' + esc(ui.draft) + '</textarea></label>' +
      '<div class="chips">' + data.templates.map(function (row) {
        return '<button type="button" class="chip" data-act="template" data-id="' + esc(row.id) + '">' + esc(row.name) + '</button>';
      }).join('') + '</div>' +
      '<button type="button" class="big primary" data-act="reply">Send reply</button>' +
      '<h2>System emails · ' + esc(uiLib.school(school).name) + '</h2>' + schoolChips() +
      data.emailCodes.map(function (row) {
        var on = emailOn(school, row.code);
        return '<button type="button" class="rowbtn email-row" data-act="email" data-code="' + esc(row.code) + '"><span>' + esc(row.name) + '</span><span class="meta">' + (on ? 'On' : 'Off') + ' · tap to switch</span></button>';
      }).join('') +
      '<button type="button" class="textbtn" data-act="connect">Sandbox connection</button>';
  }

  function emailOn(school, code) {
    var bag = store.emailToggles[school] || {};
    return bag[code] !== false;
  }

  function connectSheet() {
    if (!ui.connect) return '';
    return '<div class="sheet"><div class="panel"><h2>Sandbox connection</h2><p class="lede">Use Demo or Live in the top bar. Live talks to the sandbox API. Charges stay off.</p>' +
      uiLib.signCard('staff') +
      '<div class="stack"><button type="button" class="big" data-act="connect-off">Use Demo</button>' +
      '<button type="button" class="big" data-act="reset">Reset sample data</button></div></div></div>';
  }

  function onClick(event) {
    var el = event.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'toast-off') { ui.toast = null; render(); return; }
    if (uiLib.handleAuthAct(act, function (tone, text) {
      if (tone === 'ok' && (act === 'auth-code' || act === 'auth-token' || act === 'sign-out')) pullLive();
      toast(tone, text);
    })) return;
    if (act === 'data-mode') {
      uiLib.setDataMode(el.getAttribute('data-mode'));
      ui.signOpen = false;
      pullLive();
      render();
      return;
    }
    if (act === 'sign-open') { ui.signOpen = true; render(); return; }
    if (act === 'today-view') {
      ui.todayView = el.getAttribute('data-view') === 'tasks' ? 'tasks' : 'desk';
      history.replaceState(null, '', ui.todayView === 'tasks' ? '#tasks' : '#today');
      render();
      return;
    }
    if (act === 'tab') {
      ui.tab = el.getAttribute('data-tab');
      ui.drawer = '';
      ui.toast = null;
      if (ui.tab === 'schedule') {
        var next = upcomingHere()[0];
        if (next) ui.day = next.date;
      }
      render();
      return;
    }
    if (act === 'school') { store.staffSchool = el.getAttribute('data-id'); save(); render(); return; }
    if (act === 'kiosk') {
      var cls = upcomingHere().filter(function (row) { return row.id === el.getAttribute('data-id'); })[0];
      if (!cls) return;
      store.kiosk = { classId: cls.id, title: cls.title, time: cls.time, locationId: cls.locationId };
      save();
      toast('ok', 'Kiosk locked on ' + cls.title + ' · ' + rules.prettyTime(cls.time) + '.');
      return;
    }
    if (act === 'kiosk-off') { store.kiosk = null; save(); toast('ok', 'Kiosk unlocked.'); return; }
    if (act === 'checkin') {
      var who = findPerson(el.getAttribute('data-id'));
      if (who.card === 'expired') { toast('bad', 'Card expired. Ask them to update the card before you check them in.'); return; }
      store.checkins.unshift({ personId: who.id, ok: true });
      save();
      if (uiLib.dataMode() !== 'live') { toast('ok', 'Checked in. ' + who.first + ' is here.'); return; }
      if (!uiLib.token()) { toast('ok', 'Checked in on this device. Sign in to record it on the sandbox.'); return; }
      uiLib.api('/v1/check-ins/family', {
        method: 'POST',
        body: { source: 'manual', familyId: who.familyId || '', locationId: who.school || schoolId() },
      }).then(function (res) {
        if (res.offline) toast('bad', 'Checked in on this device. The sandbox API is offline.');
        else if (!res.ok) toast('ok', 'Checked in on this device. The sandbox did not take this family. Nothing was charged.');
        else toast('ok', 'Checked in on the sandbox. Nothing was charged.');
      });
      return;
    }
    if (act === 'fulfill') { advance(el.getAttribute('data-id')); return; }
    if (act === 'filter') { ui.filter = el.getAttribute('data-id'); render(); return; }
    if (act === 'close') { ui.drawer = ''; render(); return; }
    if (act === 'pay-edit') { ui.editPay = true; render(); return; }
    if (act === 'pay-save') { savePay(); return; }
    if (act === 'pay-undo') { delete store.paymentPreview[ui.drawer]; ui.editPay = false; save(); toast('ok', 'Draft restored. Nothing was charged.'); return; }
    if (act === 'open') {
      ui.drawer = el.getAttribute('data-id');
      ui.editPay = false;
      var opened = findPerson(ui.drawer);
      render();
      if (opened.live && uiLib.token()) {
        uiLib.api('/v1/members/' + encodeURIComponent(opened.id) + '/notes').then(function (res) {
          if (!res.ok || !res.body || !res.body.notes || !res.body.notes.length) return;
          var pinned = res.body.notes.filter(function (row) { return row.pinned; })[0] || res.body.notes[0];
          opened.note = pinned.body;
          if (ui.drawer === opened.id) render();
        });
      }
      return;
    }
    if (act === 'book-next') {
      var who = findPerson(ui.drawer);
      store.bookings.push({ classId: el.getAttribute('data-id'), personId: who.id, status: 'booked' });
      save();
      if (uiLib.dataMode() === 'live' && uiLib.token()) {
        uiLib.api('/v1/sessions/' + encodeURIComponent(el.getAttribute('data-id')) + '/bookings', {
          method: 'POST',
          body: { memberId: who.id },
        }).then(function (res) {
          if (res.offline) toast('bad', 'Booked on this device. The sandbox API is offline.');
          else if (!res.ok) toast('ok', 'Booked on this device. The sandbox did not take this class. Nothing was charged.');
          else toast('ok', 'Booked on the sandbox. Nothing was charged.');
        });
        return;
      }
      toast('ok', 'Booked. ' + who.first + ' is in that class.');
      return;
    }
    if (act === 'view') { ui.view = el.getAttribute('data-view'); render(); return; }
    if (act === 'pick-day') { ui.day = el.getAttribute('data-date'); ui.view = 'day'; render(); return; }
    if (act === 'duplicate') { duplicate(el.getAttribute('data-id')); return; }
    if (act === 'add-event') { addEvent(); return; }
    if (act === 'template') {
      var template = data.templates.filter(function (row) { return row.id === el.getAttribute('data-id'); })[0];
      ui.draft = template ? template.body : '';
      render();
      return;
    }
    if (act === 'reply') {
      var text = (document.getElementById('staff-draft').value || '').trim();
      if (!text) { toast('bad', 'Write a reply first.'); return; }
      store.messages.push({ id: 'm' + Date.now(), author: 'studio', body: text, readByFamily: false, readByStaff: true });
      ui.draft = '';
      save();
      toast('ok', 'Reply saved in this preview. Delivery is off.');
      return;
    }
    if (act === 'email') {
      var code = el.getAttribute('data-code');
      var school = schoolId();
      store.emailToggles[school] = store.emailToggles[school] || {};
      store.emailToggles[school][code] = !emailOn(school, code);
      save();
      toast('ok', 'Saved for this preview. No email was sent.');
      return;
    }
    if (act === 'connect') { ui.connect = true; render(); return; }
    if (act === 'connect-off') { uiLib.setDataMode('demo'); ui.connect = false; ui.liveMembers = null; toast('ok', 'Back on Demo. The sample studio stays on this device.'); return; }
    if (act === 'clock') { clockShift(); return; }
    if (act === 'break') { toggleBreak(); return; }
    if (act === 'payroll') { exportPayroll(); return; }
    if (act === 'task-toggle') { toggleTask(el.getAttribute('data-id')); return; }
    if (act === 'task-add') { addOneOff(); return; }
    if (act === 'reset') { store = uiLib.reset(); ui.connect = false; ui.drawer = ''; toast('ok', 'Sample data is fresh.'); return; }
    if (act === 'qbo-entity') { ui.qboEntity = el.getAttribute('data-id'); ui.qboRemote = null; ui.qboLiveKey = ''; render(); return; }
    if (act === 'qbo-period') {
      ui.qboPeriod = el.getAttribute('data-id');
      ui.qboRemote = null;
      ui.qboLiveKey = '';
      if (ui.qboPeriod === 'custom' && !ui.qboFrom) {
        ui.qboFrom = store.today.slice(0, 8) + '01';
        ui.qboThrough = store.today;
      }
      render();
      return;
    }
    if (act === 'qbo-csv') { qboDownload('csv'); return; }
    if (act === 'qbo-journal') { qboDownload('journal'); return; }
    if (act === 'qbo-map') { ui.qboMap = true; ui.qboDraft = null; ui.qboMapError = ''; ui.drawer = ''; render(); return; }
    if (act === 'qbo-map-close') { ui.qboMap = false; ui.qboDraft = null; ui.qboMapError = ''; render(); return; }
    if (act === 'qbo-map-save') { saveQboMap(); return; }
    if (act === 'qbo-map-reset') {
      try { localStorage.removeItem('lvlupQboMapV1'); } catch (err) { /* ignore */ }
      ui.qboDraft = null;
      ui.qboMapError = '';
      ui.qboLiveKey = '';
      toast('ok', 'Suggested account names are back. Nothing was posted to QuickBooks.');
      return;
    }
  }

  function savePay() {
    var raw = Number(document.getElementById('pay-amt').value);
    if (!raw || raw < 0) { toast('bad', 'Enter a draft amount.'); return; }
    store.paymentPreview[ui.drawer] = Math.round(raw * 100);
    ui.editPay = false;
    save();
    toast('ok', 'Draft updated in this preview. Nothing was charged.');
  }

  function advance(id) {
    var order = store.orders.filter(function (row) { return row.id === id; })[0];
    if (!order) return;
    var next = rules.nextFulfillmentStatus(order.fulfillmentMethod, order.fulfillmentStatus);
    if (!next) return;
    if (next === 'shipped') {
      var box = document.getElementById('track-' + id);
      var tracking = box ? box.value.trim() : '';
      if (tracking) order.trackingNumber = tracking;
    }
    order.fulfillmentStatus = next;
    save();
    if (uiLib.dataMode() === 'live' && uiLib.token() && /^[0-9a-f-]{36}$/i.test(order.id)) {
      uiLib.api('/v1/pro-shop/orders/' + order.id + '/fulfillment', {
        method: 'PATCH',
        body: { status: next, trackingNumber: order.trackingNumber || null },
      }).then(function (res) {
        if (res.offline) toast('bad', 'Updated on this device. The sandbox API is offline.');
        else if (!res.ok) toast('ok', rules.orderStatusLabel(order, uiLib.names()) + ' The sandbox copy was left as it was. Nothing was charged.');
        else toast('ok', (res.body && res.body.statusLabel) || rules.orderStatusLabel(order, uiLib.names()));
      });
      return;
    }
    var offline = uiLib.dataMode() === 'live' && !uiLib.token() ? ' Sign in to update the sandbox copy.' : '';
    toast('ok', rules.orderStatusLabel(order, uiLib.names()) + offline);
  }

  function duplicate(id) {
    var monday = rules.mondayOf(ui.day);
    var all = rules.classesForWeek(monday).concat(store.duplicated || []);
    var cls = all.filter(function (row) { return row.id === id; })[0];
    if (!cls) return;
    store.duplicated.push({
      id: id + '-copy-' + Date.now(),
      date: rules.addDays(cls.date, 7),
      time: cls.time,
      title: cls.title,
      program: cls.program,
      belts: cls.belts,
      locationId: cls.locationId,
      capacity: cls.capacity,
      booked: 0,
    });
    save();
    toast('ok', 'Copied. The new class has no bookings.');
  }

  function addEvent() {
    var name = (document.getElementById('event-name').value || '').trim();
    var date = document.getElementById('event-date').value;
    var type = document.getElementById('event-type').value;
    if (!name || !date) { toast('bad', 'Add a name and a date.'); return; }
    ui.eventName = '';
    ui.eventDate = date;
    store.extraEvents.push({ id: 'ev-' + Date.now(), type: type, title: name, date: date, time: '6:00 PM', locationId: schoolId(), blurb: 'Added from the front desk preview.' });
    save();
    toast('ok', 'Event added. It also shows on the member Events page.');
  }

  function initialsOf() {
    var box = document.getElementById('desk-initials');
    var initials = ((box && box.value) || deskState().initials || '').trim().toUpperCase();
    if (!/^[A-Z]{1,4}$/.test(initials)) return '';
    deskState().initials = initials;
    return initials;
  }

  function postClock(action, punch) {
    var initials = initialsOf();
    if (!initials) { toast('bad', 'Add 1 to 4 initials first.'); return; }
    var at = new Date().toISOString();
    var next = localClock(punch, action, initials, at);
    if (!next) return;
    deskState().punch = next.punch;
    if (next.closed) deskState().history.unshift(next.closed);
    save();
    if (uiLib.dataMode() !== 'live' || !uiLib.token()) {
      toast('ok', next.message + (uiLib.dataMode() === 'live' ? ' Sign in to record it on the sandbox.' : ''));
      return;
    }
    uiLib.api('/v1/desk/clock', {
      method: 'POST',
      body: { action: action, locationId: schoolId(), initials: initials, at: at, punch: punch },
    }).then(function (res) {
      if (res.ok && res.body && res.body.punch) {
        deskState().punch = res.body.punch.outAt ? null : res.body.punch;
        save();
        toast('ok', next.message + ' Sandbox confirmed. Nothing was charged.');
      } else if (res.offline) toast('bad', next.message + ' The sandbox API is offline.');
      else toast('ok', next.message + ' Saved on this device. The sandbox did not store it.');
    });
  }

  function localClock(punch, action, initials, at) {
    if (action === 'in') {
      if (punch && !punch.outAt) { toast('bad', 'Clock out before starting another shift.'); return null; }
      return {
        punch: { locationId: schoolId(), initials: initials, inAt: at, outAt: null, onBreak: false, breakStartedAt: null, breakMinutes: 0 },
        message: 'Clocked in at ' + uiLib.school(schoolId()).name + '.',
      };
    }
    if (!punch || punch.outAt) { toast('bad', 'Clock in first.'); return null; }
    if (action === 'break_start') {
      if (punch.onBreak) { toast('bad', 'You are already on break.'); return null; }
      return { punch: Object.assign({}, punch, { onBreak: true, breakStartedAt: at }), message: 'Break started.' };
    }
    if (action === 'break_end') {
      if (!punch.onBreak) { toast('bad', 'You are not on break.'); return null; }
      var extra = Math.max(0, Math.round((Date.parse(at) - Date.parse(punch.breakStartedAt)) / 60000));
      return { punch: Object.assign({}, punch, { onBreak: false, breakStartedAt: null, breakMinutes: (punch.breakMinutes || 0) + extra }), message: 'Break ended.' };
    }
    var closed = Object.assign({}, punch, { outAt: at, onBreak: false });
    if (punch.onBreak && punch.breakStartedAt) {
      closed.breakMinutes = (punch.breakMinutes || 0) + Math.max(0, Math.round((Date.parse(at) - Date.parse(punch.breakStartedAt)) / 60000));
      closed.breakStartedAt = null;
    }
    closed.date = chicagoDate(punch.inAt);
    return { punch: null, closed: closed, message: 'Clocked out. Hours stay a preview.' };
  }

  function clockShift() {
    var punch = deskState().punch;
    postClock(punch && !punch.outAt ? 'out' : 'in', punch && !punch.outAt ? punch : null);
  }

  function toggleBreak() {
    var punch = deskState().punch;
    if (!punch || punch.outAt) { toast('bad', 'Clock in first.'); return; }
    postClock(punch.onBreak ? 'break_end' : 'break_start', punch);
  }

  function exportPayroll() {
    var rows = hoursInPeriod();
    if (!rows.length) { toast('bad', 'No finished shifts in this pay period yet.'); return; }
    function finish(csv, extra) {
      downloadCsv(csv);
      toast('ok', 'Payroll preview downloaded. QuickBooks was not updated.' + (extra || ''));
    }
    if (uiLib.dataMode() !== 'live' || !uiLib.token()) {
      finish(localPayrollCsv(rows), uiLib.dataMode() === 'live' ? ' Sign in to confirm it with the sandbox.' : '');
      return;
    }
    uiLib.api('/v1/desk/payroll/preview', {
      method: 'POST',
      body: {
        locationId: schoolId(),
        asOf: store.today,
        rows: rows.filter(function (row) { return row.locationId === schoolId(); }).map(function (row) {
          return { date: row.date || chicagoDate(row.inAt), initials: row.initials, locationId: row.locationId, inAt: row.inAt, outAt: row.outAt, breakMinutes: row.breakMinutes || 0 };
        }),
      },
    }).then(function (res) {
      if (res.ok && res.body && res.body.csv && res.body.charged === false && res.body.qbo === '0') finish(res.body.csv, ' Sandbox confirmed the dry run.');
      else if (res.offline) finish(localPayrollCsv(rows), ' The sandbox API is offline.');
      else finish(localPayrollCsv(rows), ' The sandbox did not build the file, so this copy stayed on the device.');
    });
  }

  function toggleTask(id) {
    var initials = initialsOf();
    if (!initials) { toast('bad', 'Add 1 to 4 initials first.'); return; }
    var bag = deskState().done[schoolId()];
    var done = !bag[id];
    if (done) bag[id] = { at: new Date().toISOString(), initials: initials };
    else delete bag[id];
    save();
    if (uiLib.dataMode() !== 'live' || !uiLib.token()) {
      toast('ok', done ? 'Marked complete on this device.' : 'Cleared on this device.');
      return;
    }
    uiLib.api('/v1/desk/tasks', {
      method: 'POST',
      body: { action: done ? 'complete' : 'reopen', locationId: schoolId(), taskId: id, initials: initials },
    }).then(function (res) {
      if (res.offline) toast('bad', 'Saved on this device. The sandbox API is offline.');
      else if (!res.ok) toast('ok', 'Saved on this device. The sandbox did not store this check.');
      else toast('ok', 'Saved. Nothing was charged.');
    });
  }

  function addOneOff() {
    var initials = initialsOf();
    var title = (document.getElementById('one-title').value || '').trim();
    var phase = document.getElementById('one-phase').value;
    if (!initials) { toast('bad', 'Add 1 to 4 initials first.'); return; }
    if (title.length < 2) { toast('bad', 'Name the task in a short sentence.'); return; }
    var row = { id: 'extra-' + Date.now().toString(36), locationId: schoolId(), phase: phase, title: title };
    deskState().extras.push(row);
    ui.oneTitle = '';
    ui.onePhase = phase;
    save();
    if (uiLib.dataMode() !== 'live' || !uiLib.token()) {
      toast('ok', 'Task added on this device.');
      return;
    }
    uiLib.api('/v1/desk/tasks', {
      method: 'POST',
      body: { action: 'add', locationId: schoolId(), phase: phase, title: title, initials: initials },
    }).then(function (res) {
      if (res.ok && res.body && res.body.id) {
        row.id = res.body.id;
        save();
        toast('ok', 'Task added. Nothing was charged.');
      } else if (res.offline) toast('bad', 'Task added on this device. The sandbox API is offline.');
      else toast('ok', 'Task added on this device. The sandbox did not store it.');
    });
  }

  function mapMember(row) {
    return {
      id: row.id,
      first: row.firstName || 'Member',
      last: row.lastName || '',
      role: 'student',
      program: row.planName || 'Member',
      belt: 'Member',
      beltRank: 'color',
      stripes: 0,
      stripesNeed: 1,
      school: row.locationId || schoolId(),
      plan: row.planName || 'Membership',
      planCents: row.amountCents || 0,
      status: row.status || 'active',
      tag: row.status || 'Active',
      soldBy: 'Sandbox',
      card: 'ok',
      note: '',
      familyId: row.familyId || '',
      live: true,
    };
  }

  function pullLive() {
    if (uiLib.dataMode() !== 'live') {
      ui.liveNote = '';
      ui.liveMembers = null;
      ui.liveBilling = null;
      ui.liveShifts = null;
      return;
    }
    ui.liveNote = 'Connecting to the live sandbox…';
    uiLib.api('/v1/health').then(function (res) {
      if (res.offline) ui.liveNote = 'The sandbox API is offline. Showing the sample studio. Nothing was charged.';
      else if (res.ok && res.body && res.body.charges === false) ui.liveNote = 'Live sandbox. Charges are off.';
      else ui.liveNote = 'The sandbox answered in an unexpected way. This desk will not send a charge.';
      render();
    });
    uiLib.api('/v1/pro-shop/items').then(function (res) {
      if (res.ok && res.body && res.body.charges === false && res.body.items) {
        ui.liveNote = 'Live sandbox catalog. Charges are off.';
        render();
      }
    });
    if (!uiLib.token()) return;
    uiLib.api('/v1/members?locationId=' + encodeURIComponent(schoolId())).then(function (res) {
      if (res.ok && res.body && res.body.members) {
        ui.liveMembers = res.body.members.map(mapMember);
        render();
      } else if (res.status === 401 || res.status === 403) {
        ui.liveMembers = null;
        ui.liveNote = 'Sign in was not accepted for the roster. The sample studio stays. Nothing was charged.';
        render();
      }
    });
    uiLib.api('/v1/pro-shop/orders').then(function (res) {
      if (!res.ok || !res.body || !res.body.orders) return;
      res.body.orders.forEach(function (order) {
        if (store.orders.some(function (row) { return row.id === order.id; })) return;
        store.orders.push({
          id: order.id,
          personId: order.memberId,
          lines: order.lines || [],
          fulfillmentMethod: order.fulfillmentMethod,
          pickupLocationId: order.pickupLocationId,
          shippingAddress: order.shippingAddress,
          shippingCents: order.shippingCents || 0,
          trackingNumber: order.trackingNumber,
          fulfillmentStatus: order.fulfillmentStatus,
          subtotalCents: order.subtotalCents || 0,
          totalCents: order.totalCents || 0,
          live: true,
        });
      });
      save();
      render();
    });
    uiLib.api('/v1/staff-schedule').then(function (res) {
      if (res.ok && res.body && res.body.shifts) { ui.liveShifts = res.body.shifts; render(); }
    });
    uiLib.api('/v1/financials/summary?scope=all&period=month').then(function (res) {
      if (res.ok && res.body && res.body.tiles) { ui.liveBilling = res.body; render(); }
      else if (res.status === 403) ui.liveBilling = null;
    });
    uiLib.api('/v1/desk/tasks?locationId=' + encodeURIComponent(schoolId())).then(function (res) {
      if (res.status === 404) ui.liveNote = 'Live sandbox is up. Task sync arrives with the next API deploy. Checks stay on this device. Charges are off.';
    });
  }

  document.getElementById('app').addEventListener('click', onClick);
  document.getElementById('app').addEventListener('input', function (event) {
    if (event.target.id === 'people-q' || event.target.id === 'checkin-q') {
      ui.query = event.target.value;
      render();
      var box = document.getElementById(event.target.id);
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    }
    if (event.target.id === 'staff-draft') ui.draft = event.target.value;
    if (event.target.id === 'event-name') ui.eventName = event.target.value;
    if (event.target.id === 'desk-initials') deskState().initials = event.target.value;
    if (event.target.id === 'one-title') ui.oneTitle = event.target.value;
    if (event.target.id === 'one-phase') ui.onePhase = event.target.value;
  });
  document.getElementById('app').addEventListener('change', function (event) {
    if (event.target.id === 'qbo-from' || event.target.id === 'qbo-through') {
      ui.qboFrom = (document.getElementById('qbo-from') || {}).value || '';
      ui.qboThrough = (document.getElementById('qbo-through') || {}).value || '';
      ui.qboRemote = null;
      ui.qboLiveKey = '';
      ui.qboLiveError = '';
      render();
    }
  });
  window.addEventListener('storage', function () { store = uiLib.load(); render(); });
  setInterval(function () {
    var el = document.getElementById('shift-elapsed');
    var punch = store.desk && store.desk.punch;
    if (!el || !punch || punch.outAt) return;
    el.textContent = formatElapsed(elapsedMs(punch, Date.now()));
  }, 1000);
  if (uiLib.dataMode() === 'live') pullLive();
  render();
})();
