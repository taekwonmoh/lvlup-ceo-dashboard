/* Staff control for Go Ninja household sibling discounts. Sample only. */
(function () {
  var HD = window.HouseholdDiscounts;
  var view = { locationId: 'goninjaW', program: 'all' };
  var bag = null;

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
    return sign + '$' + Math.floor(abs / 100).toLocaleString('en-US') + '.' + String(abs % 100).padStart(2, '0');
  }

  function ensure() {
    if (bag) return;
    var stored = null;
    try { stored = HD.rulesFromStorage(localStorage.getItem(HD.STORAGE_KEY)); } catch (err) { stored = null; }
    bag = stored || HD.defaultRules();
  }

  function idFor(locationId, program) {
    var loc = locationId === 'goninjaV' ? 'gnv' : locationId === 'all' ? 'all' : 'gnw';
    return loc + '-' + String(program).replace(/_/g, '-');
  }

  function find(locationId, program) {
    ensure();
    return bag.filter(function (rule) {
      return rule.locationId === locationId && rule.program === program;
    })[0] || null;
  }

  function current() {
    return find(view.locationId, view.program) || HD.defaultRules().filter(function (rule) {
      return rule.locationId === view.locationId && rule.program === view.program;
    })[0];
  }

  function upsert(rule) {
    ensure();
    bag = bag.filter(function (row) {
      return !(row.locationId === rule.locationId && row.program === rule.program);
    }).concat([rule]);
  }

  function field(id) {
    return document.getElementById(id);
  }

  function showMulti(program) {
    return program === 'summer_camp' || program === 'all';
  }

  function readSpec(kindId, valueId, label) {
    var kind = field(kindId).value === 'amount' ? 'amount' : 'percent';
    var raw = field(valueId).value;
    if (kind === 'amount') {
      var dollars = Number(raw);
      if (!Number.isFinite(dollars) || dollars < 0) return { error: label + ' needs a dollar amount that is 0 or more.' };
      return { spec: { kind: 'amount', percentOff: null, amountOffCents: Math.round(dollars * 100) } };
    }
    var pct = Number(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: label + ' needs a percent from 0 to 100.' };
    return { spec: { kind: 'percent', percentOff: pct, amountOffCents: null } };
  }

  function readForm(fixed) {
    if (!field('hh-loc')) return { error: 'Open the discount card again.' };
    var locationId = fixed && fixed.locationId ? fixed.locationId : field('hh-loc').value;
    var program = fixed && fixed.program ? fixed.program : field('hh-program').value;
    var second = readSpec('hh-second-kind', 'hh-second', '2nd child');
    if (second.error) return second;
    var third = readSpec('hh-third-kind', 'hh-third', '3rd+ child');
    if (third.error) return third;
    var multi = null;
    if (showMulti(program) && field('hh-multi-min') && field('hh-multi-min').value !== '') {
      var bundle = readSpec('hh-multi-kind', 'hh-multi', 'Multi-week savings');
      if (bundle.error) return bundle;
      multi = { minWeeks: Number(field('hh-multi-min').value), discount: bundle.spec };
    }
    try {
      return {
        rule: HD.cleanRule({
          id: idFor(locationId, program),
          locationId: locationId,
          program: program,
          active: field('hh-active').getAttribute('aria-pressed') === 'true',
          mode: field('hh-mode').value === 'best' ? 'best' : 'stackable',
          secondChild: second.spec,
          thirdPlus: third.spec,
          multiWeek: multi,
        }),
      };
    } catch (err) {
      return { error: err.message || 'Check the discount fields.' };
    }
  }

  function valueOf(spec) {
    if (!spec || spec.kind === 'amount') return ((spec && spec.amountOffCents) || 0) / 100;
    return spec.percentOff;
  }

  function example(rule) {
    var program = rule.program === 'all' ? 'ninja_8wk' : rule.program;
    var price = program === 'summer_camp' ? 24900 : program === 'afterschool' ? 28000 : program === 'pno' ? 3500 : 18900;
    var loc = rule.locationId === 'all' ? 'goninjaW' : rule.locationId;
    var lines = ['one', 'two', 'three'].map(function (key, index) {
      var weeks = program === 'summer_camp' ? (index === 0 ? 3 : 1) : 1;
      return {
        lineId: key,
        childKey: key,
        program: program,
        locationId: loc,
        unitPriceCents: price,
        quantity: weeks,
        weeks: weeks,
      };
    });
    return HD.quoteHousehold({ rules: [rule], lines: lines });
  }

  function liveHtml(rule, error) {
    if (error) return '<p class="meta">' + esc(error) + '</p>';
    var quote = example(rule);
    var names = ['Sample child 1', 'Sample child 2', 'Sample child 3'];
    var campNote = '';
    if (rule.multiWeek && rule.program !== 'summer_camp') {
      var loc = rule.locationId === 'all' ? 'goninjaW' : rule.locationId;
      var camp = HD.quoteHousehold({
        rules: [rule],
        lines: [{
          lineId: 'camp',
          childKey: 'one',
          program: 'summer_camp',
          locationId: loc,
          unitPriceCents: 24900,
          quantity: rule.multiWeek.minWeeks,
          weeks: rule.multiWeek.minWeeks,
        }],
      });
      var kid = camp.children[0];
      campNote = '<p class="meta">Camp bundle sample: ' + esc(rule.multiWeek.minWeeks) + ' weeks, list ' + esc(money(kid.listCents)) + ', due ' + esc(money(kid.dueCents)) + '.</p>';
    }
    return quote.children.map(function (child, index) {
      var extra = '';
      if (child.siblingLabel) extra += ' · ' + child.siblingLabel;
      if (child.multiWeekLabel) extra += ' · ' + child.multiWeekLabel;
      return '<div class="hh-line"><span>' + esc(names[index] + extra) + '</span><strong>' + esc(money(child.dueCents)) + '</strong></div>';
    }).join('') + '<div class="hh-line hh-total"><span>Sample due</span><strong>' + esc(money(quote.dueCents)) + '</strong></div>' +
      '<p class="meta">List ' + esc(money(quote.listCents)) + ' · Savings ' + esc(money(quote.discountCents)) + ' · No real charges.</p>' + campNote;
  }

  function paintLive() {
    var box = document.getElementById('hh-live');
    if (!box) return;
    var read = readForm();
    box.innerHTML = liveHtml(read.rule, read.error);
  }

  function panel() {
    var rule = current();
    var programs = [
      ['all', 'All Go Ninja programs'],
      ['ninja_8wk', '8-week academy'],
      ['summer_camp', 'Summer camp'],
      ['afterschool', 'Afterschool'],
      ['pno', 'Parents night out'],
    ];
    function opts(list, currentValue) {
      return list.map(function (row) {
        var id = row[0];
        var label = row[1];
        return '<option value="' + esc(id) + '"' + (id === currentValue ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join('');
    }
    var multi = showMulti(rule.program);
    var multiFields = multi
      ? '<label>Camp weeks before the bundle<input id="hh-multi-min" inputmode="numeric" value="' + esc(rule.multiWeek ? rule.multiWeek.minWeeks : '') + '" placeholder="3"></label>' +
        '<label>Bundle type<select id="hh-multi-kind"><option value="percent"' + (!rule.multiWeek || rule.multiWeek.discount.kind === 'percent' ? ' selected' : '') + '>Percent</option><option value="amount"' + (rule.multiWeek && rule.multiWeek.discount.kind === 'amount' ? ' selected' : '') + '>Dollars off</option></select></label>' +
        '<label>Bundle amount<input id="hh-multi" inputmode="decimal" value="' + esc(rule.multiWeek ? valueOf(rule.multiWeek.discount) : '') + '"></label>'
      : '';
    return '<section class="hh-card" id="hh-card"><div class="hh-top"><div><p class="qbo-kicker">Go Ninja</p><h2>Household &amp; Sibling Discounts</h2>' +
      '<p class="lede">1st child pays the sample price. The 2nd child and each child after that discount automatically, including when a sibling is already enrolled.</p></div>' +
      '<a class="big primary" href="goninja.html">Open Go Ninja web preview</a></div>' +
      '<div class="hh-grid"><label>School<select id="hh-loc">' + opts([['goninjaW', 'Go Ninja Waunakee'], ['goninjaV', 'Go Ninja Verona'], ['all', 'Both Go Ninja schools']], rule.locationId) + '</select></label>' +
      '<label>Program<select id="hh-program">' + opts(programs, rule.program) + '</select></label>' +
      '<label>When two discounts apply<select id="hh-mode"><option value="stackable"' + (rule.mode === 'stackable' ? ' selected' : '') + '>Stack both</option><option value="best"' + (rule.mode === 'best' ? ' selected' : '') + '>Use the larger one</option></select></label>' +
      '<label>2nd child<select id="hh-second-kind"><option value="percent"' + (rule.secondChild.kind === 'percent' ? ' selected' : '') + '>Percent</option><option value="amount"' + (rule.secondChild.kind === 'amount' ? ' selected' : '') + '>Dollars off</option></select></label>' +
      '<label>2nd child amount<input id="hh-second" inputmode="decimal" value="' + esc(valueOf(rule.secondChild)) + '"></label>' +
      '<label>3rd+ child<select id="hh-third-kind"><option value="percent"' + (rule.thirdPlus.kind === 'percent' ? ' selected' : '') + '>Percent</option><option value="amount"' + (rule.thirdPlus.kind === 'amount' ? ' selected' : '') + '>Dollars off</option></select></label>' +
      '<label>3rd+ child amount<input id="hh-third" inputmode="decimal" value="' + esc(valueOf(rule.thirdPlus)) + '"></label>' +
      multiFields + '</div>' +
      '<button type="button" class="chip' + (rule.active ? ' on' : '') + '" id="hh-active" data-act="hh-active" aria-pressed="' + (rule.active ? 'true' : 'false') + '">' + (rule.active ? 'Rule on' : 'Rule off') + '</button>' +
      '<div id="hh-live">' + liveHtml(rule) + '</div>' +
      '<div class="hh-actions"><button type="button" class="big primary" data-act="hh-save">Save discount rules</button>' +
      '<button type="button" class="big" data-act="hh-reset">Restore sample defaults</button></div>' +
      '<p class="meta">Sample studio preview. Tuition can pass the card fee. Pro Shop stays off. Belt testing is included with tuition.</p>' +
      '<div class="chips"><a class="chip" href="goninja.html#academy">8-week academy</a><a class="chip" href="goninja.html#camp">Summer camp</a><a class="chip" href="goninja.html#afterschool">Afterschool</a></div></section>';
  }

  function persist(ctx, text) {
    try { localStorage.setItem(HD.STORAGE_KEY, JSON.stringify(bag)); } catch (err) { /* private mode */ }
    ctx.toast('ok', text);
    ctx.render();
  }

  function handle(act, el, ctx) {
    if (!act || act.indexOf('hh-') !== 0) return false;
    if (act === 'hh-reset') {
      try { localStorage.removeItem(HD.STORAGE_KEY); } catch (err) { /* private mode */ }
      bag = HD.defaultRules();
      view = { locationId: 'goninjaW', program: 'all' };
      ctx.toast('ok', 'Sample sibling discounts restored. Nothing was charged.');
      ctx.render();
      return true;
    }
    if (act === 'hh-active') {
      var read = readForm();
      if (read.error) { ctx.toast('bad', read.error); return true; }
      read.rule.active = !read.rule.active;
      view = { locationId: read.rule.locationId, program: read.rule.program };
      upsert(read.rule);
      ctx.render();
      return true;
    }
    if (act === 'hh-save') {
      var saved = readForm();
      if (saved.error) { ctx.toast('bad', saved.error); return true; }
      view = { locationId: saved.rule.locationId, program: saved.rule.program };
      upsert(saved.rule);
      persist(ctx, 'Discount rules saved on this iPad. Nothing was charged.');
      return true;
    }
    return false;
  }

  function changed(target, ctx) {
    if (target.id !== 'hh-loc' && target.id !== 'hh-program') {
      paintLive();
      return;
    }
    var read = readForm(view);
    var nextLoc = target.id === 'hh-loc' ? target.value : view.locationId;
    var nextProgram = target.id === 'hh-program' ? target.value : view.program;
    if (!read.error && read.rule) {
      try { upsert(read.rule); } catch (err) { /* keep the previous rule */ }
    }
    view = { locationId: nextLoc, program: nextProgram };
    ctx.render();
  }

  window.CrmHousehold = {
    panel: panel,
    handle: handle,
    changed: changed,
    typed: paintLive,
  };
})();
