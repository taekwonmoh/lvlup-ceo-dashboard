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

  function header(mode) {
    var memberOn = mode === 'member' ? ' on' : '';
    var staffOn = mode === 'staff' ? ' on' : '';
    return '<header class="top">' +
      '<div class="brand"><span class="mark">L</span><div><strong>LVLUP &amp; Go Ninja</strong><small>Sandbox Preview</small></div></div>' +
      '<div class="mode" role="group" aria-label="Preview">' +
      '<a class="' + memberOn.trim() + '" href="member.html">Member app</a>' +
      '<a class="' + staffOn.trim() + '" href="staff.html">Staff desk</a>' +
      '</div></header>';
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
    toast: toast,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
