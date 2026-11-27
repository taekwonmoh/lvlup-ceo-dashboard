'use strict';

/**
 * Go Ninja household sibling discounts. Pure. Does not charge.
 *
 * Rank is per program and location. Children already enrolled in that
 * program occupy the earliest ranks, then new children follow cart order.
 * 1st child pays the list price. 2nd child uses secondChild. 3rd and
 * later use thirdPlus. Multi-week savings apply only to summer camp, on
 * the list subtotal. Stackable adds both discounts. Best keeps the larger
 * one, and a tie keeps the sibling discount.
 */
(function (root) {
  var PROGRAMS = ['ninja_8wk', 'summer_camp', 'afterschool', 'pno', 'all'];
  var LINE_PROGRAMS = ['ninja_8wk', 'summer_camp', 'afterschool', 'pno'];
  var LOCATIONS = ['goninjaW', 'goninjaV', 'all'];
  var STORAGE_KEY = 'lvlupGnHouseholdRulesV1';

  function fail(message) {
    throw new Error(message);
  }

  function asNumber(value, label) {
    if (value == null || value === '') return null;
    var n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) fail(label + ' must be a number');
    return n;
  }

  function cleanSpec(spec, label) {
    if (!spec || (spec.kind !== 'percent' && spec.kind !== 'amount')) {
      fail(label + ' must be a percent or an amount');
    }
    if (spec.kind === 'percent') {
      var pct = asNumber(spec.percentOff, label);
      if (pct == null || pct < 0 || pct > 100) fail(label + ' percent must be from 0 to 100');
      return { kind: 'percent', percentOff: pct, amountOffCents: null };
    }
    var amount = asNumber(spec.amountOffCents, label);
    if (amount == null || !Number.isInteger(amount) || amount < 0) {
      fail(label + ' amount must be a non-negative integer in cents');
    }
    return { kind: 'amount', percentOff: null, amountOffCents: amount };
  }

  function cleanRule(input) {
    if (!input || typeof input !== 'object') fail('A discount rule must be an object');
    var id = String(input.id || '').trim();
    if (!/^[a-z0-9-]{2,40}$/.test(id)) fail('Rule id must be a short id');
    if (LOCATIONS.indexOf(input.locationId) < 0) fail('Unknown discount location');
    if (PROGRAMS.indexOf(input.program) < 0) fail('Unknown discount program');
    if (input.mode !== 'stackable' && input.mode !== 'best') fail('Discount mode must be stackable or best');
    var multi = null;
    if (input.multiWeek) {
      var minWeeks = asNumber(input.multiWeek.minWeeks, 'Multi-week minimum');
      if (minWeeks == null || !Number.isInteger(minWeeks) || minWeeks < 2 || minWeeks > 16) {
        fail('Multi-week minimum must be from 2 to 16');
      }
      multi = {
        minWeeks: minWeeks,
        discount: cleanSpec(input.multiWeek.discount, 'Multi-week discount'),
      };
    }
    return {
      id: id,
      locationId: input.locationId,
      program: input.program,
      active: input.active !== false,
      mode: input.mode,
      secondChild: cleanSpec(input.secondChild, '2nd child discount'),
      thirdPlus: cleanSpec(input.thirdPlus, '3rd+ child discount'),
      multiWeek: multi,
    };
  }

  function spec(kind, percentOff, amountOffCents) {
    return { kind: kind, percentOff: percentOff, amountOffCents: amountOffCents };
  }

  function defaultRules() {
    var locs = [['goninjaW', 'gnw'], ['goninjaV', 'gnv']];
    var programs = [
      ['all', 'all', null],
      ['ninja_8wk', 'ninja-8wk', null],
      ['summer_camp', 'summer-camp', { minWeeks: 3, discount: spec('percent', 5, null) }],
      ['afterschool', 'afterschool', null],
      ['pno', 'pno', null],
    ];
    var rules = [];
    locs.forEach(function (loc) {
      programs.forEach(function (prog) {
        rules.push(cleanRule({
          id: loc[1] + '-' + prog[1],
          locationId: loc[0],
          program: prog[0],
          active: true,
          mode: 'stackable',
          secondChild: spec('percent', 10, null),
          thirdPlus: spec('percent', 20, null),
          multiWeek: prog[2],
        }));
      });
    });
    return rules;
  }

  function ruleFromRow(row) {
    if (!row || typeof row !== 'object') fail('Discount row must be an object');
    return cleanRule({
      id: row.id,
      locationId: row.location_id,
      program: row.program,
      active: row.active,
      mode: row.mode,
      secondChild: {
        kind: row.second_kind,
        percentOff: row.second_percent,
        amountOffCents: row.second_amount_cents,
      },
      thirdPlus: {
        kind: row.third_kind,
        percentOff: row.third_percent,
        amountOffCents: row.third_amount_cents,
      },
      multiWeek: row.multi_week_min == null ? null : {
        minWeeks: row.multi_week_min,
        discount: {
          kind: row.multi_week_kind,
          percentOff: row.multi_week_percent,
          amountOffCents: row.multi_week_amount_cents,
        },
      },
    });
  }

  function rulesFromStorage(raw) {
    try {
      var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(data) || !data.length) return null;
      return data.map(cleanRule);
    } catch (err) {
      return null;
    }
  }

  function scoreRule(rule, locationId, program) {
    var loc = rule.locationId === locationId ? 2 : rule.locationId === 'all' ? 0 : -1;
    var prog = rule.program === program ? 4 : rule.program === 'all' ? 0 : -1;
    if (loc < 0 || prog < 0) return -1;
    return loc + prog;
  }

  function pickRule(rules, locationId, program) {
    var best = null;
    var bestScore = -1;
    (rules || []).forEach(function (rule) {
      var cleaned = cleanRule(rule);
      if (!cleaned.active) return;
      var score = scoreRule(cleaned, locationId, program);
      if (score > bestScore) {
        bestScore = score;
        best = cleaned;
      }
    });
    return best;
  }

  function discountCents(specRule, subtotal) {
    if (!specRule || subtotal <= 0) return 0;
    if (specRule.kind === 'amount') return Math.min(subtotal, specRule.amountOffCents);
    return Math.min(subtotal, Math.round(subtotal * specRule.percentOff / 100));
  }

  function specPhrase(specRule) {
    if (!specRule) return '';
    if (specRule.kind === 'amount') return '$' + (specRule.amountOffCents / 100).toFixed(2) + ' off';
    var pct = specRule.percentOff;
    var text = Math.round(pct * 100) === pct * 100 ? String(pct) : String(Math.round(pct * 100) / 100);
    return text + '% off';
  }

  function describeRule(rule) {
    var cleaned = cleanRule(rule);
    var text = '2nd child ' + specPhrase(cleaned.secondChild) + '. 3rd child and after ' + specPhrase(cleaned.thirdPlus) + '.';
    if (cleaned.multiWeek) {
      text += ' ' + cleaned.multiWeek.minWeeks + ' or more camp weeks save ' + specPhrase(cleaned.multiWeek.discount) + '.';
    }
    text += cleaned.mode === 'best' ? ' The larger discount is used.' : ' Discounts stack.';
    return text;
  }

  function rankName(rank) {
    if (rank === 1) return '1st child';
    if (rank === 2) return '2nd child';
    return '3rd+ child';
  }

  function cleanLine(line) {
    if (!line || typeof line !== 'object') fail('Each line must be an object');
    var lineId = String(line.lineId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(lineId)) fail('lineId must be a short id');
    var childKey = String(line.childKey || '').trim();
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(childKey)) fail('childKey must be a short id');
    if (LINE_PROGRAMS.indexOf(line.program) < 0) fail('Unknown program');
    if (line.locationId !== 'goninjaW' && line.locationId !== 'goninjaV') fail('Unknown location');
    if (!Number.isInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
      fail('unitPriceCents must be a non-negative integer');
    }
    var quantity = line.quantity == null ? 1 : line.quantity;
    if (!Number.isInteger(quantity) || quantity < 1) fail('quantity must be a positive integer');
    var weeks = line.weeks == null ? quantity : line.weeks;
    if (!Number.isInteger(weeks) || weeks < 1) fail('weeks must be a positive integer');
    var label = line.label == null ? '' : String(line.label);
    if (/tel:|sms:/i.test(label)) fail('Labels cannot contain a phone link');
    var enrolled = line.alreadyEnrolled === true;
    return {
      lineId: lineId,
      childKey: childKey,
      label: label,
      program: line.program,
      locationId: line.locationId,
      unitPriceCents: line.unitPriceCents,
      quantity: quantity,
      weeks: weeks,
      alreadyEnrolled: enrolled,
      listCents: enrolled ? 0 : line.unitPriceCents * quantity,
      weekCount: line.program === 'summer_camp' && !enrolled ? weeks : 0,
    };
  }

  function cleanEnrolled(row) {
    if (!row || typeof row !== 'object') fail('Each enrolled child must be an object');
    var childKey = String(row.childKey || '').trim();
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(childKey)) fail('childKey must be a short id');
    if (LINE_PROGRAMS.indexOf(row.program) < 0) fail('Unknown program');
    if (row.locationId !== 'goninjaW' && row.locationId !== 'goninjaV') fail('Unknown location');
    return { childKey: childKey, program: row.program, locationId: row.locationId };
  }

  function allocate(discount, parts) {
    var total = parts.reduce(function (sum, part) { return sum + part.listCents; }, 0);
    var zeros = parts.map(function () { return 0; });
    if (discount <= 0 || total <= 0) return zeros;
    var floors = parts.map(function (part) { return Math.floor(discount * part.listCents / total); });
    var used = floors.reduce(function (sum, n) { return sum + n; }, 0);
    var left = discount - used;
    var order = parts.map(function (part, index) {
      return { index: index, frac: (discount * part.listCents / total) - floors[index] };
    }).sort(function (a, b) { return b.frac - a.frac || a.index - b.index; });
    for (var k = 0; k < left; k++) floors[order[k].index] += 1;
    return floors;
  }

  function quoteHousehold(input) {
    if (!input || !Array.isArray(input.lines)) fail('lines must be a list');
    var rules = (input.rules || []).map(cleanRule);
    var lines = input.lines.map(cleanLine);
    var seen = {};
    lines.forEach(function (line) {
      if (seen[line.lineId]) fail('lineId must be unique');
      seen[line.lineId] = true;
    });
    var enrolled = (input.enrolled || []).map(cleanEnrolled);
    var groups = [];
    var groupMap = {};
    function groupFor(program, locationId) {
      var key = program + '|' + locationId;
      if (!groupMap[key]) {
        groupMap[key] = { program: program, locationId: locationId, lines: [], enrolled: [] };
        groups.push(groupMap[key]);
      }
      return groupMap[key];
    }
    enrolled.forEach(function (row) { groupFor(row.program, row.locationId).enrolled.push(row); });
    lines.forEach(function (line) { groupFor(line.program, line.locationId).lines.push(line); });

    var children = [];
    var outLines = [];
    groups.forEach(function (group) {
      var rule = pickRule(rules, group.locationId, group.program);
      var enrolledOrder = [];
      function addEnrolled(key) {
        if (enrolledOrder.indexOf(key) < 0) enrolledOrder.push(key);
      }
      group.enrolled.forEach(function (row) { addEnrolled(row.childKey); });
      group.lines.forEach(function (line) { if (line.alreadyEnrolled) addEnrolled(line.childKey); });
      var cartOrder = [];
      group.lines.forEach(function (line) {
        if (line.alreadyEnrolled) return;
        if (enrolledOrder.indexOf(line.childKey) >= 0) return;
        if (cartOrder.indexOf(line.childKey) < 0) cartOrder.push(line.childKey);
      });
      var order = enrolledOrder.concat(cartOrder);
      order.forEach(function (childKey, index) {
        var rank = index + 1;
        var own = group.lines.filter(function (line) { return line.childKey === childKey && !line.alreadyEnrolled; });
        var list = own.reduce(function (sum, line) { return sum + line.listCents; }, 0);
        var weekCount = own.reduce(function (sum, line) { return sum + line.weekCount; }, 0);
        var siblingSpec = null;
        var sibling = 0;
        if (rule && rank === 2) siblingSpec = rule.secondChild;
        if (rule && rank >= 3) siblingSpec = rule.thirdPlus;
        if (siblingSpec) sibling = discountCents(siblingSpec, list);
        var multi = 0;
        var multiSpec = null;
        if (rule && rule.multiWeek && group.program === 'summer_camp' && weekCount >= rule.multiWeek.minWeeks) {
          multiSpec = rule.multiWeek.discount;
          multi = discountCents(multiSpec, list);
        }
        var appliedSibling = sibling;
        var appliedMulti = multi;
        var chosen = sibling && multi ? 'both' : sibling ? 'sibling' : multi ? 'multiWeek' : 'none';
        if (rule && rule.mode === 'best') {
          if (multi > sibling) {
            appliedSibling = 0;
            chosen = multi ? 'multiWeek' : 'none';
          } else {
            appliedMulti = 0;
            chosen = sibling ? 'sibling' : 'none';
          }
        }
        var discount = Math.min(list, appliedSibling + appliedMulti);
        var shares = allocate(discount, own);
        children.push({
          childKey: childKey,
          program: group.program,
          locationId: group.locationId,
          rank: rank,
          rankName: rankName(rank),
          alreadyEnrolled: own.length === 0,
          enrolledSibling: enrolledOrder.indexOf(childKey) >= 0,
          weekCount: weekCount,
          listCents: list,
          siblingDiscountCents: appliedSibling,
          multiWeekDiscountCents: appliedMulti,
          discountCents: discount,
          dueCents: list - discount,
          ruleId: rule ? rule.id : null,
          mode: rule ? rule.mode : null,
          chosen: chosen,
          siblingLabel: appliedSibling ? rankName(rank) + ' · ' + specPhrase(siblingSpec) : '',
          multiWeekLabel: appliedMulti ? rule.multiWeek.minWeeks + '+ camp weeks · ' + specPhrase(multiSpec) : '',
        });
        own.forEach(function (line, lineIndex) {
          outLines.push({
            lineId: line.lineId,
            childKey: line.childKey,
            label: line.label,
            program: line.program,
            locationId: line.locationId,
            rank: rank,
            alreadyEnrolled: false,
            listCents: line.listCents,
            discountCents: shares[lineIndex],
            dueCents: line.listCents - shares[lineIndex],
          });
        });
      });
      group.lines.forEach(function (line) {
        if (!line.alreadyEnrolled) return;
        var rank = order.indexOf(line.childKey) + 1;
        outLines.push({
          lineId: line.lineId,
          childKey: line.childKey,
          label: line.label,
          program: line.program,
          locationId: line.locationId,
          rank: rank,
          alreadyEnrolled: true,
          listCents: 0,
          discountCents: 0,
          dueCents: 0,
        });
      });
    });

    var listCents = children.reduce(function (sum, child) { return sum + child.listCents; }, 0);
    var discountTotal = children.reduce(function (sum, child) { return sum + child.discountCents; }, 0);
    return {
      charged: false,
      preview: true,
      listCents: listCents,
      discountCents: discountTotal,
      dueCents: listCents - discountTotal,
      children: children,
      lines: outLines,
    };
  }

  var api = {
    PROGRAMS: PROGRAMS,
    LINE_PROGRAMS: LINE_PROGRAMS,
    LOCATIONS: LOCATIONS,
    STORAGE_KEY: STORAGE_KEY,
    cleanRule: cleanRule,
    defaultRules: defaultRules,
    ruleFromRow: ruleFromRow,
    rulesFromStorage: rulesFromStorage,
    pickRule: pickRule,
    describeRule: describeRule,
    specPhrase: specPhrase,
    quoteHousehold: quoteHousehold,
  };
  root.HouseholdDiscounts = api;
})(globalThis);
