/* Attrition and CAC screens for the staff preview. Synthetic counts only. */
(function (root) {
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function api() { return root.LvlupGrowth; }

  function money(cents) {
    var lib = api();
    return lib ? lib.formatMoney(cents) : 'n/a';
  }

  function pct(value) {
    var lib = api();
    return lib ? lib.formatPct(value) : 'n/a';
  }

  function signed(value) {
    var n = Number(value) || 0;
    return n > 0 ? '+' + n : String(n);
  }

  function cellFor(cells, school, month) {
    return (cells || []).filter(function (row) { return row.locationId === school && row.month === month; })[0] || null;
  }

  function spendText(cells, school, month, channel, draft) {
    var key = school + '|' + month + '|' + channel;
    if (draft && Object.prototype.hasOwnProperty.call(draft, key)) return draft[key];
    var cell = cellFor(cells, school, month);
    var cents = cell && cell.channels && cell.channels[channel] ? cell.channels[channel].spendCents : 0;
    return (Number(cents) / 100).toFixed(2);
  }

  function pill(onTrack) {
    return onTrack
      ? '<span class="growth-pill on">At or under 3%</span>'
      : '<span class="growth-pill watch">Above 3%</span>';
  }

  function metrics(card) {
    return '<div class="pulse-metrics">' +
      '<div><span>Monthly attrition</span><strong data-metric="attrition">' + esc(pct(card.attritionPct)) + '</strong></div>' +
      '<div><span>Blended CAC</span><strong data-metric="cac">' + esc(money(card.blendedCacCents)) + '</strong></div>' +
      '<div><span>Net growth</span><strong>' + esc(signed(card.netGrowth)) + '</strong></div>' +
      '<div><span>Retention</span><strong>' + esc(pct(card.retentionPct)) + '</strong></div>' +
      '</div>';
  }

  function strip(schoolId, cells) {
    var lib = api();
    if (!lib) return '';
    var pulse;
    try { pulse = lib.pulseReport(schoolId, '2026-11', cells); }
    catch (err) { return ''; }
    var card = pulse.rollup;
    return '<button type="button" class="pulse-strip" data-act="growth-open" data-view="pulse" data-school="' + esc(schoolId) + '">' +
      '<span class="pulse-kicker">Owner Pulse</span>' +
      '<span><strong data-metric="attrition">' + esc(pct(card.attritionPct)) + '</strong><em>Attrition</em></span>' +
      '<span><strong data-metric="cac">' + esc(money(card.blendedCacCents)) + '</strong><em>Blended CAC</em></span>' +
      '<span class="pulse-link">Open</span></button>';
  }

  function switcher(view) {
    function btn(id, label) {
      var on = view === id;
      return '<button type="button"' + (on ? ' class="on" aria-current="page"' : '') + ' data-act="growth-view" data-view="' + id + '">' + label + '</button>';
    }
    return '<div class="segment growth-switch" role="tablist" aria-label="Growth">' +
      btn('pulse', 'Owner Pulse') + btn('attrition', 'Attrition') + btn('cac', 'CAC') + btn('ask', 'Ask LVLUP') +
      '</div>';
  }

  function monthChips(month) {
    var lib = api();
    return '<div class="chips" aria-label="Month">' + lib.GROWTH_MONTHS.map(function (key) {
      var on = key === month ? ' on' : '';
      return '<button type="button" class="chip' + on + '" data-act="growth-month" data-month="' + key + '"' + (key === month ? ' aria-pressed="true"' : '') + '>' + esc(lib.monthShort(key)) + '</button>';
    }).join('') + '</div>';
  }

  function scopeChips(scope) {
    var lib = api();
    var rows = [{ id: 'all', name: 'All schools' }, { id: 'lvlup', name: 'LVLUP' }, { id: 'goninja', name: 'Go Ninja' }].concat(lib.GROWTH_SCHOOLS.map(function (row) {
      return { id: row.id, name: row.name };
    }));
    return '<div class="chips growth-chips" aria-label="Schools">' + rows.map(function (row) {
      var on = row.id === scope ? ' on' : '';
      return '<button type="button" class="chip' + on + '" data-act="growth-scope" data-scope="' + esc(row.id) + '">' + esc(row.name) + '</button>';
    }).join('') + '</div>';
  }

  function pulsePage(pulse) {
    var rollup = '<article class="pulse-card rollup"><p class="pulse-kicker">All in this view</p><h2>' + esc(pulse.rollup.name) + '</h2>' +
      pill(pulse.rollup.onTrack) + metrics(pulse.rollup) +
      '<div class="pulse-actions"><button type="button" class="big" data-act="growth-open" data-view="attrition" data-school="' + esc(pulse.scope) + '">Attrition detail</button>' +
      '<button type="button" class="big" data-act="growth-open" data-view="cac" data-school="' + esc(pulse.scope) + '">CAC detail</button></div></article>';
    var cards = pulse.schools.map(function (card) {
      return '<article class="pulse-card"><p class="pulse-kicker">' + esc(card.brand === 'goninja' ? 'Go Ninja' : 'LVLUP') + '</p><h3>' + esc(card.name) + '</h3>' +
        pill(card.onTrack) + (card.earlyDrop ? '<span class="growth-pill early">Early drop</span>' : '') +
        metrics(card) +
        '<div class="pulse-actions"><button type="button" class="big" data-act="growth-open" data-view="attrition" data-school="' + esc(card.id) + '">Attrition</button>' +
        '<button type="button" class="big" data-act="growth-open" data-view="cac" data-school="' + esc(card.id) + '">CAC</button></div></article>';
    }).join('');
    return rollup + '<div class="pulse-grid">' + cards + '</div>';
  }

  function trend(report) {
    var max = 8;
    report.trend.forEach(function (row) {
      if (row.attritionPct != null && row.attritionPct > max) max = Math.ceil(row.attritionPct);
    });
    var goalRatio = report.goalPct / max;
    var cols = report.trend.map(function (row) {
      var height = row.attritionPct == null ? 0 : Math.max(8, (row.attritionPct / max) * 100);
      var hot = row.attritionPct != null && row.attritionPct > report.goalPct;
      var on = row.month === report.month ? ' on' : '';
      return '<button type="button" class="trend-col' + on + '" data-act="growth-month" data-month="' + row.month + '" aria-pressed="' + (row.month === report.month ? 'true' : 'false') + '">' +
        '<span class="trend-track"><span class="trend-bar' + (hot ? ' hot' : '') + '" style="height:' + height.toFixed(1) + '%"></span></span>' +
        '<span class="trend-val">' + esc(pct(row.attritionPct)) + '</span>' +
        '<span class="trend-mo">' + esc(row.short) + '</span></button>';
    }).join('');
    return '<div class="trend" style="--goal-ratio:' + goalRatio.toFixed(4) + '" role="group" aria-label="Six month attrition">' +
      '<i class="trend-goal" title="3% goal"></i>' + cols + '</div><p class="meta">Dashed line is the 3% goal. Tap a month.</p>';
  }

  function bars(rows) {
    var max = 1;
    rows.forEach(function (row) { if (row.count > max) max = row.count; });
    return rows.map(function (row) {
      return '<div class="count-row"><div class="split"><strong>' + esc(row.name) + '</strong><span class="tabular">' + row.count + '</span></div>' +
        '<div class="bar"><span style="width:' + Math.round((row.count / max) * 100) + '%"></span></div></div>';
    }).join('');
  }

  function attritionPage(report) {
    var summary = report.summary;
    var head = '<div class="kpis growth-kpis">' +
      '<div class="kpi"><span>Attrition</span><strong>' + esc(pct(summary.attritionPct)) + '</strong></div>' +
      '<div class="kpi"><span>Net growth</span><strong>' + esc(signed(summary.netGrowth)) + '</strong></div>' +
      '<div class="kpi"><span>Retention</span><strong>' + esc(pct(summary.retentionPct)) + '</strong></div>' +
      '<div class="kpi"><span>Canceled</span><strong>' + summary.cancellations + '</strong></div></div>' +
      '<p class="meta">Attrition is cancellations divided by starting active members. Retention is 100% minus attrition. Net growth is new enrollments minus cancellations.</p>';
    var tableHead = '<div class="growth-row growth-head" role="row"><span>School</span><span>Start</span><span>New</span><span>Lost</span><span>Attrition</span><span>Net</span><span>Retention</span></div>';
    var lines = report.bySchool.map(function (row) {
      return '<div class="growth-row" role="row">' +
        '<span data-label="School"><strong>' + esc(row.name) + '</strong>' + (row.earlyDrop ? '<em class="growth-pill early">Early drop</em>' : '') + '</span>' +
        '<span data-label="Start">' + row.startingActive + '</span>' +
        '<span data-label="New">' + row.newEnrollments + '</span>' +
        '<span data-label="Lost">' + row.cancellations + '</span>' +
        '<span data-label="Attrition">' + esc(pct(row.attritionPct)) + '</span>' +
        '<span data-label="Net">' + esc(signed(row.netGrowth)) + '</span>' +
        '<span data-label="Retention">' + esc(pct(row.retentionPct)) + '</span></div>';
    }).join('');
    var total = '<div class="growth-row total" role="row"><span data-label="School"><strong>' + esc(summary.name) + '</strong></span>' +
      '<span data-label="Start">' + summary.startingActive + '</span><span data-label="New">' + summary.newEnrollments + '</span>' +
      '<span data-label="Lost">' + summary.cancellations + '</span><span data-label="Attrition">' + esc(pct(summary.attritionPct)) + '</span>' +
      '<span data-label="Net">' + esc(signed(summary.netGrowth)) + '</span><span data-label="Retention">' + esc(pct(summary.retentionPct)) + '</span></div>';
    return head + '<h2>6-month trend</h2>' + trend(report) +
      '<div class="growth-table" role="table" aria-label="Monthly attrition by school">' + tableHead + lines + total + '</div>' +
      '<button type="button" class="big primary" data-act="attrition-csv">Download attrition CSV</button>' +
      '<div class="split-panels"><section><h2>Why students left</h2>' + bars(report.reasons) + '</section>' +
      '<section><h2>How long they had trained</h2>' + bars(report.tenure) + '</section></div>';
  }

  function channelRows(channels) {
    return channels.map(function (row) {
      return '<div class="growth-row channel" role="row">' +
        '<span data-label="Channel"><strong>' + esc(row.name) + '</strong></span>' +
        '<span data-label="Spend">' + esc(money(row.spendCents)) + '</span>' +
        '<span data-label="Leads">' + row.leads + '</span>' +
        '<span data-label="Trials">' + row.trials + '</span>' +
        '<span data-label="New members">' + row.newMembers + '</span>' +
        '<span data-label="Cost per lead">' + esc(money(row.costPerLeadCents)) + '</span>' +
        '<span data-label="Cost per trial">' + esc(money(row.costPerTrialCents)) + '</span>' +
        '<span data-label="CAC">' + esc(money(row.cacCents)) + '</span></div>';
    }).join('');
  }

  function channelHead() {
    return '<div class="growth-row growth-head channel" role="row"><span>Channel</span><span>Spend</span><span>Leads</span><span>Trials</span><span>New</span><span>Per lead</span><span>Per trial</span><span>CAC</span></div>';
  }

  function econ(summary) {
    function tile(label, value) {
      return '<div class="kpi"><span>' + label + '</span><strong>' + esc(value) + '</strong></div>';
    }
    var ratio = summary.ltvCacRatio == null ? 'n/a' : summary.ltvCacRatio.toFixed(1) + ' : 1';
    var payback = summary.paybackMonths == null ? 'n/a' : summary.paybackMonths.toFixed(1);
    return '<div class="kpis growth-kpis econ">' +
      tile('Blended CAC', money(summary.blendedCacCents)) +
      tile('Paid-only CAC', money(summary.paidCacCents)) +
      tile('Avg monthly tuition', money(summary.avgTuitionCents)) +
      tile('LTV', money(summary.ltvCents)) +
      tile('LTV : CAC', ratio) +
      tile('Payback, months', payback) +
      '</div><p class="meta">Blended CAC is all marketing spend divided by new enrolled students. Paid-only CAC uses Google Ads and Meta / Facebook Ads. LTV is average monthly tuition times average length of stay. Payback is blended CAC divided by that tuition.</p>';
  }

  function spendPanel(ctx, lib) {
    var school = ctx.spendSchool;
    var schoolName = (lib.schoolById(school) || {}).name || school;
    var chips = lib.GROWTH_SCHOOLS.map(function (row) {
      var on = row.id === school ? ' on' : '';
      return '<button type="button" class="chip' + on + '" data-act="spend-school" data-id="' + esc(row.id) + '">' + esc(row.name) + '</button>';
    }).join('');
    var fields = lib.CHANNELS.map(function (channel) {
      var key = school + '|' + ctx.month + '|' + channel.id;
      var value = spendText(ctx.cells, school, ctx.month, channel.id, ctx.draft);
      return '<label>' + esc(channel.name) + '<input class="spend-input" data-key="' + esc(key) + '" inputmode="decimal" autocomplete="off" aria-label="' + esc(channel.name + ' spend') + '" value="' + esc(value) + '"></label>';
    }).join('');
    var error = ctx.spendError ? '<p class="spend-error">' + esc(ctx.spendError) + '</p>' : '';
    return '<section class="spend-panel"><h2>Monthly ad spend</h2>' +
      '<p class="lede">Enter dollars for ' + esc(schoolName) + ' in ' + esc(lib.monthLabel(ctx.month)) + '. Save keeps them on this iPad in Demo, and in the sandbox when Live is signed in.</p>' +
      '<div class="chips growth-chips" aria-label="Spend school">' + chips + '</div>' +
      '<div class="spend-grid">' + fields + '</div>' + error +
      '<button type="button" class="big primary" data-act="spend-save">Save spend</button></section>';
  }

  function cacPage(ctx, report) {
    var lib = api();
    var groups = report.bySchool.length > 1 ? report.bySchool.map(function (school) {
      return '<h3>' + esc(school.name) + '</h3><div class="growth-table" role="table" aria-label="CAC for ' + esc(school.name) + '">' + channelHead() + channelRows(school.channels) + '</div>';
    }).join('') : '';
    return econ(report.summary) + spendPanel(ctx, lib) +
      '<h2>Channel comparison</h2><p class="meta">' + esc(report.summary.name) + ' · ' + esc(report.monthLabel) + '</p>' +
      '<div class="growth-table" role="table" aria-label="CAC by channel">' + channelHead() + channelRows(report.channels) + '</div>' +
      groups +
      '<button type="button" class="big primary" data-act="cac-csv">Download CAC CSV</button>';
  }

  function askPage(ctx) {
    var chips = [
      'What was our attrition rate last month?',
      'What is our CAC by school and channel?',
      'Which school has the highest attrition?',
      'Why are students leaving?',
      'What is our LTV to CAC ratio?',
    ];
    var buttons = chips.map(function (text) {
      return '<button type="button" class="chip" data-act="ask-chip" data-q="' + esc(text) + '">' + esc(text) + '</button>';
    }).join('');
    var answer = ctx.askAnswer
      ? '<div class="ask-answer" role="status">' + esc(ctx.askAnswer) + '</div>'
      : '<p class="lede">Ask in a sentence. The answer uses the sample studio.</p>';
    return '<h2>Ask LVLUP CRM</h2>' + answer +
      '<div class="chips ask-chips">' + buttons + '</div>' +
      '<label>Question<textarea id="ask-q">' + esc(ctx.askText || '') + '</textarea></label>' +
      '<button type="button" class="big primary" data-act="ask-go">Ask</button>';
  }

  function page(ctx) {
    var lib = api();
    if (!lib) return '<h1>Attrition &amp; CAC</h1><p class="lede">Growth figures are not in this preview.</p>';
    var month = (lib.GROWTH_MONTHS.indexOf(ctx.month) >= 0) ? ctx.month : '2026-11';
    var scope = ctx.scope || 'all';
    var note = ctx.note ? '<div class="note">' + esc(ctx.note) + '</div>' : '';
    var intro = '<h1>Attrition &amp; CAC</h1>' + note +
      '<p class="lede">Sample studio for all 6 schools. These counts are not live billing. Nothing is charged.</p>' +
      switcher(ctx.view || 'pulse') + monthChips(month) + scopeChips(scope);
    var body = '';
    if ((ctx.view || 'pulse') === 'attrition') body = attritionPage(lib.attritionReport(scope, month, ctx.cells));
    else if (ctx.view === 'cac') body = cacPage(ctx, lib.cacReport(scope, month, ctx.cells));
    else if (ctx.view === 'ask') body = askPage(ctx);
    else body = pulsePage(lib.pulseReport(scope, month, ctx.cells));
    return intro + body;
  }

  root.LvlupGrowthView = { page: page, strip: strip };
})(typeof globalThis !== 'undefined' ? globalThis : this);
