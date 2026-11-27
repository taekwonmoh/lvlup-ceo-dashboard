/* Staff studio tools. Demo data lives in this file. Live mode posts the same actions to /v1/studio. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrmStudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var CATALOG = JSON.parse('{"passPct":70,"feeModel":"included_2027","beltTestFeeCents":0,"schools":[{"id":"waunakee","brand":"lvlup","name":"LVLUP Waunakee","short":"Waunakee","qr":"WAUNAKEE","active":140,"trials":6,"attendance":18,"collectedCents":2400000,"draftsCents":800000},{"id":"verona","brand":"lvlup","name":"LVLUP Verona","short":"Verona","qr":"VERONA","active":110,"trials":5,"attendance":13,"collectedCents":1900000,"draftsCents":600000},{"id":"eastmad","brand":"lvlup","name":"LVLUP East Madison","short":"East Madison","qr":"EASTMAD","active":90,"trials":4,"attendance":11,"collectedCents":1600000,"draftsCents":500000},{"id":"deforest","brand":"lvlup","name":"LVLUP DeForest","short":"DeForest","qr":"DEFOREST","active":70,"trials":2,"attendance":8,"collectedCents":900000,"draftsCents":300000},{"id":"goninjaW","brand":"goninja","name":"Go Ninja Waunakee","short":"Go Ninja Waunakee","qr":"GNW","active":48,"trials":3,"attendance":7,"collectedCents":420000,"draftsCents":80000},{"id":"goninjaV","brand":"goninja","name":"Go Ninja Verona","short":"Go Ninja Verona","qr":"GNV","active":36,"trials":2,"attendance":5,"collectedCents":300000,"draftsCents":70000}],"people":[{"id":"morgan","first":"Morgan","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"Yellow","school":"waunakee","plan":"Core","classes":24,"classesNeed":24,"rankAwardedOn":"2026-08-15","daysNeed":60,"lastCheckIn":"2026-11-26","stripes":0,"stripesNeed":3},{"id":"riley","first":"Riley","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"Yellow","school":"waunakee","plan":"Core","classes":22,"classesNeed":24,"rankAwardedOn":"2026-09-01","daysNeed":60,"lastCheckIn":"2026-11-26","stripes":2,"stripesNeed":3},{"id":"parker","first":"Parker","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"Orange","school":"waunakee","plan":"Core","classes":8,"classesNeed":24,"rankAwardedOn":"2026-11-01","daysNeed":60,"lastCheckIn":"2026-11-18","stripes":0,"stripesNeed":3},{"id":"rowan","first":"Rowan","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"Camo","school":"waunakee","plan":"Core","classes":10,"classesNeed":24,"rankAwardedOn":"2026-10-01","daysNeed":60,"lastCheckIn":"2026-11-05","stripes":1,"stripesNeed":3},{"id":"casey","first":"Casey","last":"Sample","role":"lead","status":"lead","program":"Taekwondo","belt":"New","school":"waunakee","plan":"Trial","classes":1,"classesNeed":8,"rankAwardedOn":"2026-11-20","daysNeed":30,"lastCheckIn":"2026-11-25","stripes":0,"stripesNeed":1},{"id":"harper","first":"Harper","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"Green","school":"eastmad","plan":"Core","classes":24,"classesNeed":24,"rankAwardedOn":"2026-08-01","daysNeed":60,"lastCheckIn":"2026-11-27","stripes":1,"stripesNeed":3},{"id":"finley","first":"Finley","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"White","school":"eastmad","plan":"Core","classes":4,"classesNeed":16,"rankAwardedOn":"2026-10-20","daysNeed":45,"lastCheckIn":"2026-11-12","stripes":0,"stripesNeed":3},{"id":"sage","first":"Sage","last":"Sample","role":"lead","status":"lead","program":"Taekwondo","belt":"New","school":"eastmad","plan":"Trial","classes":0,"classesNeed":8,"rankAwardedOn":"2026-11-24","daysNeed":30,"lastCheckIn":"2026-11-26","stripes":0,"stripesNeed":1},{"id":"blake","first":"Blake","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"Red","school":"verona","plan":"Leadership","classes":30,"classesNeed":30,"rankAwardedOn":"2026-07-15","daysNeed":90,"lastCheckIn":"2026-11-24","stripes":0,"stripesNeed":1},{"id":"reese","first":"Reese","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"Yellow","school":"verona","plan":"Core","classes":22,"classesNeed":24,"rankAwardedOn":"2026-09-10","daysNeed":60,"lastCheckIn":"2026-11-08","stripes":2,"stripesNeed":3},{"id":"elliot","first":"Elliot","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"Orange","school":"verona","plan":"Core","classes":12,"classesNeed":24,"rankAwardedOn":"2026-10-01","daysNeed":60,"lastCheckIn":"2026-11-20","stripes":1,"stripesNeed":3},{"id":"hayden","first":"Hayden","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"Camo","school":"deforest","plan":"Core","classes":24,"classesNeed":24,"rankAwardedOn":"2026-09-01","daysNeed":60,"lastCheckIn":"2026-11-25","stripes":0,"stripesNeed":3},{"id":"quinn","first":"Quinn","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"Green","school":"deforest","plan":"Core","classes":23,"classesNeed":24,"rankAwardedOn":"2026-08-28","daysNeed":60,"lastCheckIn":"2026-11-04","stripes":1,"stripesNeed":3},{"id":"drew","first":"Drew","last":"Sample","role":"student","status":"active","program":"Taekwondo","belt":"White","school":"deforest","plan":"Core","classes":6,"classesNeed":16,"rankAwardedOn":"2026-11-10","daysNeed":45,"lastCheckIn":"2026-11-19","stripes":0,"stripesNeed":3},{"id":"logan","first":"Logan","last":"Sample","role":"lead","status":"lead","program":"Taekwondo","belt":"New","school":"deforest","plan":"Trial","classes":1,"classesNeed":8,"rankAwardedOn":"2026-11-22","daysNeed":30,"lastCheckIn":"2026-11-22","stripes":0,"stripesNeed":1},{"id":"robin","first":"Robin","last":"Sample","role":"student","status":"active","program":"Go Ninja","belt":"Yellow","school":"goninjaW","plan":"Movement","classes":12,"classesNeed":12,"rankAwardedOn":"2026-09-01","daysNeed":45,"lastCheckIn":"2026-11-26","stripes":0,"stripesNeed":2},{"id":"avery","first":"Avery","last":"Sample","role":"student","status":"active","program":"Go Ninja","belt":"White","school":"goninjaW","plan":"Movement","classes":6,"classesNeed":12,"rankAwardedOn":"2026-10-15","daysNeed":45,"lastCheckIn":"2026-11-10","stripes":1,"stripesNeed":2},{"id":"cameron","first":"Cameron","last":"Sample","role":"student","status":"active","program":"Go Ninja","belt":"Yellow","school":"goninjaW","plan":"Movement","classes":10,"classesNeed":12,"rankAwardedOn":"2026-10-01","daysNeed":45,"lastCheckIn":"2026-11-25","stripes":1,"stripesNeed":2},{"id":"noah","first":"Noah","last":"Sample","role":"student","status":"active","program":"Go Ninja","belt":"White","school":"goninjaW","plan":"Movement","classes":3,"classesNeed":12,"rankAwardedOn":"2026-11-01","daysNeed":45,"lastCheckIn":"2026-11-06","stripes":0,"stripesNeed":2},{"id":"taylor","first":"Taylor","last":"Sample","role":"student","status":"active","program":"Go Ninja","belt":"Orange","school":"goninjaV","plan":"Movement","classes":12,"classesNeed":12,"rankAwardedOn":"2026-08-01","daysNeed":45,"lastCheckIn":"2026-11-21","stripes":0,"stripesNeed":2},{"id":"jamie","first":"Jamie","last":"Sample","role":"student","status":"active","program":"Go Ninja","belt":"White","school":"goninjaV","plan":"Movement","classes":7,"classesNeed":12,"rankAwardedOn":"2026-10-20","daysNeed":45,"lastCheckIn":"2026-11-13","stripes":0,"stripesNeed":2},{"id":"skyler","first":"Skyler","last":"Sample","role":"lead","status":"lead","program":"Go Ninja","belt":"New","school":"goninjaV","plan":"Trial","classes":1,"classesNeed":8,"rankAwardedOn":"2026-11-18","daysNeed":30,"lastCheckIn":"2026-11-18","stripes":0,"stripesNeed":1}],"quizzes":[{"id":"white-korean","program":"Taekwondo","belt":"White","cycle":"Respect","title":"White belt Korean counts","questions":[{"id":"wk1","prompt":"What is the Korean word for belt?","choices":["Dobok","Ti","Dojang"],"answer":1},{"id":"wk2","prompt":"Which word means three?","choices":["Hana","Dul","Set"],"answer":2},{"id":"wk3","prompt":"What is the training hall called?","choices":["Dojang","Dobok","Charyeot"],"answer":0}]},{"id":"yellow-stances","program":"Taekwondo","belt":"Yellow","cycle":"Foundation","title":"Yellow belt stances and blocks","questions":[{"id":"ys1","prompt":"What is the walking stance called?","choices":["Ap kubi","Ap chagi","Sonnal"],"answer":0},{"id":"ys2","prompt":"What is a low block called?","choices":["Eolgul makki","Arae makki","Dollyo chagi"],"answer":1},{"id":"ys3","prompt":"Which command means attention?","choices":["Kyungye","Baro","Charyeot"],"answer":2}]},{"id":"ninja-safety","program":"Go Ninja","belt":"White","cycle":"Balance","title":"Go Ninja floor safety","questions":[{"id":"ns1","prompt":"What do you do before you climb?","choices":["Look at the coach","Run at the wall","Close your eyes"],"answer":0},{"id":"ns2","prompt":"Grip socks are for which floor?","choices":["The parking lot","The ninja floor","The lobby tile"],"answer":1},{"id":"ns3","prompt":"Where does a spotter stand?","choices":["In the lobby","On the beam","Beside the athlete"],"answer":2}]}],"attempts":[{"id":"att-riley-white","personId":"riley","quizId":"white-korean","scorePct":100,"passed":true,"takenOn":"2026-11-12"},{"id":"att-riley-yellow","personId":"riley","quizId":"yellow-stances","scorePct":67,"passed":false,"takenOn":"2026-11-20"},{"id":"att-morgan-white","personId":"morgan","quizId":"white-korean","scorePct":100,"passed":true,"takenOn":"2026-11-18"},{"id":"att-harper-yellow","personId":"harper","quizId":"yellow-stances","scorePct":100,"passed":true,"takenOn":"2026-11-21"},{"id":"att-avery-ninja","personId":"avery","quizId":"ninja-safety","scorePct":100,"passed":true,"takenOn":"2026-11-11"},{"id":"att-noah-ninja","personId":"noah","quizId":"ninja-safety","scorePct":33,"passed":false,"takenOn":"2026-11-05"}]}');
  var PEOPLE = {};
  CATALOG.people.forEach(function (person) { PEOPLE[person.id] = person; });
  var SCHOOLS = {};
  CATALOG.schools.forEach(function (school) { SCHOOLS[school.id] = school; });

  function daysBetween(from, to) {
    var a = Date.parse(from + 'T00:00:00Z');
    var b = Date.parse(to + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((b - a) / 86400000);
  }

  function addDays(iso, count) {
    return new Date(Date.parse(iso + 'T00:00:00Z') + count * 86400000).toISOString().slice(0, 10);
  }

  function students() {
    return CATALOG.people.filter(function (person) { return person.role === 'student' && person.status === 'active'; });
  }

  function testingReadiness(person, asOf) {
    var daysInRank = Math.max(0, daysBetween(person.rankAwardedOn, asOf));
    var classGap = Math.max(0, person.classesNeed - person.classes);
    var dayGap = Math.max(0, person.daysNeed - daysInRank);
    var band = classGap === 0 && dayGap === 0 ? 'ready' : classGap <= 3 && dayGap <= 14 ? 'almost' : 'needs_classes';
    return {
      band: band,
      classesAttended: person.classes,
      classesRequired: person.classesNeed,
      daysInRank: daysInRank,
      daysRequired: person.daysNeed,
      classGap: classGap,
      dayGap: dayGap,
      beltTestFeeCents: 0,
      feeModel: 'included_2027',
      feeLabel: 'Included with tuition',
    };
  }

  function missBand(daysOut) {
    if (daysOut >= 21) return '21';
    if (daysOut >= 14) return '14';
    if (daysOut >= 7) return '7';
    return null;
  }

  function hidden(person, asOf, states) {
    var state = states[person.id];
    if (!state || state.status === 'open') return false;
    if (state.status === 'resolved') return true;
    return !!(state.snoozeUntil && state.snoozeUntil >= asOf);
  }

  function personCard(person, asOf) {
    var school = SCHOOLS[person.school];
    return {
      id: person.id,
      first: person.first,
      last: person.last,
      role: person.role,
      status: person.status,
      program: person.program,
      belt: person.belt,
      plan: person.plan,
      school: person.school,
      locationName: school ? school.name : person.school,
      lastCheckIn: person.lastCheckIn,
      daysOut: Math.max(0, daysBetween(person.lastCheckIn, asOf)),
      stripes: person.stripes,
      stripesNeed: person.stripesNeed,
    };
  }

  function ownerPulse(asOf, states) {
    states = states || {};
    var schools = CATALOG.schools.map(function (school) {
      var rows = students().filter(function (person) { return person.school === school.id && !hidden(person, asOf, states); });
      return {
        locationId: school.id,
        name: school.name,
        short: school.short,
        brand: school.brand,
        activeMembers: school.active,
        trialsThisWeek: school.trials,
        missedClassRisk: rows.filter(function (person) { return missBand(daysBetween(person.lastCheckIn, asOf)); }).length,
        readyToTest: rows.filter(function (person) { return testingReadiness(person, asOf).band === 'ready'; }).length,
        attendanceToday: school.attendance,
        mtdCollectedCents: school.collectedCents,
        mtdDraftsCents: school.draftsCents,
        beltTestFeeCents: 0,
        feeModel: 'included_2027',
        feeLabel: 'Included with tuition',
      };
    });
    return {
      asOf: asOf,
      charges: false,
      sends: false,
      sent: false,
      beltTestFeeCents: 0,
      feeModel: 'included_2027',
      feeLabel: 'Included with tuition',
      schools: schools,
    };
  }

  function retentionQueue(asOf, states) {
    states = states || {};
    var bands = [
      { id: '21', title: '21+ days', tone: 'urgent' },
      { id: '14', title: '14+ days', tone: 'soon' },
      { id: '7', title: '7+ days', tone: 'watch' },
    ];
    var groups = bands.map(function (band) {
      var rows = students().filter(function (person) { return !hidden(person, asOf, states); }).map(function (person) {
        return { person: person, daysOut: daysBetween(person.lastCheckIn, asOf) };
      }).filter(function (row) { return missBand(row.daysOut) === band.id; }).sort(function (a, b) {
        return b.daysOut - a.daysOut || a.person.first.localeCompare(b.person.first);
      });
      var schools = CATALOG.schools.map(function (school) {
        return {
          locationId: school.id,
          name: school.name,
          people: rows.filter(function (row) { return row.person.school === school.id; }).map(function (row) {
            var card = personCard(row.person, asOf);
            card.band = band.id;
            card.daysOut = row.daysOut;
            return card;
          }),
        };
      }).filter(function (school) { return school.people.length; });
      return { id: band.id, title: band.title, tone: band.tone, count: rows.length, schools: schools };
    });
    return {
      asOf: asOf,
      charges: false,
      sends: false,
      sent: false,
      total: groups.reduce(function (sum, group) { return sum + group.count; }, 0),
      template: 'We miss you',
      groups: groups,
    };
  }

  function testingBoard(asOf, marks) {
    marks = marks || {};
    var bands = [
      { id: 'ready', title: 'Ready' },
      { id: 'almost', title: 'Almost Ready' },
      { id: 'needs_classes', title: 'Needs Classes' },
    ];
    var scored = students().map(function (person) {
      var card = personCard(person, asOf);
      var ready = testingReadiness(person, asOf);
      Object.keys(ready).forEach(function (key) { card[key] = ready[key]; });
      card.roster = marks[person.id] || '';
      return card;
    });
    return {
      asOf: asOf,
      charges: false,
      sends: false,
      sent: false,
      beltTestFeeCents: 0,
      feeModel: 'included_2027',
      feeLabel: 'Included with tuition',
      bands: bands.map(function (band) {
        return { id: band.id, title: band.title, people: scored.filter(function (person) { return person.band === band.id; }) };
      }),
    };
  }

  function qrPayload(kind, locationId) {
    var school = SCHOOLS[locationId];
    if (!school) return '';
    var tag = kind === 'trial' ? 'TRIAL' : kind === 'checkin' ? 'CHECKIN' : 'CHECKOUT';
    return 'LVLUP:' + tag + ':' + school.qr + ':DEMO';
  }

  function qrBoard(locationId) {
    var school = SCHOOLS[locationId] || CATALOG.schools[0];
    var codes = [
      { kind: 'trial', title: 'Walk-In Trial', detail: 'Lobby sign-up code. It saves a trial interest. It does not send a message.' },
      { kind: 'checkin', title: 'Fast Class Check-In', detail: 'Class check-in code for the front desk. It does not store a phone number.' },
      { kind: 'checkout', title: 'Pro Shop and Event Checkout', detail: 'Parent checkout preview. Nothing is charged.' },
    ];
    return {
      locationId: school.id,
      locationName: school.name,
      charges: false,
      sends: false,
      sent: false,
      codes: codes.map(function (code) {
        return {
          kind: code.kind,
          title: code.title,
          detail: code.detail,
          payload: qrPayload(code.kind, school.id),
          charged: false,
          sent: false,
        };
      }),
    };
  }

  function quizBoard(extraQuestions, extraAttempts) {
    extraQuestions = extraQuestions || [];
    extraAttempts = extraAttempts || [];
    var quizzes = CATALOG.quizzes.map(function (quiz) {
      return {
        id: quiz.id,
        program: quiz.program,
        belt: quiz.belt,
        cycle: quiz.cycle,
        title: quiz.title,
        questions: quiz.questions.concat(extraQuestions.filter(function (question) { return question.id.indexOf(quiz.id + '-') === 0; })),
      };
    });
    var attempts = CATALOG.attempts.concat(extraAttempts).map(function (attempt) {
      var person = PEOPLE[attempt.personId];
      var quiz = CATALOG.quizzes.filter(function (row) { return row.id === attempt.quizId; })[0];
      return {
        id: attempt.id,
        personId: attempt.personId,
        quizId: attempt.quizId,
        scorePct: attempt.scorePct,
        passed: attempt.passed,
        takenOn: attempt.takenOn,
        personName: person ? person.first + ' ' + person.last : attempt.personId,
        quizTitle: quiz ? quiz.title : attempt.quizId,
        belt: quiz ? quiz.belt : '',
        program: quiz ? quiz.program : '',
      };
    });
    return {
      charges: false,
      sends: false,
      sent: false,
      passPct: CATALOG.passPct,
      beltTestFeeCents: 0,
      feeModel: 'included_2027',
      feeLabel: 'Included with tuition',
      quizzes: quizzes,
      attempts: attempts,
    };
  }

  function scoreAttempt(quizId, answers, extra) {
    var quiz = CATALOG.quizzes.filter(function (row) { return row.id === quizId; })[0];
    if (!quiz) return null;
    var questions = quiz.questions.concat((extra || []).filter(function (question) { return question.id.indexOf(quiz.id + '-') === 0; }));
    var correct = 0;
    for (var i = 0; i < questions.length; i++) if (answers[i] === questions[i].answer) correct++;
    var scorePct = Math.round((correct / questions.length) * 100);
    return { quizId: quizId, scorePct: scorePct, passed: scorePct >= CATALOG.passPct, correct: correct, total: questions.length, passPct: CATALOG.passPct, charges: false, sends: false, sent: false };
  }

  function draftBody(channel, person, locationName, note) {
    if (channel === 'sms') {
      return { templateId: 'miss_you_sms', body: 'We miss you at ' + locationName + '. ' + person.first + ', your next class is waiting whenever you are ready.' };
    }
    if (channel === 'email') {
      return { templateId: 'miss_you_email', body: 'Subject: We miss you at ' + locationName + '\n\nHi ' + person.first + ', we miss you at class. Your spot is saved. This note is a draft and was not sent.' };
    }
    if (channel === 'call') {
      return { templateId: 'call_log', body: 'Call logged for ' + person.first + ' ' + person.last + ' at ' + locationName + '. Nothing was dialed.' };
    }
    return { templateId: 'quick_note', body: String(note || '').replace(/\s+/g, ' ').trim() };
  }

  function bag(store) {
    if (!store.studio || typeof store.studio !== 'object') {
      store.studio = { retention: {}, marks: {}, drafts: [], attempts: [], questions: [], scans: [] };
    }
    var studio = store.studio;
    studio.retention = studio.retention || {};
    studio.marks = studio.marks || {};
    studio.drafts = studio.drafts || [];
    studio.attempts = studio.attempts || [];
    studio.questions = studio.questions || [];
    studio.scans = studio.scans || [];
    return studio;
  }

  function flatMarks(store) {
    var marks = {};
    var raw = bag(store).marks;
    Object.keys(raw).forEach(function (id) {
      var row = raw[id] || {};
      marks[id] = row.roster ? 'roster' : row.invite ? 'invite' : '';
    });
    return marks;
  }

  function model(ctx) {
    var asOf = ctx.asOf;
    var studio = bag(ctx.store);
    var local = {
      pulse: ownerPulse(asOf, studio.retention),
      retention: retentionQueue(asOf, studio.retention),
      testing: testingBoard(asOf, flatMarks(ctx.store)),
      quizzes: quizBoard(studio.questions, studio.attempts),
      qr: qrBoard(ctx.schoolId),
    };
    if (ctx.live && ctx.ui.remoteStudio && ctx.ui.remoteStudio.pulse) {
      local.pulse = ctx.ui.remoteStudio.pulse;
      if (ctx.ui.remoteStudio.quizzes) local.quizzes.attempts = ctx.ui.remoteStudio.quizzes.attempts.concat(studio.attempts);
    }
    return local;
  }

  function dollars(cents) {
    return '$' + Math.round(cents / 100).toLocaleString('en-US');
  }

  function inScope(schoolId, scope) {
    return !scope || scope === 'all' || scope === schoolId;
  }

  function pulseHtml(ctx) {
    var esc = ctx.esc;
    var pulse = model(ctx).pulse;
    var cards = pulse.schools.map(function (school) {
      var on = ctx.schoolId === school.locationId ? ' on' : '';
      var logo = school.brand === 'goninja' ? '../../images/goninja-logo.png' : '../../images/lvlup-logo.png';
      function stat(value, label, jump) {
        var attrs = jump
          ? ' data-act="pulse-jump" data-id="' + esc(school.locationId) + '" data-to="' + jump + '"'
          : ' data-act="pulse-school" data-id="' + esc(school.locationId) + '"';
        return '<button type="button" class="pulse-stat"' + attrs + '><em>' + esc(value) + '</em><small>' + esc(label) + '</small></button>';
      }
      return '<article class="pulse-card' + on + (school.brand === 'goninja' ? ' goninja' : '') + '">' +
        '<button type="button" class="pulse-open" data-act="pulse-school" data-id="' + esc(school.locationId) + '">' +
        '<img class="pulse-logo" src="' + logo + '" alt="">' +
        '<span><strong>' + esc(school.name) + '</strong><span class="meta">Tap to show this school</span></span></button>' +
        '<div class="pulse-metrics">' +
        stat(String(school.activeMembers), 'Active members') +
        stat(String(school.trialsThisWeek), 'Trials this week', 'leads') +
        stat(String(school.missedClassRisk), 'Missed-class risk', 'retention') +
        stat(String(school.readyToTest), 'Ready to test', 'testing') +
        stat(String(school.attendanceToday), 'Attendance today') +
        stat(dollars(school.mtdCollectedCents), 'MTD revenue') +
        '</div>' +
        '<p class="pulse-drafts">Drafts ' + esc(dollars(school.mtdDraftsCents)) + ' · testing included</p>' +
        '</article>';
    }).join('');
    return '<section class="pulse" aria-label="Owner pulse"><div class="pulse-head"><h2>Owner pulse</h2><p class="meta">All 6 academies. Sandbox totals. Nothing was sent or charged.</p></div><div class="pulse-grid">' + cards + '</div></section>';
  }

  function switcher(ctx) {
    var esc = ctx.esc;
    var views = [['members', 'Members'], ['leads', 'Leads'], ['retention', 'Retention'], ['testing', 'Testing'], ['quizzes', 'Quizzes'], ['growth', 'Growth']];
    var chips = views.map(function (view) {
      var on = ctx.ui.peopleView === view[0] ? ' on' : '';
      return '<button type="button" class="chip' + on + '" data-act="people-view" data-view="' + view[0] + '">' + esc(view[1]) + '</button>';
    }).join('');
    var scope = ctx.ui.listScope || 'all';
    var schools = '<button type="button" class="chip' + (scope === 'all' ? ' on' : '') + '" data-act="list-scope" data-id="all">All schools</button>' +
      CATALOG.schools.map(function (school) {
        return '<button type="button" class="chip' + (scope === school.id ? ' on' : '') + '" data-act="list-scope" data-id="' + esc(school.id) + '">' + esc(school.short) + '</button>';
      }).join('');
    return '<div class="chips" aria-label="People">' + chips + '</div><div class="chips" aria-label="School filter">' + schools + '</div>';
  }

  function line(ctx, row, act, meta) {
    var esc = ctx.esc;
    var id = esc(row.id);
    var name = esc(row.first + ' ' + row.last);
    return '<div class="roster-line"><button type="button" class="rowbtn roster-row" data-act="' + act + '" data-id="' + id + '" data-quick-for="' + id + '">' +
      '<span class="avatar"><span class="face">' + esc(String(row.first || '?').slice(0, 1)) + '</span></span>' +
      '<span><strong>' + name + '</strong><span class="meta">' + meta + '</span></span></button>' +
      '<button type="button" class="iconbtn" data-act="quick" data-id="' + id + '" aria-label="Quick actions for ' + name + '">' + ctx.icon('message') + '</button></div>';
  }

  function lookup(id) {
    var person = PEOPLE[id];
    if (!person) return null;
    var school = SCHOOLS[person.school];
    return {
      id: person.id,
      first: person.first,
      last: person.last,
      role: person.role,
      program: person.program,
      belt: person.belt,
      school: person.school,
      plan: person.plan,
      planCents: person.plan === 'Trial' ? 0 : person.program === 'Go Ninja' ? 8900 : person.plan === 'Leadership' ? 29900 : 20900,
      status: person.status,
      tag: person.status === 'lead' ? 'Trial' : 'Active',
      soldBy: 'Alex Sample',
      card: 'ok',
      note: person.first + ' trains at ' + (school ? school.name : 'the studio') + '.',
      stripes: person.stripes,
      stripesNeed: person.stripesNeed,
      classes: person.classes,
      classesNeed: person.classesNeed,
      lastCheckIn: person.lastCheckIn,
    };
  }

  function merged(preview) {
    var seen = {};
    var rows = (preview || []).filter(function (row) { return row.role !== 'parent'; }).map(function (row) {
      seen[row.id] = true;
      var extra = PEOPLE[row.id];
      if (!extra) return row;
      return Object.assign({}, row, {
        lastCheckIn: extra.lastCheckIn,
        classes: extra.classes,
        classesNeed: extra.classesNeed,
        rankAwardedOn: extra.rankAwardedOn,
        daysNeed: extra.daysNeed,
        program: extra.program,
        belt: extra.belt,
      });
    });
    CATALOG.people.forEach(function (person) {
      if (seen[person.id]) return;
      rows.push(lookup(person.id));
    });
    return rows;
  }

  function scoped(rows, scope) {
    if (!scope || scope === 'all') return rows;
    return rows.filter(function (row) { return row.school === scope; });
  }

  function retentionHtml(ctx) {
    var esc = ctx.esc;
    var board = model(ctx).retention;
    var scope = ctx.ui.listScope || 'all';
    var blocks = board.groups.map(function (group) {
      var schools = group.schools.filter(function (school) { return inScope(school.locationId, scope); });
      var count = schools.reduce(function (sum, school) { return sum + school.people.length; }, 0);
      var body = schools.length ? schools.map(function (school) {
        return '<h3>' + esc(school.name) + '</h3>' + school.people.map(function (person) {
          return line(ctx, person, 'open', esc(person.daysOut + ' days out · ' + person.belt + ' · ' + person.program)) +
            '<div class="action-row">' +
            '<button type="button" class="big primary" data-act="retain-miss" data-id="' + esc(person.id) + '">We miss you</button>' +
            '<button type="button" class="big" data-act="log-call" data-id="' + esc(person.id) + '">Log call</button>' +
            '<button type="button" class="big" data-act="retain-snooze" data-id="' + esc(person.id) + '">Snooze 7 days</button>' +
            '<button type="button" class="big" data-act="retain-resolve" data-id="' + esc(person.id) + '">Resolved</button></div>';
        }).join('');
      }).join('') : '<p class="quiet">No one in this band.</p>';
      var countLabel = count === 1 ? '1 student' : count + ' students';
      return '<section class="band band-' + group.tone + '"><h2>' + esc(group.title) + '</h2><p class="meta">' + countLabel + '</p>' + body + '</section>';
    }).join('');
    return '<h1>Miss you</h1><p class="lede">Active students who have not checked in for 7, 14, or 21 days. The check-in is a draft. Nothing is sent.</p>' + blocks;
  }

  function testingHtml(ctx) {
    var esc = ctx.esc;
    var board = model(ctx).testing;
    var scope = ctx.ui.listScope || 'all';
    var marks = bag(ctx.store).marks;
    var bands = board.bands.map(function (band) {
      var people = band.people.filter(function (person) { return inScope(person.school, scope); });
      var rows = people.length ? people.map(function (person) {
        var mark = marks[person.id] || {};
        var badge = mark.roster ? '<span class="badge ok">On the roster</span>' : mark.invite ? '<span class="badge">Invite drafted</span>' : '';
        var gap = person.band === 'ready'
          ? 'Classes and time in rank are both met'
          : person.classGap + ' classes left · ' + person.dayGap + ' days left';
        return line(ctx, person, 'open', esc(person.belt + ' · ' + person.classesAttended + ' of ' + person.classesRequired + ' classes · ' + gap)) +
          '<div class="action-row">' + badge +
          '<button type="button" class="big primary" data-act="test-invite" data-id="' + esc(person.id) + '">Send Testing Invite</button>' +
          '<button type="button" class="big" data-act="test-roster" data-id="' + esc(person.id) + '">Add to roster</button></div>';
      }).join('') : '<p class="quiet">No one in this band.</p>';
      return '<section class="band"><h2>' + esc(band.title) + '</h2><p class="meta">' + people.length + '</p>' + rows + '</section>';
    }).join('');
    return '<h1>Ready to test</h1><p class="lede">Belt testing is included with tuition. The fee is $0. Invites are drafts and are not sent.</p>' +
      '<p class="fee-note">2027 all-inclusive testing · Included with tuition · $0</p>' + bands;
  }

  function lobbyHtml(ctx) {
    var esc = ctx.esc;
    var board = qrBoard(ctx.schoolId);
    var qr = globalThis.CrmQr;
    var cards = board.codes.map(function (code) {
      var picture = qr ? qr.svg(code.payload, code.title + ' for ' + board.locationName) : '';
      return '<article class="qr-card"><h2>' + esc(code.title) + '</h2><p>' + esc(code.detail) + '</p>' +
        '<div class="qr-frame">' + picture + '</div>' +
        '<p class="meta">' + esc(code.payload) + '</p>' +
        '<button type="button" class="big primary" data-act="qr-scan" data-payload="' + esc(code.payload) + '">Simulate scan</button></article>';
    }).join('');
    var result = ctx.ui.qrResult ? '<div class="note">' + esc(ctx.ui.qrResult) + '</div>' : '';
    return '<section class="lobby"><h2>Lobby QR</h2><p class="lede">' + esc(board.locationName) + '. Codes stay in the building. Checkout does not charge a card.</p>' +
      '<div class="qr-grid">' + cards + '</div>' +
      '<h2>Staff lookup</h2><label>Paste a lobby code<input id="qr-code" autocomplete="off" placeholder="LVLUP:CHECKIN:WAUNAKEE:DEMO"></label>' +
      '<button type="button" class="big" data-act="qr-lookup">Look up code</button>' + result + '</section>';
  }

  function quizzesHtml(ctx) {
    var esc = ctx.esc;
    var board = model(ctx).quizzes;
    var openId = ctx.ui.quizId || board.quizzes[0].id;
    var quiz = board.quizzes.filter(function (row) { return row.id === openId; })[0] || board.quizzes[0];
    var scope = ctx.ui.listScope || 'all';
    var roster = students().filter(function (person) { return inScope(person.school, scope); });
    var chosen = ctx.ui.quizPerson || (roster[0] && roster[0].id) || '';
    var list = board.quizzes.map(function (row) {
      var on = row.id === quiz.id ? ' on' : '';
      return '<button type="button" class="chip' + on + '" data-act="quiz-open" data-id="' + esc(row.id) + '">' + esc(row.belt + ' · ' + row.cycle) + '</button>';
    }).join('');
    var questions = quiz.questions.map(function (question, index) {
      var choices = question.choices.map(function (choice, choiceIndex) {
        var picked = ctx.ui.quizAnswers && ctx.ui.quizAnswers[question.id] === choiceIndex;
        return '<button type="button" class="choice' + (picked ? ' on' : '') + '" data-act="quiz-choice" data-qid="' + esc(question.id) + '" data-choice="' + choiceIndex + '">' + esc(choice) + '</button>';
      }).join('');
      return '<fieldset class="quiz-q"><legend>' + (index + 1) + '. ' + esc(question.prompt) + '</legend>' + choices + '</fieldset>';
    }).join('');
    var options = roster.map(function (person) {
      return '<option value="' + esc(person.id) + '"' + (person.id === chosen ? ' selected' : '') + '>' + esc(person.first + ' ' + person.last) + '</option>';
    }).join('');
    var attempts = board.attempts.filter(function (row) {
      var person = PEOPLE[row.personId];
      return person && inScope(person.school, scope);
    }).map(function (row) {
      return '<div class="card quiz-score"><strong>' + esc(row.personName) + '</strong><div class="meta">' + esc(row.quizTitle) + ' · ' + esc(row.takenOn) + '</div>' +
        '<span class="badge' + (row.passed ? ' ok' : '') + '">' + (row.passed ? 'Passed' : 'Not yet') + ' · ' + esc(String(row.scorePct)) + '%</span></div>';
    }).join('');
    return '<h1>Curriculum quizzes</h1><p class="lede">Belt knowledge and terminology for the current cycle. A pass is ' + esc(String(board.passPct)) + '% or better. Rank readiness stays on Testing.</p>' +
      '<div class="chips">' + list + '</div>' +
      '<article class="card quiz-card"><h2>' + esc(quiz.title) + '</h2><p class="meta">' + esc(quiz.program + ' · ' + quiz.belt + ' · ' + quiz.cycle) + '</p>' +
      questions +
      '<label>Student<select id="quiz-person">' + options + '</select></label>' +
      '<button type="button" class="big primary" data-act="quiz-score" data-id="' + esc(quiz.id) + '">Save score</button></article>' +
      '<h2>Add a question</h2><div class="card stack"><label>Question<input id="quiz-prompt" placeholder="What does charyeot mean?"></label>' +
      '<label>Choice A<input id="quiz-a" placeholder="Attention"></label><label>Choice B<input id="quiz-b" placeholder="Bow"></label>' +
      '<label>Correct choice<select id="quiz-answer"><option value="0">Choice A</option><option value="1">Choice B</option></select></label>' +
      '<button type="button" class="big" data-act="quiz-add" data-id="' + esc(quiz.id) + '">Add question</button></div>' +
      '<h2>Scores</h2>' + (attempts || '<p class="quiet">No scores for this school yet.</p>');
  }

  function bubbleHtml(ctx) {
    if (!ctx.ui.quickId) return '';
    var person = PEOPLE[ctx.ui.quickId] || null;
    var preview = (ctx.preview || []).filter(function (row) { return row.id === ctx.ui.quickId; })[0];
    var row = person || preview;
    if (!row) return '';
    var esc = ctx.esc;
    var school = SCHOOLS[row.school];
    var last = person ? person.lastCheckIn : 'this week';
    return '<div class="quick-pop" role="dialog" aria-label="Quick actions" data-for="' + esc(row.id) + '">' +
      '<div class="split"><strong>' + esc(row.first + ' ' + row.last) + '</strong><button type="button" class="ghost" data-act="quick-close">Close</button></div>' +
      '<p class="meta">' + esc((row.belt || 'Student') + ' · ' + (row.program || 'Class') + (school ? ' · ' + school.name : '')) + '</p>' +
      '<p class="meta">Last check-in ' + esc(last) + '</p>' +
      '<div class="stack">' +
      '<button type="button" class="big primary" data-act="draft-sms" data-id="' + esc(row.id) + '">Draft SMS</button>' +
      '<button type="button" class="big" data-act="draft-email" data-id="' + esc(row.id) + '">Draft Email</button>' +
      '<button type="button" class="big" data-act="log-call" data-id="' + esc(row.id) + '">Log Call</button>' +
      '<label>Quick note<textarea id="quick-note" rows="3" placeholder="Left a note at the desk."></textarea></label>' +
      '<button type="button" class="big" data-act="save-note" data-id="' + esc(row.id) + '">Save note</button>' +
      '</div><p class="meta">Drafts stay in the CRM. Nothing is sent.</p></div>';
  }

  function placeQuick() {
    if (!globalThis.document) return;
    var pop = document.querySelector('.quick-pop');
    if (!pop) return;
    var id = pop.getAttribute('data-for');
    var anchor = document.querySelector('.iconbtn[data-id="' + id + '"]');
    if (!anchor) return;
    var rect = anchor.getBoundingClientRect();
    var width = pop.offsetWidth;
    var header = 56;
    var footer = window.innerWidth < 900 ? 96 : 16;
    var room = window.innerHeight - header - footer;
    pop.style.maxHeight = room + 'px';
    var height = Math.min(pop.offsetHeight, room);
    var left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    var top = rect.bottom + 8;
    if (top + height > window.innerHeight - footer) top = rect.top - height - 8;
    if (top < header) top = header;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function personOf(id) {
    return PEOPLE[id] || null;
  }

  function post(ctx, path, body) {
    if (!ctx.live || !ctx.api) return Promise.resolve({ demo: true, ok: false });
    return ctx.api(path, { method: 'POST', body: body });
  }

  function wrote(ctx, res, text) {
    ctx.ui.holdScroll = true;
    if (!ctx.live || !res || res.demo) {
      ctx.toast('ok', text);
      return;
    }
    if (res.offline || !res.ok) ctx.toast('ok', 'Saved on this device. The sandbox did not take it. Nothing was sent.');
    else ctx.toast('ok', text);
  }

  function rememberDraft(ctx, person, channel, draft) {
    bag(ctx.store).drafts.unshift({
      id: 'draft-' + Date.now(),
      personKey: person.id,
      locationId: person.school,
      channel: channel,
      body: draft.body,
      templateId: draft.templateId,
      sent: false,
      charged: false,
    });
    ctx.save();
  }

  function handle(act, el, ctx) {
    var id = el.getAttribute('data-id');
    if (act === 'people-view') {
      ctx.ui.peopleView = el.getAttribute('data-view') || 'members';
      ctx.ui.quickId = '';
      ctx.render();
      return true;
    }
    if (act === 'list-scope') {
      var scope = el.getAttribute('data-id') || 'all';
      ctx.ui.listScope = scope;
      if (scope !== 'all') ctx.store.staffSchool = scope;
      ctx.save();
      ctx.render();
      return true;
    }
    if (act === 'pulse-school') {
      ctx.store.staffSchool = id;
      ctx.ui.listScope = id;
      ctx.ui.holdScroll = true;
      ctx.save();
      ctx.toast('ok', (SCHOOLS[id] ? SCHOOLS[id].name : 'That school') + ' is on the desk.');
      return true;
    }
    if (act === 'pulse-jump') {
      ctx.store.staffSchool = id;
      ctx.ui.listScope = id;
      ctx.ui.tab = 'people';
      ctx.ui.peopleView = el.getAttribute('data-to') || 'members';
      ctx.ui.quickId = '';
      ctx.save();
      ctx.render();
      return true;
    }
    if (act === 'quick') {
      ctx.ui.quickId = ctx.ui.quickId === id ? '' : id;
      ctx.ui.holdScroll = true;
      ctx.render();
      return true;
    }
    if (act === 'quick-close') {
      ctx.ui.quickId = '';
      ctx.ui.holdScroll = true;
      ctx.render();
      return true;
    }
    if (act === 'draft-sms' || act === 'draft-email' || act === 'log-call' || act === 'save-note') {
      var person = personOf(id);
      if (!person) return false;
      var school = SCHOOLS[person.school];
      var channel = act === 'draft-sms' ? 'sms' : act === 'draft-email' ? 'email' : act === 'log-call' ? 'call' : 'note';
      var note = '';
      if (channel === 'note' && globalThis.document) {
        var box = document.getElementById('quick-note');
        note = box ? box.value : '';
        if (note.replace(/\s+/g, ' ').trim().length < 2) {
          ctx.toast('bad', 'Write a short note.');
          return true;
        }
      }
      var draft = draftBody(channel, person, school.name, note);
      if (channel === 'note' && draft.body.length < 2) {
        ctx.toast('bad', 'Write a short note.');
        return true;
      }
      rememberDraft(ctx, person, channel, draft);
      var label = channel === 'sms' ? 'SMS draft saved.' : channel === 'email' ? 'Email draft saved.' : channel === 'call' ? 'Call logged.' : 'Note saved.';
      post(ctx, '/v1/studio/outreach', { personKey: person.id, locationId: person.school, channel: channel, note: draft.body, asOf: ctx.asOf }).then(function (res) {
        wrote(ctx, res, label + ' Nothing was sent.');
      });
      return true;
    }
    if (act === 'retain-miss' || act === 'retain-snooze' || act === 'retain-resolve') {
      var student = personOf(id);
      if (!student) return false;
      var studio = bag(ctx.store);
      var where = SCHOOLS[student.school].name;
      if (act === 'retain-miss') {
        var miss = draftBody('sms', student, where);
        rememberDraft(ctx, student, 'sms', miss);
        post(ctx, '/v1/studio/retention', { personKey: student.id, locationId: student.school, action: 'miss_you', asOf: ctx.asOf }).then(function (res) {
          wrote(ctx, res, 'We miss you draft saved for ' + student.first + '. Nothing was sent.');
        });
        return true;
      }
      if (act === 'retain-snooze') studio.retention[student.id] = { status: 'snoozed', snoozeUntil: addDays(ctx.asOf, 7) };
      else studio.retention[student.id] = { status: 'resolved' };
      ctx.save();
      post(ctx, '/v1/studio/retention', {
        personKey: student.id,
        locationId: student.school,
        action: act === 'retain-snooze' ? 'snooze' : 'resolved',
        asOf: ctx.asOf,
      }).then(function (res) {
        wrote(ctx, res, act === 'retain-snooze' ? student.first + ' is snoozed for 7 days.' : student.first + ' is marked resolved.');
      });
      return true;
    }
    if (act === 'test-invite' || act === 'test-roster') {
      var athlete = personOf(id);
      if (!athlete || athlete.role !== 'student') return false;
      var marks = bag(ctx.store).marks;
      marks[athlete.id] = marks[athlete.id] || {};
      var action = act === 'test-invite' ? 'invite' : 'roster';
      marks[athlete.id][action] = true;
      if (action === 'invite') {
        var invite = draftBody('email', athlete, SCHOOLS[athlete.school].name);
        invite.templateId = 'testing_invite';
        invite.body = athlete.first + ' is ready to test at ' + SCHOOLS[athlete.school].name + '. Belt testing is included with tuition. This invite was saved as a draft and was not sent.';
        rememberDraft(ctx, athlete, 'email', invite);
      } else ctx.save();
      post(ctx, '/v1/studio/testing', { personKey: athlete.id, locationId: athlete.school, action: action, asOf: ctx.asOf }).then(function (res) {
        wrote(ctx, res, action === 'invite'
          ? 'Testing invite drafted for ' + athlete.first + '. Fee $0. Nothing was sent.'
          : athlete.first + ' is on the testing roster. Fee $0.');
      });
      return true;
    }
    if (act === 'qr-scan' || act === 'qr-lookup') {
      var payload = act === 'qr-scan' ? el.getAttribute('data-payload') : ((document.getElementById('qr-code') || {}).value || '');
      var text = String(payload || '').trim().toUpperCase();
      var match = /^LVLUP:(TRIAL|CHECKIN|CHECKOUT):(WAUNAKEE|EASTMAD|VERONA|DEFOREST|GNW|GNV):DEMO$/.exec(text);
      if (!match) {
        ctx.toast('bad', 'That code is not a lobby code.');
        return true;
      }
      var kind = match[1] === 'TRIAL' ? 'trial' : match[1] === 'CHECKIN' ? 'checkin' : 'checkout';
      var place = CATALOG.schools.filter(function (school) { return school.qr === match[2]; })[0];
      var message = kind === 'trial'
        ? 'Trial interest saved for ' + place.name + '. No message was sent.'
        : kind === 'checkin'
          ? 'Class check-in recorded for ' + place.name + '. No card was used.'
          : 'Pro Shop and event checkout preview for ' + place.name + '. Nothing was charged.';
      bag(ctx.store).scans.unshift({ payload: text, kind: kind, charged: false });
      ctx.ui.qrResult = message;
      ctx.save();
      post(ctx, '/v1/studio/qr/scan', { payload: text }).then(function (res) {
        wrote(ctx, res, message);
      });
      return true;
    }
    if (act === 'quiz-open') {
      ctx.ui.quizId = id;
      ctx.ui.quizAnswers = {};
      ctx.render();
      return true;
    }
    if (act === 'quiz-choice') {
      ctx.ui.quizAnswers = ctx.ui.quizAnswers || {};
      ctx.ui.quizAnswers[el.getAttribute('data-qid')] = Number(el.getAttribute('data-choice'));
      ctx.ui.holdScroll = true;
      ctx.render();
      return true;
    }
    if (act === 'quiz-score') {
      var quiz = CATALOG.quizzes.filter(function (row) { return row.id === id; })[0];
      var extras = bag(ctx.store).questions;
      var questions = quiz.questions.concat(extras.filter(function (question) { return question.id.indexOf(quiz.id + '-') === 0; }));
      var answers = questions.map(function (question) { return (ctx.ui.quizAnswers || {})[question.id]; });
      if (answers.some(function (choice) { return choice == null; })) {
        ctx.toast('bad', 'Answer every question.');
        return true;
      }
      var who = (document.getElementById('quiz-person') || {}).value || ctx.ui.quizPerson;
      if (!PEOPLE[who]) {
        ctx.toast('bad', 'Pick a student.');
        return true;
      }
      var scored = scoreAttempt(id, answers, extras);
      bag(ctx.store).attempts.unshift({ id: 'local-' + Date.now(), personId: who, quizId: id, scorePct: scored.scorePct, passed: scored.passed, takenOn: ctx.asOf });
      ctx.ui.quizPerson = who;
      ctx.save();
      post(ctx, '/v1/studio/quizzes', { action: 'attempt', quizId: id, personKey: who, answers: answers, asOf: ctx.asOf }).then(function (res) {
        wrote(ctx, res, PEOPLE[who].first + (scored.passed ? ' passed' : ' did not pass yet') + ' with ' + scored.scorePct + '%.');
      });
      return true;
    }
    if (act === 'quiz-add') {
      var prompt = ((document.getElementById('quiz-prompt') || {}).value || '').replace(/\s+/g, ' ').trim();
      var choiceA = ((document.getElementById('quiz-a') || {}).value || '').replace(/\s+/g, ' ').trim();
      var choiceB = ((document.getElementById('quiz-b') || {}).value || '').replace(/\s+/g, ' ').trim();
      if (prompt.length < 2 || choiceA.length < 2 || choiceB.length < 2) {
        ctx.toast('bad', 'Write a short question and two choices.');
        return true;
      }
      if (/tel:|sms:/i.test(prompt + choiceA + choiceB)) {
        ctx.toast('bad', 'Leave phone numbers off this form.');
        return true;
      }
      var answer = Number((document.getElementById('quiz-answer') || {}).value || 0) === 1 ? 1 : 0;
      var qid = id + '-' + String(Date.now()).slice(-8);
      bag(ctx.store).questions.push({ id: qid, prompt: prompt, choices: [choiceA, choiceB], answer: answer });
      ctx.ui.quizId = id;
      ctx.save();
      post(ctx, '/v1/studio/quizzes', { action: 'question', quizId: id, prompt: prompt, choiceA: choiceA, choiceB: choiceB, answer: answer }).then(function (res) {
        wrote(ctx, res, 'Question added for instructors.');
      });
      return true;
    }
    return false;
  }

  return {
    ownerPulse: ownerPulse,
    retentionQueue: retentionQueue,
    testingBoard: testingBoard,
    qrBoard: qrBoard,
    quizBoard: quizBoard,
    scoreAttempt: scoreAttempt,
    testingReadiness: testingReadiness,
    pulseHtml: pulseHtml,
    switcher: switcher,
    line: line,
    retentionHtml: retentionHtml,
    testingHtml: testingHtml,
    lobbyHtml: lobbyHtml,
    quizzesHtml: quizzesHtml,
    bubbleHtml: bubbleHtml,
    placeQuick: placeQuick,
    lookup: lookup,
    merged: merged,
    scoped: scoped,
    handle: handle,
    schools: CATALOG.schools,
  };
});
