/* Fictional sandbox studio. Every name is a Sample. Nothing here is a real member. */
(function (root) {
  root.CRM_PREVIEW = {
    apiDefault: 'https://lvlup-crm-api.mike-moh.workers.dev',
    schools: [
      { id: 'waunakee', name: 'Waunakee', brand: 'LVLUP', city: 'Waunakee, WI', partyBrand: 'lvlup' },
      { id: 'eastmad', name: 'East Madison', brand: 'LVLUP', city: 'Madison, WI 53718', partyBrand: 'lvlup' },
      { id: 'verona', name: 'Verona', brand: 'LVLUP', city: 'Verona, WI', partyBrand: 'lvlup' },
      { id: 'deforest', name: 'DeForest', brand: 'LVLUP', city: 'DeForest, WI', partyBrand: 'lvlup' },
      { id: 'goninjaW', name: 'Go Ninja Waunakee', brand: 'Go Ninja', city: 'Waunakee, WI', partyBrand: 'goninja' },
      { id: 'goninjaV', name: 'Go Ninja Verona', brand: 'Go Ninja', city: 'Verona, WI', partyBrand: 'goninja' },
    ],
    family: [
      { id: 'riley', first: 'Riley', last: 'Sample', role: 'student', program: 'Taekwondo', belt: 'Yellow', beltRank: 'color', stripes: 2, stripesNeed: 3, classes: 18, classesNeed: 24, school: 'waunakee', plan: 'Core', planId: 'core', planCents: 20900, status: 'active', tag: 'Active', soldBy: 'Alex Sample', card: 'ok', note: 'Riley likes the left side of the mat.' },
      { id: 'avery', first: 'Avery', last: 'Sample', role: 'student', program: 'Go Ninja', belt: 'White', beltRank: 'all', stripes: 1, stripesNeed: 2, classes: 6, classesNeed: 12, school: 'goninjaW', plan: 'Movement', planId: 'movement', planCents: 8900, status: 'active', tag: 'Active', soldBy: 'Sam Preview', card: 'ok', note: 'Avery is working on the first balance drill.' },
      { id: 'jordan', first: 'Jordan', last: 'Sample', role: 'parent', program: 'Parent', belt: 'Guardian', beltRank: 'none', stripes: 0, stripesNeed: 0, classes: 0, classesNeed: 0, school: 'waunakee', plan: 'Family account', planId: 'family', planCents: 0, status: 'active', tag: 'Parent', soldBy: 'Alex Sample', card: 'ok', note: 'Jordan pays the family draft.' },
    ],
    rosterExtra: [
      { id: 'quinn', first: 'Quinn', last: 'Sample', role: 'student', program: 'Taekwondo', belt: 'Green', beltRank: 'color', stripes: 1, stripesNeed: 3, classes: 20, classesNeed: 24, school: 'deforest', plan: 'Core', planId: 'core', planCents: 19900, status: 'active', tag: 'Card', soldBy: 'Alex Sample', card: 'expired', note: 'The card on file expired. Update it before the next draft.' },
      { id: 'casey', first: 'Casey', last: 'Sample', role: 'lead', program: 'Taekwondo', belt: 'New', beltRank: 'color', stripes: 0, stripesNeed: 1, classes: 1, classesNeed: 8, school: 'waunakee', plan: 'Trial', planId: 'trial', planCents: 0, status: 'lead', tag: 'Trial', soldBy: 'Sam Preview', card: 'ok', note: 'Came in for a trial. Interested in Tuesday sparring.' },
    ],
    tiers: [
      { id: 'core', name: 'Core', cents: 20900, blurb: 'Regular classes on the current belt path.' },
      { id: 'bbc', name: 'Black Belt Club', cents: 24900, blurb: 'More classes each week and a clear path to black belt.' },
      { id: 'leadership', name: 'Leadership', cents: 29900, blurb: 'Leadership class plus the Core training.' },
      { id: 'legacy', name: 'Legacy', cents: 34900, blurb: 'The fullest plan, with leadership and extra classes.' },
    ],
    catalog: [
      { sku: 'uniform-dobok', name: 'Uniform (Dobok)', brand: 'shared', category: 'Uniforms', description: 'White training uniform for class.', priceCents: 5500, variants: ['YS', 'YM', 'YL', 'AS', 'AM', 'AL'], fulfillmentModes: ['studio_pickup', 'ship_to_home'] },
      { sku: 'sparring-kit', name: 'Sparring Gear Kit', brand: 'shared', category: 'Gear', description: 'Headgear, gloves, and boots sold as one kit.', priceCents: 8900, variants: ['Child', 'Youth', 'Adult'], fulfillmentModes: ['studio_pickup', 'ship_to_home'] },
      { sku: 'bo-staff', name: 'Bo Staff', brand: 'shared', category: 'Weapons', description: 'A tapered bo staff for forms.', priceCents: 3500, variants: ['4 foot', '5 foot', '6 foot'], fulfillmentModes: ['studio_pickup', 'ship_to_home'] },
      { sku: 'lvlup-hoodie', name: 'LVLUP Hoodie', brand: 'lvlup', category: 'Apparel', description: 'A warm LVLUP hoodie for outside the mat.', priceCents: 4500, variants: ['YS', 'YM', 'YL', 'AS', 'AM', 'AL'], fulfillmentModes: ['studio_pickup', 'ship_to_home'] },
      { sku: 'goninja-grip-socks', name: 'Go Ninja Grip Socks', brand: 'goninja', category: 'Apparel', description: 'Grip socks for Go Ninja training.', priceCents: 1200, variants: ['XS', 'S', 'M', 'L'], fulfillmentModes: ['studio_pickup', 'ship_to_home'] },
    ],
    shippingCents: 800,
    packages: [
      { id: 'ninja', brand: 'goninja', name: 'Ninja party', cents: 18900, detail: '90 minutes · up to 12 kids' },
      { id: 'ninja-plus', brand: 'goninja', name: 'Ninja party plus cake table', cents: 22900, detail: '90 minutes · cake table included' },
      { id: 'lvlup', brand: 'lvlup', name: 'Martial arts party', cents: 21900, detail: '90 minutes · up to 16 kids' },
      { id: 'lvlup-plus', brand: 'lvlup', name: 'Martial arts party plus cake table', cents: 25900, detail: '90 minutes · cake table included' },
    ],
    partyTimes: [
      { id: '11:00', label: '11:00 AM' },
      { id: '13:30', label: '1:30 PM' },
      { id: '15:30', label: '3:30 PM' },
    ],
    receipts: [
      { id: 'r1', on: '2026-11-10', label: 'Core tuition', cents: 20900, last4: '4242' },
      { id: 'r2', on: '2026-10-13', label: 'Core tuition', cents: 20900, last4: '4242' },
    ],
    creditCents: 2500,
    nextDraftOn: '2026-12-08',
    templates: [
      { id: 'remind', name: 'Class reminder', body: 'See you at class. Please arrive a few minutes early.' },
      { id: 'ready', name: 'Pickup ready', body: 'Your Pro Shop order is ready at the front desk.' },
      { id: 'trial', name: 'Trial thanks', body: 'Thanks for coming in. Reply here if you want to book another class.' },
    ],
    emailCodes: [
      { code: 'booking_confirmation', name: 'Booking confirmation' },
      { code: 'class_reminder', name: 'Class reminder' },
      { code: 'receipt', name: 'Receipt' },
      { code: 'failed_payment', name: 'Failed payment' },
      { code: 'new_member_staff_alert', name: 'New member staff alert' },
    ],
    financials: {
      collectedCents: 1930000,
      lastMonthCents: 1810000,
      scheduledCents: 2460000,
      pastDueCents: 19900,
      categories: [
        { name: 'Tuition', cents: 1420000 },
        { name: 'Events', cents: 210000 },
        { name: 'Parties', cents: 160000 },
        { name: 'Pro Shop', cents: 98000 },
        { name: 'Testing (pre-2027)', cents: 42000 },
      ],
      soldBy: [
        { name: 'Alex Sample', memberships: 6, cents: 420000 },
        { name: 'Sam Preview', memberships: 3, cents: 180000 },
      ],
    },
    tuitionNote: 'Starting in 2027, tuition includes every belt test. There is no $100 belt test fee.',
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
