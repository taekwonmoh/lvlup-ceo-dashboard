/* Member and family portal. Sandbox preview. One tap switches the person. */
(function () {
  var rules = window.CrmRules;
  var data = window.CRM_PREVIEW;
  var uiLib = window.CrmUi;
  var esc = uiLib.esc;
  var store = uiLib.load();
  var ui = {
    tab: 'home',
    more: false,
    connect: false,
    toast: null,
    cart: [],
    sizes: {},
    category: 'All',
    fulfill: 'studio_pickup',
    pickupSchool: 'waunakee',
    address: { line1: '100 Sample Lane', city: 'Waunakee', region: 'WI', postal: '53597' },
    partyStep: 1,
    party: { locationId: '', date: '', time: '', packageId: '' },
    day: store.today,
    cardOpen: false,
    draft: '',
    catalog: null,
  };

  var NAV = [
    ['home', 'Home'],
    ['classes', 'Classes'],
    ['shop', 'Pro Shop'],
    ['practice', 'Practice'],
    ['more', 'More'],
  ];
  var MORE = [
    ['profile', 'My family'],
    ['billing', 'Payments'],
    ['upgrade', 'Upgrade'],
    ['events', 'Events'],
    ['parties', 'Parties'],
    ['messages', 'Messages'],
  ];

  function person() { return uiLib.person(store.personId); }
  function save() { uiLib.save(store); }
  function toast(tone, text) { ui.toast = { tone: tone, text: text }; render(); }
  function names() { return uiLib.names(); }

  function unread() {
    return store.messages.some(function (row) { return row.author === 'studio' && !row.readByFamily; });
  }

  function ordersFor(who) {
    return store.orders.filter(function (order) {
      if (who.role === 'parent') return true;
      return order.personId === who.id;
    });
  }

  function weekClasses() {
    return rules.classesForWeek(rules.mondayOf(ui.day)).concat(store.duplicated || []);
  }

  function nextOpenDay(who) {
    var monday = rules.mondayOf(store.today);
    var rows = rules.classesForWeek(monday).concat(rules.classesForWeek(rules.addDays(monday, 7)));
    var fit = rows.filter(function (cls) { return rules.classFits(who, cls) && cls.date >= store.today; });
    fit.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    return fit[0] ? fit[0].date : store.today;
  }

  function catalog() { return ui.catalog || data.catalog; }

  function render() {
    var who = person();
    document.getElementById('app').innerHTML =
      uiLib.header('member') +
      '<div class="layout"><nav class="sidebar" aria-label="Sections">' + sideNav() + '</nav><main class="main">' +
      switcher() + uiLib.toast(ui.toast) + body(who) +
      '</main></div>' + bottom() + sheet();
  }

  function sideNav() {
    var items = [['home', 'Home'], ['profile', 'My family'], ['billing', 'Payments'], ['upgrade', 'Upgrade'], ['shop', 'Pro Shop'], ['classes', 'Classes'], ['events', 'Events'], ['parties', 'Parties'], ['practice', 'Practice'], ['messages', 'Messages']];
    return items.map(function (item) {
      return '<button type="button" class="' + (ui.tab === item[0] ? 'on' : '') + '" data-act="tab" data-tab="' + item[0] + '">' + esc(item[1]) + '</button>';
    }).join('');
  }

  function switcher() {
    return '<div class="switcher" role="tablist" aria-label="Family members">' + data.family.map(function (row) {
      var on = row.id === store.personId ? ' on' : '';
      var detail = row.role === 'parent' ? 'Parent' : row.belt + ' belt';
      return '<button type="button" class="person' + on + '" data-act="person" data-id="' + esc(row.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="avatar">' + esc(row.first.slice(0, 1)) + '</span><span><strong>' + esc(row.first) + '</strong><small>' + esc(detail) + '</small></span></button>';
    }).join('') + '</div>';
  }

  function bottom() {
    return '<nav class="bottom" aria-label="Main">' + NAV.map(function (item) {
      var on = item[0] === 'more' ? ui.more : ui.tab === item[0];
      var dot = item[0] === 'more' && unread() ? ' •' : '';
      return '<button type="button" class="navbtn' + (on ? ' on' : '') + '" data-act="tab" data-tab="' + item[0] + '">' + esc(item[1] + dot) + '</button>';
    }).join('') + '</nav>';
  }

  function sheet() {
    if (!ui.more && !ui.connect) return '';
    if (ui.connect) {
      return '<div class="sheet"><div class="panel"><h2>Sandbox connection</h2>' +
        '<p class="lede">Leave this blank to stay in the sample studio. Nothing is charged.</p>' +
        '<div class="stack"><label>API address<input id="api-base" value="' + esc(uiLib.apiBase() || data.apiDefault) + '"></label>' +
        '<label>Token, optional<input id="api-token" type="password" autocomplete="off" placeholder="Leave blank for preview"></label>' +
        '<button type="button" class="big primary" data-act="connect-save">Load catalog</button>' +
        '<button type="button" class="big" data-act="connect-off">Use sample studio</button>' +
        '<button type="button" class="big" data-act="reset-preview">Reset sample data</button></div></div></div>';
    }
    return '<div class="sheet"><div class="panel"><h2>More</h2><div class="stack">' + MORE.map(function (item) {
      return '<button type="button" class="rowbtn" data-act="tab" data-tab="' + item[0] + '">' + esc(item[1]) + '</button>';
    }).join('') +
      '<button type="button" class="rowbtn" data-act="connect">Sandbox connection</button>' +
      '<button type="button" class="textbtn" data-act="close-more">Close</button></div></div></div>';
  }

  function body(who) {
    if (ui.tab === 'profile') return profile(who);
    if (ui.tab === 'billing') return billing(who);
    if (ui.tab === 'upgrade') return upgrade(who);
    if (ui.tab === 'shop') return shop(who);
    if (ui.tab === 'classes') return classes(who);
    if (ui.tab === 'events') return events(who);
    if (ui.tab === 'parties') return parties(who);
    if (ui.tab === 'practice') return practice(who);
    if (ui.tab === 'messages') return messages();
    return home(who);
  }

  function home(who) {
    var mine = ordersFor(who);
    var ready = mine.filter(function (order) { return order.fulfillmentStatus === 'ready_for_pickup'; });
    var next = nextClass(who);
    var readyHtml = ready.map(function (order) {
      return '<button type="button" class="card ready" data-act="tab" data-tab="shop"><strong>' + esc(rules.orderStatusLabel(order, names())) + '</strong><span class="meta">' + esc(lineSummary(order)) + ' · Tap to see the order</span></button>';
    }).join('');
    var nextHtml = next
      ? '<div class="card next-class"><div class="meta">Next class</div><h3>' + esc(next.title) + '</h3><div>' + esc(rules.prettyDate(next.date) + ' · ' + rules.prettyTime(next.time)) + '</div><div class="meta">' + esc(uiLib.school(next.locationId).name) + '</div></div>'
      : '<div class="card"><h3>Pick a student</h3><p class="lede">Tap Riley or Avery above. Their next class shows up here.</p></div>';
    return '<h1>Hi, ' + esc(who.first) + '</h1><p class="lede">Here is what to do next.</p>' +
      nextHtml + readyHtml +
      '<div class="tiles">' +
      tile('classes', 'Book a Class', 'See this week') +
      tile('practice', 'Practice Videos', rules.cycleTheme(store.today)) +
      tile('shop', 'Pro Shop', 'Pickup or ship') +
      tile('events', 'Events', 'Tests and nights out') +
      '</div>';
  }

  function tile(tab, title, sub) {
    return '<button type="button" class="tile" data-act="tab" data-tab="' + tab + '">' + esc(title) + '<span>' + esc(sub) + '</span></button>';
  }

  function nextClass(who) {
    var rows = weekClasses().filter(function (cls) { return rules.classFits(who, cls) && cls.date >= store.today; });
    rows.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    return rows[0] || null;
  }

  function lineSummary(order) {
    return (order.lines || []).map(function (line) { return line.qty + ' ' + line.name; }).join(', ');
  }

  function profile(who) {
    var contacts = store.contacts.filter(function (row) { return row.personId === who.id; });
    var progress = who.role === 'parent' ? '' :
      '<div class="card"><h3>' + esc(who.belt) + ' belt</h3><p>' + esc(who.stripes) + ' of ' + esc(who.stripesNeed) + ' stripes toward the next belt</p><div class="bar"><span style="width:' + Math.round((who.stripes / Math.max(1, who.stripesNeed)) * 100) + '%"></span></div><p>' + esc(who.classes) + ' of ' + esc(who.classesNeed) + ' classes on this stripe</p></div>';
    return '<h1>My family</h1><p class="lede">Tap a person at the top to switch. This page follows them.</p>' +
      progress +
      '<h2>Emergency and pickup</h2><div class="stack">' +
      (contacts.length ? contacts.map(function (row) {
        return '<div class="card"><strong>' + esc(row.name) + '</strong><div class="meta">' + esc(row.kind) + ' · ' + esc(row.relationship) + '</div></div>';
      }).join('') : '<p class="quiet">No contacts yet.</p>') +
      '<label>Name<input id="contact-name" placeholder="Alex Sample"></label>' +
      '<label>Relationship<input id="contact-rel" placeholder="Aunt"></label>' +
      '<div class="row"><button type="button" class="chip" data-act="contact-kind" data-kind="Emergency">Emergency</button><button type="button" class="chip" data-act="contact-kind" data-kind="Pickup">Pickup</button></div>' +
      '<button type="button" class="big primary" data-act="contact-add">Save contact</button></div>' +
      '<h2>Waivers</h2><div class="card"><strong>Training waiver</strong><div class="meta">Signed for ' + esc(who.first) + ' · sample only</div><p>This is a sample waiver in the preview. It is not a real signature.</p></div>';
  }

  function billing(who) {
    var amount = who.planCents || data.family[0].planCents;
    var card = store.card;
    var form = ui.cardOpen
      ? '<div class="card" data-accept-sandbox="true"><h3>Change card</h3><p>Authorize.net Accept.js sandbox. The number stays in this box until you tap Save, then it is thrown away. We keep a token preview and the last four only.</p>' +
        '<div class="stack"><label>Card number<input id="card-pan" inputmode="numeric" autocomplete="off" placeholder="•••• •••• •••• ••••" data-accept="cardNumber"></label>' +
        '<label>Expiration<input id="card-exp" placeholder="MM/YY" autocomplete="off"></label>' +
        '<label>Security code<input id="card-cvv" inputmode="numeric" autocomplete="off" placeholder="•••"></label>' +
        '<button type="button" class="big primary" data-act="card-save">Save sandbox token</button>' +
        '<p class="quiet">You can leave the boxes empty. Nothing is charged.</p></div></div>'
      : '';
    return '<h1>Payments</h1><p class="lede">Preview only. Nothing is charged from this screen.</p>' +
      '<div class="card"><div class="meta">Next draft</div><div class="price">' + esc(uiLib.money(amount)) + '</div><div>' + esc(rules.prettyDate(data.nextDraftOn)) + ' · ' + esc(who.plan) + '</div>' +
      '<p>Tuition credit ready: <strong>' + esc(uiLib.money(data.creditCents)) + '</strong></p></div>' +
      '<div class="card"><h3>Card on file</h3><p>' + esc(card.brand) + ' •••• ' + esc(card.last4) + ' · ' + esc(card.exp) + '</p><p class="meta">Token ' + esc(card.token) + '</p>' +
      '<button type="button" class="big" data-act="card-open">Change credit card</button></div>' + form +
      '<h2>Receipts</h2>' + data.receipts.map(function (row) {
        return '<div class="card split"><div><strong>' + esc(row.label) + '</strong><div class="meta">' + esc(rules.prettyDate(row.on)) + ' · •••• ' + esc(row.last4) + '</div></div><div>' + esc(uiLib.money(row.cents)) + '</div></div>';
      }).join('');
  }

  function upgrade(who) {
    var current = data.tiers.filter(function (tier) { return tier.id === who.planId; })[0];
    var note = '<div class="note">' + esc(data.tuitionNote) + '</div>';
    if (!current) {
      return '<h1>Upgrade</h1><p class="lede">' + esc(who.first) + ' is on ' + esc(who.plan) + '.</p>' + note +
        '<button type="button" class="big primary" data-act="upgrade" data-id="extra">Ask about extra days</button>';
    }
    var rest = data.tiers.filter(function (tier) { return tier.cents > current.cents; });
    return '<h1>Upgrade</h1><p class="lede">' + esc(who.first) + ' is on ' + esc(current.name) + ' at ' + esc(uiLib.money(current.cents)) + ' every 4 weeks.</p>' + note +
      rest.map(function (tier, index) {
        var diff = tier.cents - current.cents;
        return '<div class="card"><div class="meta">' + (index === 0 ? 'Next step' : 'Also available') + '</div><h3>' + esc(tier.name) + '</h3><p>' + esc(tier.blurb) + '</p><div class="diff">+' + esc(uiLib.money(diff)) + '</div><div class="meta">more every 4 weeks</div>' +
          '<button type="button" class="big primary" data-act="upgrade" data-id="' + esc(tier.id) + '">Preview this upgrade</button></div>';
      }).join('') +
      (store.upgrade && store.upgrade.personId === who.id ? '<div class="card ready"><strong>Request saved.</strong><div>Nothing was charged.</div></div>' : '');
  }

  function shop(who) {
    var cats = ['All'].concat(catalog().map(function (item) { return item.category; }).filter(function (cat, i, list) { return list.indexOf(cat) === i; }));
    var items = catalog().filter(function (item) { return ui.category === 'All' || item.category === ui.category; });
    var subtotal = ui.cart.reduce(function (sum, line) {
      var item = findItem(line.sku);
      return sum + (item ? item.priceCents * line.qty : 0);
    }, 0);
    var shipping = ui.fulfill === 'ship_to_home' ? data.shippingCents : 0;
    return '<h1>Pro Shop</h1><p class="lede">Pick a size, then choose pickup or shipping. This is a sandbox preview.</p>' +
      '<div class="chips">' + cats.map(function (cat) {
        return '<button type="button" class="chip' + (ui.category === cat ? ' on' : '') + '" data-act="shop-cat" data-cat="' + esc(cat) + '">' + esc(cat) + '</button>';
      }).join('') + '</div>' +
      items.map(function (item) {
        var size = ui.sizes[item.sku] || '';
        return '<div class="card"><h3>' + esc(item.name) + '</h3><p>' + esc(item.description) + '</p><div class="price">' + esc(uiLib.money(item.priceCents)) + '</div>' +
          '<div class="chips">' + (item.variants || []).map(function (variant) {
            return '<button type="button" class="chip' + (size === variant ? ' on' : '') + '" data-act="size" data-sku="' + esc(item.sku) + '" data-size="' + esc(variant) + '">' + esc(variant) + '</button>';
          }).join('') + '</div>' +
          '<button type="button" class="big" data-act="add-item" data-sku="' + esc(item.sku) + '"' + (size ? '' : ' disabled') + '>' + (size ? 'Add to bag' : 'Tap a size') + '</button></div>';
      }).join('') + cartBlock(who, subtotal, shipping) + orderList(who);
  }

  function findItem(sku) {
    return catalog().filter(function (item) { return item.sku === sku; })[0];
  }

  function cartBlock(who, subtotal, shipping) {
    if (!ui.cart.length) return '<h2>Bag</h2><p class="quiet">Your bag is empty.</p>';
    var lines = ui.cart.map(function (line) {
      var item = findItem(line.sku);
      return '<div class="split"><span>' + esc(line.qty + ' ' + (item ? item.name : line.sku) + ' · ' + line.variant) + '</span><span>' + esc(uiLib.money(item ? item.priceCents * line.qty : 0)) + '</span></div>';
    }).join('');
    var schools = data.schools.map(function (row) {
      return '<button type="button" class="chip' + (ui.pickupSchool === row.id ? ' on' : '') + '" data-act="cart-school" data-id="' + esc(row.id) + '">' + esc(row.name) + '</button>';
    }).join('');
    var ship = ui.fulfill === 'ship_to_home'
      ? '<div class="stack"><label>Street<input id="ship-line" value="' + esc(ui.address.line1) + '"></label><label>City<input id="ship-city" value="' + esc(ui.address.city) + '"></label><div class="row"><label>State<input id="ship-region" value="' + esc(ui.address.region) + '"></label><label>ZIP<input id="ship-postal" value="' + esc(ui.address.postal) + '"></label></div><p class="meta">Sample home for this preview. Edit it if you want.</p></div>'
      : '<div class="chips">' + schools + '</div><p class="meta">' + esc(uiLib.school(ui.pickupSchool).city) + '</p>';
    return '<h2>Bag</h2><div class="card">' + lines +
      '<button type="button" class="choice' + (ui.fulfill === 'studio_pickup' ? ' on' : '') + '" data-act="cart-method" data-method="studio_pickup">Pick up at my studio (Free)</button>' +
      '<button type="button" class="choice' + (ui.fulfill === 'ship_to_home' ? ' on' : '') + '" data-act="cart-method" data-method="ship_to_home">Ship to my home (' + esc(uiLib.money(data.shippingCents)) + ')</button>' +
      ship +
      '<div class="split"><span>Total</span><strong>' + esc(uiLib.money(subtotal + shipping)) + '</strong></div>' +
      '<button type="button" class="big primary" data-act="place-order">Place sandbox preview order</button></div>';
  }

  function orderList(who) {
    var rows = ordersFor(who);
    if (!rows.length) return '';
    return '<h2>Your orders</h2>' + rows.map(function (order) {
      return '<div class="card"><strong>' + esc(rules.orderStatusLabel(order, names())) + '</strong><div class="meta">' + esc(lineSummary(order)) + '</div></div>';
    }).join('');
  }

  function classes(who) {
    if (who.role === 'parent') {
      return '<h1>Classes</h1><p class="lede">Tap a student at the top. Classes match their program.</p>';
    }
    var monday = rules.mondayOf(ui.day);
    var days = [0, 1, 2, 3, 4, 5].map(function (offset) { return rules.addDays(monday, offset); });
    var rows = weekClasses().filter(function (cls) { return rules.classFits(who, cls) && cls.date === ui.day; });
    return '<h1>Classes</h1><p class="lede">' + esc(who.first) + ' · ' + esc(who.program) + ' · ' + esc(who.belt) + ' belt</p>' +
      '<div class="chips">' + days.map(function (iso) {
        return '<button type="button" class="chip' + (ui.day === iso ? ' on' : '') + '" data-act="day" data-date="' + iso + '">' + esc(rules.prettyDate(iso)) + '</button>';
      }).join('') + '</div>' +
      (rows.length ? rows.map(classCard).join('') : '<div class="card"><p>Nothing for this day. Try another day.</p></div>');
  }

  function bookingFor(classId) {
    return store.bookings.filter(function (row) {
      return row.classId === classId && row.personId === store.personId && row.status !== 'cancelled';
    })[0];
  }

  function classCard(cls) {
    var mine = bookingFor(cls.id);
    var left = rules.seatsLeft(cls, store.bookings);
    var where = uiLib.school(cls.locationId).name;
    var state = mine
      ? '<div class="note">' + (mine.status === 'waitlist' ? 'You are on the waitlist.' : 'You are booked.') + '</div><button type="button" class="big" data-act="cancel-book" data-id="' + esc(cls.id) + '">Cancel</button>'
      : (left > 0
        ? '<button type="button" class="big primary" data-act="book" data-id="' + esc(cls.id) + '">Book</button>'
        : '<button type="button" class="big" data-act="wait" data-id="' + esc(cls.id) + '">Join Waitlist</button>');
    return '<div class="card"><h3>' + esc(cls.title) + '</h3><div>' + esc(rules.prettyTime(cls.time)) + ' · ' + esc(where) + '</div><div class="meta">' + (left > 0 ? left + ' spots left' : 'Full') + '</div>' + state + '</div>';
  }

  function events(who) {
    return '<h1>Events</h1><p class="lede">One tap signs up ' + esc(who.first) + '.</p>' +
      rules.upcomingEvents(store.today).concat(store.extraEvents || []).map(function (event) {
        var on = store.eventSignups.some(function (row) { return row.eventId === event.id && row.personId === store.personId; });
        var place = uiLib.school(event.locationId);
        return '<div class="card"><span class="badge">' + esc(event.type) + '</span><h3>' + esc(event.title) + '</h3><div>' + esc(rules.prettyDate(event.date) + ' · ' + event.time) + '</div><div class="meta">' + esc(place.name) + (place.city ? ' · ' + place.city : '') + '</div><p>' + esc(event.blurb || '') + '</p>' +
          (on ? '<div class="note">' + esc(who.first) + ' is signed up.</div><button type="button" class="big" data-act="event-off" data-id="' + esc(event.id) + '">Remove</button>'
            : '<button type="button" class="big primary" data-act="event-go" data-id="' + esc(event.id) + '">Sign up ' + esc(who.first) + '</button>') +
          '</div>';
      }).join('');
  }

  function parties(who) {
    var step = ui.partyStep;
    var bars = '<div class="steps">' + [1, 2, 3].map(function (n) { return '<i class="' + (n <= step ? 'on' : '') + '"></i>'; }).join('') + '</div>';
    if (step === 1) {
      return '<h1>Birthday party</h1><p class="lede">Step 1 of 3 · Pick a school</p>' + bars +
        '<div class="stack">' + data.schools.map(function (row) {
          return '<button type="button" class="choice" data-act="party-school" data-id="' + esc(row.id) + '"><strong>' + esc(row.name) + '</strong><span class="meta">' + esc(row.city) + '</span></button>';
        }).join('') + '</div>';
    }
    if (step === 2) {
      var school = uiLib.school(ui.party.locationId);
      var packs = data.packages.filter(function (row) { return row.brand === school.partyBrand; });
      var dates = rules.partyDates(store.today);
      return '<h1>Date and package</h1><p class="lede">Step 2 of 3 · ' + esc(school.name) + '</p>' + bars +
        '<h2>Date</h2><div class="chips">' + dates.map(function (iso) {
          return '<button type="button" class="chip' + (ui.party.date === iso ? ' on' : '') + '" data-act="party-date" data-date="' + iso + '">' + esc(rules.prettyDate(iso)) + '</button>';
        }).join('') + '</div><h2>Time</h2><div class="stack">' + data.partyTimes.map(function (time) {
          var taken = !rules.claimPartySlot(store.parties, { locationId: ui.party.locationId, date: ui.party.date, time: time.id }).ok;
          var label = taken ? time.label + ' · Taken' : time.label;
          return '<button type="button" class="choice' + (ui.party.time === time.id ? ' on' : '') + '" data-act="party-time" data-time="' + esc(time.id) + '"' + (taken || !ui.party.date ? ' disabled' : '') + '>' + esc(label) + '</button>';
        }).join('') + '</div><h2>Package</h2><div class="stack">' + packs.map(function (pack) {
          return '<button type="button" class="choice' + (ui.party.packageId === pack.id ? ' on' : '') + '" data-act="party-pack" data-id="' + esc(pack.id) + '"><strong>' + esc(pack.name) + '</strong><span class="meta">' + esc(uiLib.money(pack.cents) + ' · ' + pack.detail) + '</span></button>';
        }).join('') + '</div>' +
        '<button type="button" class="big primary" data-act="party-next"' + (ui.party.date && ui.party.time && ui.party.packageId ? '' : ' disabled') + '>Continue</button>' +
        '<button type="button" class="textbtn" data-act="party-back">Back</button>';
    }
    var school = uiLib.school(ui.party.locationId);
    var pack = data.packages.filter(function (row) { return row.id === ui.party.packageId; })[0];
    var time = data.partyTimes.filter(function (row) { return row.id === ui.party.time; })[0];
    return '<h1>Confirm</h1><p class="lede">Step 3 of 3 · Check this, then tap Book party.</p>' + bars +
      '<div class="card"><h3>' + esc(pack ? pack.name : 'Package') + '</h3><p>' + esc(school.name) + (school.city ? ' · ' + school.city : '') + '</p><p>' + esc(rules.prettyDate(ui.party.date) + ' · ' + (time ? time.label : '')) + '</p><div class="price">' + esc(pack ? uiLib.money(pack.cents) : '') + '</div><p class="meta">Preview only. The room is held in this sample so two families cannot take the same time.</p></div>' +
      '<button type="button" class="big primary" data-act="party-confirm">Book party</button>' +
      '<button type="button" class="textbtn" data-act="party-back">Back</button>' +
      partyList();
  }

  function partyList() {
    var mine = store.parties.filter(function (row) { return row.personId === store.personId; });
    if (!mine.length) return '';
    return '<h2>Booked</h2>' + mine.map(function (row) {
      return '<div class="card ready"><strong>' + esc(uiLib.school(row.locationId).name) + '</strong><div>' + esc(rules.prettyDate(row.date) + ' · ' + row.time) + '</div></div>';
    }).join('');
  }

  function practice(who) {
    var theme = rules.cycleTheme(store.today);
    var videos = rules.videosFor(who, theme);
    if (!videos.length) return '<h1>Practice at home</h1><p class="lede">Tap a student. Videos follow their belt and this cycle.</p>';
    return '<h1>Practice at home</h1><p class="lede">' + esc(who.belt) + ' belt · ' + esc(theme) + ' cycle</p>' +
      videos.map(function (video) {
        var key = who.id + '|' + store.today + '|' + video.id;
        var done = !!store.practiced[key];
        return '<div class="card"><h3>' + esc(video.title) + '</h3><div class="meta">' + esc(video.meta) + '</div>' +
          '<iframe class="video" src="' + esc(rules.vimeoUrl) + '" title="' + esc(video.title) + '" allow="fullscreen" allowfullscreen></iframe>' +
          '<button type="button" class="big' + (done ? ' ok' : '') + '" data-act="practiced" data-id="' + esc(video.id) + '">' + (done ? 'Practiced today' : 'Mark practiced today') + '</button></div>';
      }).join('');
  }

  function messages() {
    var changed = false;
    store.messages.forEach(function (row) {
      if (row.author === 'studio' && !row.readByFamily) { row.readByFamily = true; changed = true; }
    });
    if (changed) save();
    return '<h1>Messages</h1><p class="lede">Studio chat for this sample family. Delivery outside the preview is off.</p>' +
      store.messages.map(function (row) {
        var who = row.author === 'studio' ? 'Studio' : 'You';
        var read = row.author === 'family' ? (row.readByStaff ? 'Read by the studio' : 'Sent') : 'Read';
        return '<div class="card"><strong>' + esc(who) + '</strong><p>' + esc(row.body) + '</p><div class="meta">' + esc(read) + '</div></div>';
      }).join('') +
      '<label>Reply<textarea id="msg-draft">' + esc(ui.draft) + '</textarea></label>' +
      '<div class="chips">' + data.templates.map(function (row) {
        return '<button type="button" class="chip" data-act="template" data-id="' + esc(row.id) + '">' + esc(row.name) + '</button>';
      }).join('') + '</div>' +
      '<button type="button" class="big primary" data-act="send-message">Send</button>';
  }

  function readAddress() {
    var line = document.getElementById('ship-line');
    if (!line) return ui.address;
    ui.address = {
      line1: line.value.trim(),
      city: (document.getElementById('ship-city') || {}).value.trim(),
      region: (document.getElementById('ship-region') || {}).value.trim().toUpperCase(),
      postal: (document.getElementById('ship-postal') || {}).value.trim(),
    };
    return ui.address;
  }

  function onClick(event) {
    var el = event.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var who = person();
    if (act === 'toast-off') { ui.toast = null; render(); return; }
    if (act === 'close-more') { ui.more = false; render(); return; }
    if (act === 'connect') { ui.more = false; ui.connect = true; render(); return; }
    if (act === 'connect-off') { uiLib.setApi('', ''); ui.catalog = null; ui.connect = false; toast('ok', 'Back on the sample studio.'); return; }
    if (act === 'reset-preview') { store = uiLib.reset(); ui.connect = false; ui.cart = []; toast('ok', 'Sample data is fresh.'); return; }
    if (act === 'connect-save') { loadCatalog(); return; }
    if (act === 'person') {
      store.personId = el.getAttribute('data-id');
      ui.pickupSchool = person().school || 'waunakee';
      save();
      ui.toast = null;
      render();
      return;
    }
    if (act === 'tab') {
      var tab = el.getAttribute('data-tab');
      if (tab === 'more') { ui.more = !ui.more; render(); return; }
      ui.tab = tab;
      ui.more = false;
      ui.toast = null;
      if (tab === 'classes') ui.day = nextOpenDay(person());
      render();
      return;
    }
    if (act === 'shop-cat') { ui.category = el.getAttribute('data-cat'); render(); return; }
    if (act === 'size') { ui.sizes[el.getAttribute('data-sku')] = el.getAttribute('data-size'); render(); return; }
    if (act === 'add-item') {
      var sku = el.getAttribute('data-sku');
      var variant = ui.sizes[sku];
      if (!variant) return;
      var existing = ui.cart.filter(function (line) { return line.sku === sku && line.variant === variant; })[0];
      if (existing) existing.qty += 1;
      else ui.cart.push({ sku: sku, variant: variant, qty: 1 });
      toast('ok', 'Added to your bag.');
      return;
    }
    if (act === 'cart-method') {
      if (ui.fulfill === 'ship_to_home') readAddress();
      ui.fulfill = el.getAttribute('data-method');
      render();
      return;
    }
    if (act === 'cart-school') { ui.pickupSchool = el.getAttribute('data-id'); render(); return; }
    if (act === 'place-order') { placeOrder(who); return; }
    if (act === 'day') { ui.day = el.getAttribute('data-date'); render(); return; }
    if (act === 'book' || act === 'wait') {
      var classId = el.getAttribute('data-id');
      var status = act === 'wait' ? 'waitlist' : 'booked';
      store.bookings = store.bookings.filter(function (row) { return !(row.classId === classId && row.personId === who.id); });
      store.bookings.push({ classId: classId, personId: who.id, status: status });
      save();
      toast('ok', status === 'waitlist' ? who.first + ' is on the waitlist.' : 'Booked. ' + who.first + ' is in.');
      return;
    }
    if (act === 'cancel-book') {
      var id = el.getAttribute('data-id');
      store.bookings.forEach(function (row) { if (row.classId === id && row.personId === who.id) row.status = 'cancelled'; });
      save();
      toast('ok', 'Canceled.');
      return;
    }
    if (act === 'event-go' || act === 'event-off') {
      var eventId = el.getAttribute('data-id');
      store.eventSignups = store.eventSignups.filter(function (row) { return !(row.eventId === eventId && row.personId === who.id); });
      if (act === 'event-go') store.eventSignups.push({ eventId: eventId, personId: who.id });
      save();
      toast('ok', act === 'event-go' ? who.first + ' is signed up.' : 'Signup removed.');
      return;
    }
    if (act === 'party-school') {
      ui.party = { locationId: el.getAttribute('data-id'), date: rules.partyDates(store.today)[0], time: '', packageId: '' };
      ui.partyStep = 2;
      render();
      return;
    }
    if (act === 'party-date') { ui.party.date = el.getAttribute('data-date'); ui.party.time = ''; render(); return; }
    if (act === 'party-time') { ui.party.time = el.getAttribute('data-time'); render(); return; }
    if (act === 'party-pack') { ui.party.packageId = el.getAttribute('data-id'); render(); return; }
    if (act === 'party-back') { ui.partyStep = Math.max(1, ui.partyStep - 1); render(); return; }
    if (act === 'party-next') { ui.partyStep = 3; render(); return; }
    if (act === 'party-confirm') { confirmParty(who); return; }
    if (act === 'practiced') {
      var key = who.id + '|' + store.today + '|' + el.getAttribute('data-id');
      store.practiced[key] = !store.practiced[key];
      save();
      toast('ok', store.practiced[key] ? 'Marked practiced today.' : 'Cleared.');
      return;
    }
    if (act === 'template') {
      var template = data.templates.filter(function (row) { return row.id === el.getAttribute('data-id'); })[0];
      ui.draft = template ? template.body : ui.draft;
      render();
      return;
    }
    if (act === 'send-message') {
      var box = document.getElementById('msg-draft');
      var text = (box ? box.value : ui.draft).trim();
      if (!text) { toast('bad', 'Write a message first.'); return; }
      store.messages.push({ id: 'm' + Date.now(), author: 'family', body: text, readByFamily: true, readByStaff: false });
      ui.draft = '';
      save();
      toast('ok', 'Sent in this preview. The studio can see it on the staff desk.');
      return;
    }
    if (act === 'upgrade') {
      store.upgrade = { personId: who.id, tierId: el.getAttribute('data-id') };
      save();
      toast('ok', 'Upgrade preview saved. Nothing was charged.');
      return;
    }
    if (act === 'card-open') { ui.cardOpen = true; render(); return; }
    if (act === 'card-save') { saveCard(); return; }
    if (act === 'contact-kind') { ui.contactKind = el.getAttribute('data-kind'); return; }
    if (act === 'contact-add') { addContact(who); return; }
  }

  function addContact(who) {
    var name = (document.getElementById('contact-name').value || '').trim();
    var rel = (document.getElementById('contact-rel').value || '').trim();
    if (!name || !rel) { toast('bad', 'Add a name and how they know the family.'); return; }
    store.contacts.push({ id: 'c' + Date.now(), personId: who.id, kind: ui.contactKind || 'Emergency', name: name, relationship: rel });
    save();
    toast('ok', 'Contact saved in this preview.');
  }

  function saveCard() {
    var panEl = document.getElementById('card-pan');
    var expEl = document.getElementById('card-exp');
    var cvvEl = document.getElementById('card-cvv');
    var digits = (panEl && panEl.value || '').replace(/\D/g, '');
    var last4 = digits.length >= 4 ? digits.slice(-4) : store.card.last4;
    if (panEl) panEl.value = '';
    if (cvvEl) cvvEl.value = '';
    store.card = { brand: 'Visa', last4: last4, exp: (expEl && expEl.value.trim()) || store.card.exp, token: 'sandbox-accept-preview' };
    ui.cardOpen = false;
    save();
    toast('ok', 'Sandbox token saved. The card number was not stored.');
  }

  function placeOrder(who) {
    if (!ui.cart.length) { toast('bad', 'Add an item first.'); return; }
    if (who.role === 'parent') { toast('bad', 'Tap a student first, then place the order for them.'); return; }
    var shippingCents = 0;
    var address = null;
    var pickup = null;
    if (ui.fulfill === 'ship_to_home') {
      address = readAddress();
      if (!address.line1 || !address.city || !/^[A-Z]{2}$/.test(address.region) || !/^[0-9]{5}$/.test(address.postal)) {
        toast('bad', 'Add a street, city, state, and ZIP.');
        return;
      }
      shippingCents = data.shippingCents;
    } else pickup = ui.pickupSchool;
    var lines = ui.cart.map(function (line) {
      var item = findItem(line.sku);
      return { name: item.name, variant: line.variant, qty: line.qty, lineCents: item.priceCents * line.qty };
    });
    var subtotal = lines.reduce(function (sum, line) { return sum + line.lineCents; }, 0);
    store.orders.unshift({
      id: 'local-' + Date.now(),
      personId: who.id,
      lines: lines,
      fulfillmentMethod: ui.fulfill,
      pickupLocationId: pickup,
      shippingAddress: address,
      shippingCents: shippingCents,
      trackingNumber: null,
      fulfillmentStatus: 'ordered',
      subtotalCents: subtotal,
      totalCents: subtotal + shippingCents,
    });
    ui.cart = [];
    save();
    toast('ok', ui.fulfill === 'studio_pickup'
      ? 'Preview order placed for pickup at ' + uiLib.school(pickup).name + '. Nothing was charged.'
      : 'Preview order placed to ship. Nothing was charged.');
  }

  function confirmParty(who) {
    var request = { locationId: ui.party.locationId, date: ui.party.date, time: ui.party.time };
    var claim = rules.claimPartySlot(store.parties, request);
    if (!claim.ok) { toast('bad', claim.reason); ui.partyStep = 2; return; }
    store.parties.push({
      id: 'party-' + Date.now(),
      locationId: request.locationId,
      date: request.date,
      time: request.time,
      packageId: ui.party.packageId,
      personId: who.id,
      status: 'booked',
    });
    save();
    ui.partyStep = 1;
    ui.party = { locationId: '', date: '', time: '', packageId: '' };
    toast('ok', 'Party booked. That time is now taken.');
  }

  function loadCatalog() {
    var base = (document.getElementById('api-base').value || '').trim().replace(/\/$/, '');
    var bearer = (document.getElementById('api-token').value || '').trim();
    uiLib.setApi(base, bearer);
    if (!base) { ui.catalog = null; ui.connect = false; toast('ok', 'Using the sample catalog.'); return; }
    fetch(base + '/v1/pro-shop/items').then(function (res) { return res.json(); }).then(function (body) {
      if (!body.items) throw new Error('no items');
      ui.catalog = body.items.map(function (item) {
        return {
          sku: item.sku, name: item.name, category: item.category, description: item.description,
          priceCents: item.priceCents, variants: item.variants || [], fulfillmentModes: item.fulfillmentModes || [],
        };
      });
      ui.connect = false;
      toast('ok', 'Catalog loaded from the sandbox API. Orders on this page stay a preview.');
    }).catch(function () {
      ui.catalog = null;
      toast('bad', 'Could not reach the sandbox API. Staying on the sample catalog.');
    });
  }

  window.addEventListener('storage', function () { store = uiLib.load(); render(); });
  document.getElementById('app').addEventListener('click', onClick);
  document.getElementById('app').addEventListener('input', function (event) {
    if (event.target.id === 'msg-draft') ui.draft = event.target.value;
  });
  render();
})();
