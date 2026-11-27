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
  };

  var TABS = [
    ['today', 'Today'],
    ['people', 'Members & Leads'],
    ['schedule', 'Schedule & Events'],
    ['money', 'Financials & Billing'],
    ['inbox', 'Messages & Automations'],
  ];

  function save() { uiLib.save(store); }
  function toast(tone, text) { ui.toast = { tone: tone, text: text }; render(); }
  function schoolId() { return store.staffSchool || 'waunakee'; }

  function render() {
    document.getElementById('app').innerHTML =
      uiLib.header('staff') +
      '<main class="main staff-main">' +
      '<div class="tabs" role="tablist" aria-label="Front desk">' + TABS.map(function (tab) {
        return '<button type="button" class="chip' + (ui.tab === tab[0] ? ' on' : '') + '" data-act="tab" data-tab="' + tab[0] + '">' + esc(tab[1]) + '</button>';
      }).join('') + '</div>' +
      uiLib.toast(ui.toast) +
      screen() +
      '</main>' + connectSheet() + drawer();
  }

  function screen() {
    if (ui.tab === 'people') return people();
    if (ui.tab === 'schedule') return schedule();
    if (ui.tab === 'money') return money();
    if (ui.tab === 'inbox') return inbox();
    return today();
  }

  function schoolChips() {
    return '<div class="chips" aria-label="School">' + data.schools.map(function (row) {
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

  function today() {
    var todayRows = classesHere(store.today);
    var rows = todayRows.length ? todayRows : upcomingHere().slice(0, 1);
    var heading = todayRows.length ? 'Classes' : 'Next class';
    var locked = store.kiosk && store.kiosk.locationId === schoolId();
    var place = uiLib.school(schoolId());
    var where = place.id === 'eastmad' ? place.name + ' · ' + place.city : place.name;
    return '<h1>Today</h1><p class="lede">' + esc(where) + '. Start here.</p>' +
      schoolChips() +
      '<h2>' + heading + '</h2>' + (rows.length ? rows.map(function (cls) {
        var isLocked = locked && store.kiosk.classId === cls.id;
        return '<div class="card"><h3>' + esc(cls.title) + '</h3><div>' + esc(rules.prettyDate(cls.date) + ' · ' + rules.prettyTime(cls.time) + ' · ' + cls.program) + '</div>' +
          (isLocked
            ? '<div class="note">Kiosk locked on ' + esc(cls.title) + ' · ' + esc(rules.prettyTime(cls.time)) + '.</div><button type="button" class="big" data-act="kiosk-off">Unlock kiosk</button>'
            : '<button type="button" class="big primary" data-act="kiosk" data-id="' + esc(cls.id) + '">Lock kiosk on this class</button>') +
          '</div>';
      }).join('') : '<div class="card"><p>No classes at this school today. Check the schedule for the week.</p></div>') +
      '<h2>Quick check-in</h2><label>Name<input id="checkin-q" placeholder="Riley" value="' + esc(ui.query) + '"></label>' +
      '<div class="stack">' + checkinRows() + '</div>' +
      '<h2>Pro Shop pickup queue</h2>' + queue('studio_pickup') +
      '<h2>Shipping</h2>' + queue('ship_to_home');
  }

  function checkinRows() {
    var q = ui.query.trim().toLowerCase();
    var rows = uiLib.people().filter(function (row) {
      if (row.role === 'parent') return false;
      if (row.school !== schoolId() && q) return (row.first + ' ' + row.last).toLowerCase().indexOf(q) >= 0;
      if (row.school !== schoolId()) return false;
      if (!q) return true;
      return (row.first + ' ' + row.last).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 6);
    if (!rows.length) return '<div class="toast bad" role="alert">No one matches that.</div>';
    return rows.map(function (row) {
      var dot = row.card === 'expired' ? '<span class="dot hot"></span> ' : '';
      return '<button type="button" class="rowbtn" data-act="checkin" data-id="' + esc(row.id) + '">' + dot + 'Check in ' + esc(row.first + ' ' + row.last) + '<span class="meta">' + esc(row.belt + ' · ' + row.plan) + '</span></button>';
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
      return '<div class="card"><strong>' + esc(rules.orderStatusLabel(order, uiLib.names())) + '</strong><div class="meta">' + esc(who.first + ' · ' + (order.lines[0] ? order.lines[0].name : 'Item')) + '</div>' +
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
        return '<button type="button" class="rowbtn" data-act="open" data-id="' + esc(row.id) + '"><strong>' + esc(row.first + ' ' + row.last) + '</strong><span class="meta">' + esc(row.belt + ' · ' + row.tag + ' · ' + uiLib.school(row.school).name) + '</span></button>';
      }).join('') + '</div>';
  }

  function chip(id, label) {
    return '<button type="button" class="chip' + (ui.filter === id ? ' on' : '') + '" data-act="filter" data-id="' + id + '">' + esc(label) + '</button>';
  }

  function filtered() {
    var q = ui.query.trim().toLowerCase();
    return uiLib.people().filter(function (row) {
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
    var who = uiLib.person(ui.drawer);
    var contacts = store.contacts.filter(function (row) { return row.personId === who.id; });
    var cents = store.paymentPreview[who.id] != null ? store.paymentPreview[who.id] : who.planCents;
    var pay = ui.editPay
      ? '<label>Draft amount, dollars<input id="pay-amt" inputmode="decimal" value="' + esc((cents / 100).toFixed(2)) + '"></label><button type="button" class="big primary" data-act="pay-save">Save preview</button>'
      : '<div class="split"><div><div class="meta">Upcoming draft</div><strong>' + esc(uiLib.money(cents)) + '</strong></div><button type="button" class="ghost" data-act="pay-edit">Edit</button></div>' +
        (store.paymentPreview[who.id] != null ? '<button type="button" class="textbtn" data-act="pay-undo">Undo</button>' : '');
    var next = nextClassFor(who);
    return '<div class="drawer"><div class="panel"><button type="button" class="textbtn" data-act="close">Close</button>' +
      '<h1>' + esc(who.first + ' ' + who.last) + '</h1><p class="lede">' + esc(who.program + ' · ' + uiLib.school(who.school).name) + '</p>' +
      '<div class="note">Pinned note · ' + esc(who.note) + '</div>' +
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
    return '<h1>Schedule &amp; Events</h1><p class="lede">' + esc(uiLib.school(schoolId()).name) + '</p>' + schoolChips() +
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

  function money() {
    var fin = data.financials;
    var max = fin.categories[0].cents;
    return '<h1>Financials</h1><p class="lede">Sample month. Not a live account. Nothing is charged.</p>' +
      '<div class="note">' + esc(data.tuitionNote) + '</div>' +
      '<div class="tiles"><div class="card"><div class="meta">Collected</div><div class="price">' + esc(uiLib.money(fin.collectedCents)) + '</div></div>' +
      '<div class="card"><div class="meta">Last month</div><div class="price">' + esc(uiLib.money(fin.lastMonthCents)) + '</div></div>' +
      '<div class="card"><div class="meta">Scheduled</div><div class="price">' + esc(uiLib.money(fin.scheduledCents)) + '</div></div>' +
      '<div class="card"><div class="meta">Past due</div><div class="price">' + esc(uiLib.money(fin.pastDueCents)) + '</div></div></div>' +
      '<h2>Income categories</h2>' + fin.categories.map(function (row) {
        return '<div class="card"><div class="split"><strong>' + esc(row.name) + '</strong><span>' + esc(uiLib.money(row.cents)) + '</span></div><div class="bar"><span style="width:' + Math.round((row.cents / max) * 100) + '%"></span></div></div>';
      }).join('') +
      '<h2>Sold by</h2><table><tr><th>Name</th><th>Memberships</th><th>Amount</th></tr>' + fin.soldBy.map(function (row) {
        return '<tr><td>' + esc(row.name) + '</td><td>' + esc(row.memberships) + '</td><td>' + esc(uiLib.money(row.cents)) + '</td></tr>';
      }).join('') + '</table>';
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
        return '<button type="button" class="rowbtn" data-act="email" data-code="' + esc(row.code) + '">' + esc(row.name) + '<span class="meta">' + (on ? 'On' : 'Off') + ' · tap to switch</span></button>';
      }).join('') +
      '<button type="button" class="textbtn" data-act="connect">Sandbox connection</button>';
  }

  function emailOn(school, code) {
    var bag = store.emailToggles[school] || {};
    return bag[code] !== false;
  }

  function connectSheet() {
    if (!ui.connect) return '';
    return '<div class="sheet"><div class="panel"><h2>Sandbox connection</h2><p class="lede">The desk runs on sample data with no sign-in. Paste the sandbox API only if you want the live catalog.</p>' +
      '<div class="stack"><label>API address<input id="api-base" value="' + esc(uiLib.apiBase() || data.apiDefault) + '"></label>' +
      '<label>Token, optional<input id="api-token" type="password" autocomplete="off"></label>' +
      '<button type="button" class="big primary" data-act="connect-save">Save connection</button>' +
      '<button type="button" class="big" data-act="connect-off">Stay in preview</button>' +
      '<button type="button" class="big" data-act="reset">Reset sample data</button></div></div></div>';
  }

  function onClick(event) {
    var el = event.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'toast-off') { ui.toast = null; render(); return; }
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
      var who = uiLib.person(el.getAttribute('data-id'));
      if (who.card === 'expired') { toast('bad', 'Card expired. Ask them to update the card before you check them in.'); return; }
      store.checkins.unshift({ personId: who.id, ok: true });
      save();
      toast('ok', 'Checked in. ' + who.first + ' is here.');
      return;
    }
    if (act === 'fulfill') { advance(el.getAttribute('data-id')); return; }
    if (act === 'filter') { ui.filter = el.getAttribute('data-id'); render(); return; }
    if (act === 'open') { ui.drawer = el.getAttribute('data-id'); ui.editPay = false; render(); return; }
    if (act === 'close') { ui.drawer = ''; render(); return; }
    if (act === 'pay-edit') { ui.editPay = true; render(); return; }
    if (act === 'pay-save') { savePay(); return; }
    if (act === 'pay-undo') { delete store.paymentPreview[ui.drawer]; ui.editPay = false; save(); toast('ok', 'Draft restored. Nothing was charged.'); return; }
    if (act === 'book-next') {
      var who = uiLib.person(ui.drawer);
      store.bookings.push({ classId: el.getAttribute('data-id'), personId: who.id, status: 'booked' });
      save();
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
    if (act === 'connect-off') { uiLib.setApi('', ''); ui.connect = false; toast('ok', 'Staying in the sample studio.'); return; }
    if (act === 'connect-save') {
      uiLib.setApi(document.getElementById('api-base').value.trim(), document.getElementById('api-token').value.trim());
      ui.connect = false;
      toast('ok', 'Connection saved in this browser tab. The desk still shows sample people.');
      return;
    }
    if (act === 'reset') { store = uiLib.reset(); ui.connect = false; ui.drawer = ''; toast('ok', 'Sample data is fresh.'); return; }
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
    toast('ok', rules.orderStatusLabel(order, uiLib.names()));
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
  });
  window.addEventListener('storage', function () { store = uiLib.load(); render(); });
  render();
})();
