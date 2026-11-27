/* Preview shell: fictional store, plain-English helpers, sandbox API optional. */
(function (root) {
  var KEY = 'lvlupCrmPreviewV1';
  var API_KEY = 'lvlupCrmApiBase';
  var TOKEN_KEY = 'lvlupCrmApiToken';

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
    var coins = String(abs % 100).padStart(2, '0');
    return sign + '$' + dollars + '.' + coins;
  }

  function schools() { return root.CRM_PREVIEW.schools; }

  function school(id) {
    return schools().filter(function (row) { return row.id === id; })[0] || { id: id, name: id, city: '', brand: '', partyBrand: 'lvlup' };
  }

  function names() {
    var out = {};
    schools().forEach(function (row) { out[row.id] = row.name; });
    return out;
  }

  function people() {
    return root.CRM_PREVIEW.family.concat(root.CRM_PREVIEW.rosterExtra);
  }

  function person(id) {
    return people().filter(function (row) { return row.id === id; })[0] || root.CRM_PREVIEW.family[0];
  }

  function seed() {
    var rules = root.CrmRules;
    var data = root.CRM_PREVIEW;
    var today = rules.chicagoToday();
    var dates = rules.partyDates(today);
    return {
      personId: 'riley',
      staffSchool: 'waunakee',
      orders: [
        {
          id: 'local-hoodie',
          personId: 'riley',
          lines: [{ name: 'LVLUP Hoodie', variant: 'YM', qty: 1, lineCents: 4500 }],
          fulfillmentMethod: 'studio_pickup',
          pickupLocationId: 'waunakee',
          shippingAddress: null,
          shippingCents: 0,
          trackingNumber: null,
          fulfillmentStatus: 'ready_for_pickup',
          subtotalCents: 4500,
          totalCents: 4500,
        },
        {
          id: 'local-socks',
          personId: 'avery',
          lines: [{ name: 'Go Ninja Grip Socks', variant: 'S', qty: 1, lineCents: 1200 }],
          fulfillmentMethod: 'ship_to_home',
          pickupLocationId: null,
          shippingAddress: { line1: '100 Sample Lane', city: 'Waunakee', region: 'WI', postal: '53597' },
          shippingCents: 800,
          trackingNumber: 'SAMPLETRACK1',
          fulfillmentStatus: 'shipped',
          subtotalCents: 1200,
          totalCents: 2000,
        },
      ],
      bookings: [],
      eventSignups: [],
      parties: [
        { id: 'taken-sample', locationId: 'goninjaW', date: dates[0], time: '11:00', packageId: 'ninja', personId: 'other-sample', status: 'booked', label: 'Sample party' },
      ],
      practiced: {},
      messages: [
        { id: 'm1', author: 'studio', body: 'Riley, your hoodie is at the Waunakee front desk whenever you are in next.', readByFamily: false, readByStaff: true },
      ],
      card: { brand: 'Visa', last4: '4242', exp: '08/28', token: 'sandbox-accept-preview' },
      upgrade: null,
      contacts: [
        { id: 'c1', personId: 'riley', kind: 'Emergency', name: 'Jordan Sample', relationship: 'Parent' },
        { id: 'c2', personId: 'riley', kind: 'Pickup', name: 'Alex Sample', relationship: 'Aunt' },
        { id: 'c3', personId: 'avery', kind: 'Emergency', name: 'Jordan Sample', relationship: 'Parent' },
        { id: 'c4', personId: 'quinn', kind: 'Emergency', name: 'Jordan Sample', relationship: 'Parent' },
      ],
      kiosk: null,
      checkins: [],
      paymentPreview: {},
      emailToggles: {},
      extraEvents: [],
      duplicated: [],
      today: today,
    };
  }

  var KEEP = ['personId', 'staffSchool', 'orders', 'bookings', 'eventSignups', 'parties', 'practiced', 'messages', 'card', 'upgrade', 'contacts', 'kiosk', 'checkins', 'paymentPreview', 'emailToggles', 'extraEvents', 'duplicated'];

  function load() {
    var base = seed();
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && typeof saved === 'object') {
        KEEP.forEach(function (key) {
          if (saved[key] != null) base[key] = saved[key];
        });
      }
    } catch (err) { /* sample data stays */ }
    base.today = root.CrmRules.chicagoToday();
    return base;
  }

  function save(state) {
    var copy = {};
    KEEP.forEach(function (key) { copy[key] = state[key]; });
    try { localStorage.setItem(KEY, JSON.stringify(copy)); } catch (err) { /* private mode */ }
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
    return seed();
  }

  function apiBase() {
    try { return sessionStorage.getItem(API_KEY) || ''; } catch (err) { return ''; }
  }

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (err) { return ''; }
  }

  function setApi(base, bearer) {
    try {
      if (base) sessionStorage.setItem(API_KEY, String(base).replace(/\/$/, ''));
      else sessionStorage.removeItem(API_KEY);
      if (bearer) sessionStorage.setItem(TOKEN_KEY, bearer);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (err) { /* ignore */ }
  }

  var ICONS = {
    home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    bag: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>',
    play: '<path d="M9 7.5v9l8-4.5-8-4.5z"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    pin: '<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/>',
    check: '<path d="M5 12.5 9.2 17 19 7"/>',
    alert: '<path d="M12 4 3 19h18L12 4z"/><path d="M12 10v4M12 16.5h.01"/>',
    truck: '<path d="M3 7h11v10H3zM14 11h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',
    store: '<path d="M4 10 6 4h12l2 6"/><path d="M4 10h16v9H4z"/><path d="M10 19v-5h4v5"/>',
    users: '<path d="M16 20v-1.2a3.2 3.2 0 0 0-3.2-3.2H8.2A3.2 3.2 0 0 0 5 18.8V20"/><circle cx="10.5" cy="8" r="2.6"/><path d="M19 20v-1.1a2.8 2.8 0 0 0-2.2-2.7"/><circle cx="16.5" cy="8.5" r="2"/>',
    person: '<circle cx="12" cy="8" r="3"/><path d="M6.5 19c.8-3.2 2.8-4.8 5.5-4.8s4.7 1.6 5.5 4.8"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
    message: '<path d="M5 6h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3v-3H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    star: '<path d="m12 3 2.2 4.6 5 .7-3.6 3.5.9 5.1L12 14.8 7.5 17l.9-5.1L4.8 8.3l5-.7z"/>',
    chart: '<path d="M4 19h16M7 16v-5M12 16V8M17 16v-3"/>',
    spark: '<path d="M12 3v4M12 17v4M4.9 6.5l2.8 2.8M16.3 14.7l2.8 2.8M3 12h4M17 12h4M4.9 17.5l2.8-2.8M16.3 9.3l2.8-2.8"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
  };

  function logo(kind) {
    if (kind === 'white') return '<img class="brand-logo" src="../../images/lvlup-logo-white.png" alt="LVLUP Martial Arts">';
    if (kind === 'go') return '<img class="go-mark" src="../../images/goninja-logo.png" alt="Go Ninja">';
    return '<img class="brand-mark" src="../../images/lvlup-logo.png" alt="LVLUP Martial Arts">';
  }

  function icon(name) {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.spark) + '</svg>';
  }

  function header(mode) {
    var memberOn = mode === 'member' ? ' on' : '';
    var staffOn = mode === 'staff' ? ' on' : '';
    return '<div class="utility">' +
      '<div class="brand-row">' + logo('white') + '</div>' +
      '<span class="sandbox-pill">Sandbox Preview</span>' +
      '<div class="mode" role="group" aria-label="Preview">' +
      '<a class="' + memberOn.trim() + '" href="member.html">Member app</a>' +
      '<a class="' + staffOn.trim() + '" href="staff.html">Staff desk</a>' +
      '</div></div>';
  }

  function toast(item) {
    if (!item) return '';
    var role = item.tone === 'bad' ? 'alert' : 'status';
    return '<div class="toast ' + esc(item.tone || 'ok') + '" role="' + role + '"><span>' + esc(item.text) + '</span><button type="button" data-act="toast-off">OK</button></div>';
  }

  root.CrmUi = {
    esc: esc,
    money: money,
    school: school,
    schools: schools,
    names: names,
    people: people,
    person: person,
    seed: seed,
    load: load,
    save: save,
    reset: reset,
    apiBase: apiBase,
    token: token,
    setApi: setApi,
    header: header,
    icon: icon,
    logo: logo,
    toast: toast,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
