/* Growth & Metrics. One view for the funnel, attrition, and acquisition cost. */
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

  function mom(value) {
    if (value == null) return '';
    return '<em class="mom">' + esc(signed(value) + '% vs last month') + '</em>';
  }

  function spendText(cells, school, month, channel, draft) {
    var key = school + '|' + month + '|' + channel;
    if (draft && Object.prototype.hasOwnProperty.call(draft, key)) return draft[key];
    var cell = (cells || []).filter(function (row) { return row.locationId === school && row.month === month; })[0];
    var cents = cell && cell.channels && cell.channels[channel] ? cell.channels[channel].spendCents : 0;
    return (Number(cents) / 100).toFixed(2);
  }

  function monthChips(month) {
    var lib = api();
    return '<div class="chips" aria-label="Month">' + lib.GROWTH_MONTHS.map(function (key) {
      var on = key === month ? ' on' : '';
      return '<button type="button" class="chip' + on + '" data-act="growth-month" data-month="' + key + '"' + (key === month ? ' aria-pressed="true"' : '') + '>' + esc(lib.monthShort(key)) + '</button>';
    }).join('') + '</div>';
  }

  function kpi(label, value, note) {
    return '<div class="kpi"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong>' + (note || '') + '</div>';
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

  function schoolTable(report) {
    var head = '<div class="growth-row growth-head" role="row"><span>School</span><span>Leads</span><span>Trials</span><span>New</span><span>Lead to member</span><span>Attrition</span><span>Net</span><span>CAC</span></div>';
    var lines = report.bySchool.map(function (row) {
      return '<div class="growth-row" role="row">' +
        '<span data-label="School"><strong>' + esc(row.name) + '</strong></span>' +
        '<span data-label="Leads">' + row.leads + '</span>' +
        '<span data-label="Trials">' + row.trials + '</span>' +
        '<span data-label="New">' + row.newMembers + '</span>' +
        '<span data-label="Lead to member">' + esc(pct(row.leadToMemberPct)) + '</span>' +
        '<span data-label="Attrition">' + esc(pct(row.attritionPct)) + '</span>' +
        '<span data-label="Net">' + esc(signed(row.netGrowth)) + '</span>' +
        '<span data-label="CAC">' + esc(money(row.blendedCacCents)) + '</span></div>';
    }).join('');
    var summary = report.summary;
    var total = '<div class="growth-row total" role="row"><span data-label="School"><strong>All in this view</strong></span>' +
      '<span data-label="Leads">' + summary.leads + '</span><span data-label="Trials">' + summary.trials + '</span>' +
      '<span data-label="New">' + summary.newMembers + '</span><span data-label="Lead to member">' + esc(pct(summary.leadToMemberPct)) + '</span>' +
      '<span data-label="Attrition">' + esc(pct(summary.attritionPct)) + '</span><span data-label="Net">' + esc(signed(summary.netGrowth)) + '</span>' +
      '<span data-label="CAC">' + esc(money(summary.blendedCacCents)) + '</span></div>';
    return '<div class="growth-table" role="table" aria-label="Metrics by school">' + head + lines + total + '</div>';
  }

  function channelTable(report) {
    var head = '<div class="growth-row growth-head channel" role="row"><span>Channel</span><span>Spend</span><span>Leads</span><span>Trials</span><span>New</span><span>Lead to class</span><span>Class to member</span><span>CAC</span></div>';
    var lines = report.channels.map(function (row) {
      return '<div class="growth-row channel" role="row">' +
        '<span data-label="Channel"><strong>' + esc(row.name) + '</strong></span>' +
        '<span data-label="Spend">' + esc(money(row.spendCents)) + '</span>' +
        '<span data-label="Leads">' + row.leads + '</span>' +
        '<span data-label="Trials">' + row.trials + '</span>' +
        '<span data-label="New">' + row.newMembers + '</span>' +
        '<span data-label="Lead to class">' + esc(pct(row.leadToTrialPct)) + '</span>' +
        '<span data-label="Class to member">' + esc(pct(row.trialToMemberPct)) + '</span>' +
        '<span data-label="CAC">' + esc(money(row.cacCents)) + '</span></div>';
    }).join('');
    return '<div class="growth-table" role="table" aria-label="Metrics by channel">' + head + lines + '</div>';
  }

  function spendPanel(ctx, lib, school) {
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

  function askBlock(ctx) {
    var chips = [
      'What was our attrition rate last month?',
      'What is our CAC by school and channel?',
      'How many new leads became members?',
      'Which school has the highest attrition?',
      'What is our LTV to CAC ratio?',
    ];
    var buttons = chips.map(function (text) {
      return '<button type="button" class="chip" data-act="metrics-ask" data-q="' + esc(text) + '">' + esc(text) + '</button>';
    }).join('');
    var answer = ctx.askAnswer
      ? '<div class="ask-answer" role="status">' + esc(ctx.askAnswer) + '</div>'
      : '<p class="lede">Ask in a sentence. The answer uses this month and the schools in view.</p>';
    return '<h2>Ask LVLUP CRM</h2>' + answer +
      '<div class="chips ask-chips">' + buttons + '</div>' +
      '<label>Question<textarea id="metrics-q">' + esc(ctx.askText || '') + '</textarea></label>' +
      '<button type="button" class="big primary" data-act="metrics-ask-go">Ask</button>';
  }

  function page(ctx) {
    var lib = api();
    if (!lib) return '<h1>Growth &amp; Metrics</h1><p class="lede">Metrics are not in this preview.</p>';
    var month = lib.GROWTH_MONTHS.indexOf(ctx.month) >= 0 ? ctx.month : '2026-11';
    var scope = ctx.scope || 'all';
    var report;
    try { report = lib.metricsReport(scope, month, ctx.cells); }
    catch (err) { return '<h1>Growth &amp; Metrics</h1><p class="lede">Choose a school and a month from June through November 2026.</p>'; }
    var row = report.summary;
    var ratio = row.ltvCacRatio == null ? 'n/a' : row.ltvCacRatio.toFixed(1) + ' : 1';
    var life = row.lifespanMonths == null ? 'n/a' : row.lifespanMonths.toFixed(1);
    var note = ctx.note ? '<div class="note">' + esc(ctx.note) + '</div>' : '';
    var school = ctx.spendSchool;
    if (scope !== 'all' && scope !== 'lvlup' && scope !== 'goninja') school = scope;
    return '<h1>Growth &amp; Metrics</h1>' + note +
      '<p class="lede">' + esc(report.monthLabel) + ' · ' + esc(report.scopeLabel) + '. Sample studio. Nothing is charged.</p>' +
      monthChips(month) +
      '<div class="kpis metrics-kpis">' +
      kpi('New leads', String(row.leads), mom(row.leadsMom)) +
      kpi('New trials / first classes', String(row.trials), mom(row.trialsMom)) +
      kpi('New members', String(row.newMembers), mom(row.membersMom)) +
      kpi('Lead → first class', pct(row.leadToTrialPct)) +
      kpi('First class → member', pct(row.trialToMemberPct)) +
      kpi('Lead → member', pct(row.leadToMemberPct)) +
      kpi('Monthly attrition', pct(row.attritionPct)) +
      kpi('Net member growth', signed(row.netGrowth)) +
      kpi('Blended CAC', money(row.blendedCacCents)) +
      kpi('Paid-only CAC', money(row.paidCacCents)) +
      kpi('ARPM', money(row.arpmCents)) +
      kpi('Member lifespan', life) +
      kpi('LTV', money(row.ltvCents)) +
      kpi('LTV : CAC', ratio) +
      '</div>' +
      '<p class="meta">Attrition is cancellations divided by starting active members. Lifespan is 1 divided by that rate. LTV is average revenue per member times lifespan. CAC is marketing spend divided by new enrolled members.</p>' +
      '<h2>6-month attrition</h2>' + trend(report) +
      '<h2>By school</h2>' + schoolTable(report) +
      '<div class="split-panels"><section><h2>Why students left</h2>' + bars(report.reasons) + '</section>' +
      '<section><h2>How long they had trained</h2>' + bars(report.tenure) + '</section></div>' +
      '<h2>By channel</h2>' + channelTable(report) +
      spendPanel(ctx, lib, school) +
      '<button type="button" class="big primary" data-act="metrics-csv">Download metrics CSV</button>' +
      askBlock(ctx);
  }

  root.LvlupGrowthView = { page: page };
})(typeof globalThis !== 'undefined' ? globalThis : this);
