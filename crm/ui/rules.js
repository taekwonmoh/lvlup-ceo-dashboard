/* Shared preview rules. No network. No card numbers. No phone numbers. */
(function (root) {
  var THEMES = ['Discipline', 'Belief', 'Communication', 'Respect', 'Self-Esteem', 'Honesty'];
  var VIMEO = 'https://player.vimeo.com/video/76979871?badge=0&autopause=0&player_id=0&texttrack=false';
  var PICKUP = ['ordered', 'ready_for_pickup', 'picked_up'];
  var SHIP = ['ordered', 'packed', 'shipped', 'delivered'];

  function addDays(iso, days) {
    var parts = String(iso).split('-').map(Number);
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  function chicagoToday(now) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now || new Date());
    } catch (err) {
      return (now || new Date()).toISOString().slice(0, 10);
    }
  }

  function mondayOf(iso) {
    var parts = String(iso).split('-').map(Number);
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    var day = dt.getUTCDay();
    var delta = day === 0 ? -6 : 1 - day;
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  function nextWeekday(iso, weekday) {
    var parts = String(iso).split('-').map(Number);
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    var day = dt.getUTCDay();
    var delta = (weekday - day + 7) % 7;
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  function prettyDate(iso) {
    var parts = String(iso).split('-').map(Number);
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dt);
  }

  function prettyTime(hhmm) {
    var raw = String(hhmm || '');
    if (/[ap]m/i.test(raw)) return raw;
    var bits = raw.split(':');
    var h = Number(bits[0]);
    var min = bits[1] || '00';
    var suffix = h >= 12 ? 'PM' : 'AM';
    var hour = h % 12 || 12;
    return hour + ':' + min + ' ' + suffix;
  }

  function cycleTheme(iso) {
    var start = Date.parse('2026-10-19T00:00:00Z');
    var day = Date.parse(String(iso) + 'T00:00:00Z');
    var elapsed = Math.floor((day - start) / 86400000);
    var index = 5;
    if (elapsed >= 0) index = (5 + Math.floor(elapsed / 56)) % 6;
    else index = (5 - (Math.ceil((-elapsed) / 56) % 6) + 6) % 6;
    return THEMES[index];
  }

  function nextFulfillmentStatus(method, status) {
    var flow = method === 'studio_pickup' ? PICKUP : SHIP;
    var index = flow.indexOf(status);
    if (index < 0 || index >= flow.length - 1) return null;
    return flow[index + 1];
  }

  function actionLabel(status) {
    var labels = {
      ready_for_pickup: 'Mark Ready',
      picked_up: 'Handed to Family',
      packed: 'Mark Packed',
      shipped: 'Mark Shipped',
      delivered: 'Mark Delivered',
    };
    return labels[status] || 'Update';
  }

  function orderStatusLabel(order, names) {
    names = names || {};
    if (order.fulfillmentMethod === 'studio_pickup') {
      var place = names[order.pickupLocationId] || 'the studio';
      if (order.fulfillmentStatus === 'ready_for_pickup') return 'Ready for pickup at ' + place;
      if (order.fulfillmentStatus === 'picked_up') return 'Picked up at ' + place;
      return 'Ordered for pickup at ' + place;
    }
    if (order.fulfillmentStatus === 'packed') return 'Packed';
    if (order.fulfillmentStatus === 'shipped') return order.trackingNumber ? 'Shipped · ' + order.trackingNumber : 'Shipped';
    if (order.fulfillmentStatus === 'delivered') return 'Delivered';
    return 'Ordered';
  }

  function classFits(person, cls) {
    if (!person || person.role === 'parent') return false;
    if (person.program === 'Go Ninja') return cls.program === 'Go Ninja';
    if (cls.program !== 'Taekwondo') return false;
    if (cls.belts === 'black' && person.beltRank !== 'black') return false;
    return true;
  }

  function seatsLeft(cls, bookings) {
    var extra = (bookings || []).filter(function (row) {
      return row.classId === cls.id && row.status === 'booked';
    }).length;
    return cls.capacity - cls.booked - extra;
  }

  function claimPartySlot(booked, request) {
    var key = request.locationId + '|' + request.date + '|' + request.time;
    var taken = (booked || []).some(function (row) {
      return row.locationId + '|' + row.date + '|' + row.time === key && row.status !== 'cancelled';
    });
    if (taken) return { ok: false, reason: 'That time is already booked. Pick another time.' };
    return { ok: true, key: key };
  }

  function classesForWeek(monday) {
    function on(offset) { return addDays(monday, offset); }
    return [
      { id: 'color-' + monday, date: on(0), time: '16:30', title: 'Color belts', program: 'Taekwondo', belts: 'color', locationId: 'waunakee', capacity: 16, booked: 9 },
      { id: 'spar-' + monday, date: on(1), time: '17:15', title: 'Sparring', program: 'Taekwondo', belts: 'color', locationId: 'waunakee', capacity: 12, booked: 12 },
      { id: 'black-' + monday, date: on(2), time: '18:30', title: 'Black belt class', program: 'Taekwondo', belts: 'black', locationId: 'waunakee', capacity: 10, booked: 4 },
      { id: 'forms-' + monday, date: on(4), time: '16:30', title: 'Forms', program: 'Taekwondo', belts: 'color', locationId: 'waunakee', capacity: 16, booked: 8 },
      { id: 'family-' + monday, date: on(5), time: '10:00', title: 'Family class', program: 'Taekwondo', belts: 'all', locationId: 'waunakee', capacity: 20, booked: 6 },
      { id: 'ninja-' + monday, date: on(4), time: '16:00', title: 'Ninja training', program: 'Go Ninja', belts: 'all', locationId: 'goninjaW', capacity: 14, booked: 7 },
      { id: 'open-' + monday, date: on(5), time: '11:00', title: 'Open gym', program: 'Go Ninja', belts: 'all', locationId: 'goninjaW', capacity: 18, booked: 4 },
    ];
  }

  function videosFor(person, theme) {
    if (!person || person.role === 'parent') return [];
    if (person.program === 'Go Ninja') {
      return [
        { id: 'move', title: theme + ' movement', meta: person.belt + ' belt · sample' },
        { id: 'balance', title: theme + ' balance', meta: person.belt + ' belt · sample' },
      ];
    }
    return [
      { id: 'form', title: person.belt + ' form · ' + theme, meta: 'Practice at home' },
      { id: 'kick', title: person.belt + ' kicks · ' + theme, meta: 'Practice at home' },
      { id: 'step', title: person.belt + ' one-step · ' + theme, meta: 'Practice at home' },
    ];
  }

  var EVENT_LABELS = {
    summer_camp: 'Summer Camp',
    pno: "Parents' Night Out",
    belt_test: 'Belt test',
    clinic: 'Clinic',
    tournament: 'Tournament',
    party: 'Party',
    seminar: 'Seminar',
    other: 'Other',
  };

  function isGoNinjaLocation(locationId) {
    return locationId === 'goninjaW' || locationId === 'goninjaV';
  }

  function normalizeEventType(value) {
    var text = String(value || '').toLowerCase().replace(/['’]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (text === 'camp' || text === 'summer camp' || text === 'summercamp') return 'summer_camp';
    if (text === 'pno' || text === 'parents night out' || text === 'parents night') return 'pno';
    if (text === 'belt test' || text === 'belttest') return 'belt_test';
    if (text === 'clinic') return 'clinic';
    if (text === 'tournament') return 'tournament';
    if (text === 'party') return 'party';
    if (text === 'seminar') return 'seminar';
    return 'other';
  }

  function defaultShowInLvlupMemberPortal(locationId, eventType) {
    var kind = normalizeEventType(eventType);
    return isGoNinjaLocation(locationId) && (kind === 'summer_camp' || kind === 'pno');
  }

  function visibleToBrands(locationId, show) {
    if (isGoNinjaLocation(locationId)) return show ? ['goninja', 'lvlup'] : ['goninja'];
    return ['lvlup'];
  }

  function isCrossBrandLvlupOffer(event) {
    return !!(event && isGoNinjaLocation(event.locationId) && event.showInLvlupMemberPortal === true);
  }

  function decorateEvent(raw) {
    var eventType = normalizeEventType(raw.type || raw.eventType);
    var show = raw.showInLvlupMemberPortal == null
      ? defaultShowInLvlupMemberPortal(raw.locationId, eventType)
      : raw.showInLvlupMemberPortal === true;
    return {
      id: raw.id,
      title: raw.title,
      type: EVENT_LABELS[eventType],
      eventType: eventType,
      date: raw.date,
      endDate: raw.endDate || raw.date,
      time: raw.time,
      locationId: raw.locationId,
      brand: isGoNinjaLocation(raw.locationId) ? 'goninja' : 'lvlup',
      blurb: raw.blurb || '',
      showInLvlupMemberPortal: show,
      visibleToBrands: visibleToBrands(raw.locationId, show),
      capacity: raw.capacity || 16,
      registered: raw.registered || 0,
      published: true,
      memberPriceCents: eventType === 'belt_test' ? 0 : (raw.memberPriceCents || 0),
      nonMemberPriceCents: eventType === 'belt_test' ? 0 : (raw.nonMemberPriceCents || 0),
    };
  }

  function studioEvents() {
    return [
      { id: 'gnw-summer-camp', title: 'Summer Camp', type: 'Summer Camp', date: '2027-06-14', endDate: '2027-06-18', time: '09:00', locationId: 'goninjaW', blurb: 'Half day and full day at Go Ninja Waunakee. Ages 5 to 12. Sample week.', capacity: 24, registered: 6, memberPriceCents: 14900, nonMemberPriceCents: 17900 },
      { id: 'gnv-summer-camp', title: 'Summer Camp', type: 'Summer Camp', date: '2027-06-21', endDate: '2027-06-25', time: '09:00', locationId: 'goninjaV', blurb: 'Half day and full day at Go Ninja Verona. Ages 5 to 12. Sample week.', capacity: 20, registered: 4, memberPriceCents: 14900, nonMemberPriceCents: 17900 },
      { id: 'gnw-pno', title: "Parents' Night Out", type: "Parents' Night Out", date: '2026-12-11', time: '18:00', locationId: 'goninjaW', blurb: 'Friday evening at Go Ninja Waunakee. Games and a sample pizza night.', capacity: 16, registered: 5, memberPriceCents: 2500, nonMemberPriceCents: 3500 },
      { id: 'gnv-pno', title: "Parents' Night Out", type: "Parents' Night Out", date: '2026-12-18', time: '18:00', locationId: 'goninjaV', blurb: 'Friday evening at Go Ninja Verona. Games and a sample pizza night.', capacity: 16, registered: 3, memberPriceCents: 2500, nonMemberPriceCents: 3500 },
      { id: 'gnw-skills', title: 'Ninja skills night', type: 'Clinic', date: '2026-12-09', time: '17:30', locationId: 'goninjaW', blurb: 'A Go Ninja skills night. Stays on the Go Ninja portal unless someone checks the box.', capacity: 18, registered: 2, memberPriceCents: 0, nonMemberPriceCents: 1500, showInLvlupMemberPortal: false },
      { id: 'belt-test', title: 'Belt test', type: 'Belt test', date: '2026-12-12', time: '09:00', locationId: 'waunakee', blurb: 'Color belts at Waunakee. Belt testing is included with tuition.', capacity: 40, registered: 12, memberPriceCents: 0, nonMemberPriceCents: 0, showInLvlupMemberPortal: false },
      { id: 'clinic', title: 'Sparring clinic', type: 'Clinic', date: '2026-12-05', time: '11:00', locationId: 'verona', blurb: 'Bring sparring gear if you have it.', capacity: 20, registered: 8, memberPriceCents: 4000, nonMemberPriceCents: 5500, showInLvlupMemberPortal: false },
      { id: 'tournament', title: 'Winter tournament', type: 'Tournament', date: '2027-01-16', time: '08:00', locationId: 'eastmad', blurb: 'East Madison. Sample tournament day.', capacity: 80, registered: 22, memberPriceCents: 7500, nonMemberPriceCents: 9000, showInLvlupMemberPortal: false },
      { id: 'parents-night', title: "Parents' Night Out", type: "Parents' Night Out", date: '2026-12-04', time: '18:00', locationId: 'eastmad', blurb: 'Drop off at East Madison. This LVLUP night is not a Go Ninja cross-brand listing.', capacity: 18, registered: 7, memberPriceCents: 2500, nonMemberPriceCents: 3500, showInLvlupMemberPortal: false },
    ].map(decorateEvent);
  }

  function filterStudioEvents(events, filter, locationId) {
    if (filter === 'portal' || filter === 'cross-brand') {
      return events.filter(isCrossBrandLvlupOffer);
    }
    if (filter === 'school') {
      return events.filter(function (row) { return row.locationId === locationId; });
    }
    return events.slice();
  }

  function sortStaffEvents(events) {
    return events.slice().sort(function (a, b) {
      var rankA = isCrossBrandLvlupOffer(a) ? 0 : 1;
      var rankB = isCrossBrandLvlupOffer(b) ? 0 : 1;
      if (rankA !== rankB) return rankA - rankB;
      return String(a.date).localeCompare(String(b.date)) || String(a.locationId).localeCompare(String(b.locationId));
    });
  }

  function memberPortalEvents(today, brand, extras) {
    var rows = studioEvents(today);
    var ids = {};
    rows.forEach(function (row) { ids[row.id] = true; });
    (extras || []).forEach(function (row) {
      if (!row || ids[row.id]) return;
      rows.push(decorateEvent(row));
      ids[row.id] = true;
    });
    return rows.filter(function (row) {
      if (brand === 'goninja') return row.brand === 'goninja' || row.brand === 'lvlup';
      return row.brand === 'lvlup' || row.showInLvlupMemberPortal === true;
    });
  }

  function upcomingEvents(today) {
    return memberPortalEvents(today, 'lvlup', []);
  }

  function partyDates(today) {
    var saturday = nextWeekday(today, 6);
    return [saturday, addDays(saturday, 7), addDays(saturday, 14)];
  }

  function monthCells(iso) {
    var parts = String(iso).split('-').map(Number);
    var first = new Date(Date.UTC(parts[0], parts[1] - 1, 1));
    var days = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
    var lead = first.getUTCDay();
    var cells = [];
    var i;
    for (i = 0; i < lead; i++) cells.push({ iso: '', inMonth: false, day: '' });
    for (i = 1; i <= days; i++) {
      var day = new Date(Date.UTC(parts[0], parts[1] - 1, i)).toISOString().slice(0, 10);
      cells.push({ iso: day, inMonth: true, day: i });
    }
    return cells;
  }

  root.CrmRules = {
    vimeoUrl: VIMEO,
    addDays: addDays,
    chicagoToday: chicagoToday,
    mondayOf: mondayOf,
    nextWeekday: nextWeekday,
    prettyDate: prettyDate,
    prettyTime: prettyTime,
    cycleTheme: cycleTheme,
    nextFulfillmentStatus: nextFulfillmentStatus,
    actionLabel: actionLabel,
    orderStatusLabel: orderStatusLabel,
    classFits: classFits,
    seatsLeft: seatsLeft,
    claimPartySlot: claimPartySlot,
    classesForWeek: classesForWeek,
    videosFor: videosFor,
    upcomingEvents: upcomingEvents,
    studioEvents: studioEvents,
    decorateEvent: decorateEvent,
    defaultShowInLvlupMemberPortal: defaultShowInLvlupMemberPortal,
    visibleToBrands: visibleToBrands,
    isCrossBrandLvlupOffer: isCrossBrandLvlupOffer,
    isGoNinjaLocation: isGoNinjaLocation,
    normalizeEventType: normalizeEventType,
    filterStudioEvents: filterStudioEvents,
    sortStaffEvents: sortStaffEvents,
    memberPortalEvents: memberPortalEvents,
    partyDates: partyDates,
    monthCells: monthCells,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
