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
    var bits = String(hhmm).split(':');
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

  function upcomingEvents(today) {
    var saturday = nextWeekday(today, 6);
    var friday = nextWeekday(today, 5);
    if (friday === today) friday = addDays(friday, 7);
    return [
      { id: 'belt-test', type: 'Belt test', title: 'Belt test', date: addDays(saturday, 14), time: '9:00 AM', locationId: 'waunakee', blurb: 'Color belts. In 2027, tuition includes every belt test.' },
      { id: 'clinic', type: 'Clinic', title: 'Sparring clinic', date: saturday, time: '11:00 AM', locationId: 'verona', blurb: 'Bring sparring gear if you have it.' },
      { id: 'tournament', type: 'Tournament', title: 'Winter tournament', date: addDays(saturday, 42), time: '8:00 AM', locationId: 'eastmad', blurb: 'East Madison · Madison, WI 53718' },
      { id: 'parents-night', type: 'Parents Night Out', title: 'Parents Night Out', date: friday, time: '6:00 PM', locationId: 'eastmad', blurb: 'Drop off at East Madison · Madison, WI 53718' },
    ];
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
    partyDates: partyDates,
    monthCells: monthCells,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
