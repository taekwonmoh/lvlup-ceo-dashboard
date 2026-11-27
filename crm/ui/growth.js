"use strict";
var LvlupGrowth = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/growth.ts
  var growth_exports = {};
  __export(growth_exports, {
    CHANNELS: () => CHANNELS,
    GOAL_PCT: () => GOAL_PCT,
    GROWTH_AS_OF: () => GROWTH_AS_OF,
    GROWTH_MONTHS: () => GROWTH_MONTHS,
    GROWTH_SCHOOLS: () => GROWTH_SCHOOLS,
    GrowthInputError: () => GrowthInputError,
    REASONS: () => REASONS,
    TENURES: () => TENURES,
    answerGrowthQuestion: () => answerGrowthQuestion,
    applySnapshots: () => applySnapshots,
    attritionCsv: () => attritionCsv,
    attritionPct: () => attritionPct,
    attritionReport: () => attritionReport,
    auditCells: () => auditCells,
    cacCents: () => cacCents,
    cacCsv: () => cacCsv,
    cacReport: () => cacReport,
    cellsWithSpend: () => cellsWithSpend,
    demoCells: () => demoCells,
    formatMoney: () => formatMoney,
    formatPct: () => formatPct,
    monthFromQuestion: () => monthFromQuestion,
    monthLabel: () => monthLabel,
    monthShort: () => monthShort,
    parseSpendInput: () => parseSpendInput,
    pulseReport: () => pulseReport,
    retentionPct: () => retentionPct,
    round1: () => round1,
    schoolById: () => schoolById,
    schoolsInScope: () => schoolsInScope,
    scopeFromQuestion: () => scopeFromQuestion,
    scopeName: () => scopeName,
    shiftMonth: () => shiftMonth,
    summaryPayload: () => summaryPayload
  });
  var GROWTH_AS_OF = "2026-11-27";
  var GOAL_PCT = 3;
  var GROWTH_MONTHS = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
  var GROWTH_SCHOOLS = [
    { id: "waunakee", name: "LVLUP Waunakee", brand: "lvlup", tuitionCents: 21e3, avgTenureMonths: 18 },
    { id: "eastmad", name: "LVLUP East Madison", brand: "lvlup", tuitionCents: 18e3, avgTenureMonths: 14 },
    { id: "verona", name: "LVLUP Verona", brand: "lvlup", tuitionCents: 2e4, avgTenureMonths: 16 },
    { id: "deforest", name: "LVLUP DeForest", brand: "lvlup", tuitionCents: 16500, avgTenureMonths: 9 },
    { id: "goninjaW", name: "Go Ninja Waunakee", brand: "goninja", tuitionCents: 5e3, avgTenureMonths: 11 },
    { id: "goninjaV", name: "Go Ninja Verona", brand: "goninja", tuitionCents: 5e3, avgTenureMonths: 8 }
  ];
  var CHANNELS = [
    { id: "google", name: "Google Ads", paid: true },
    { id: "meta", name: "Meta / Facebook Ads", paid: true },
    { id: "referrals", name: "Referrals", paid: false },
    { id: "events", name: "Events / Walk-ins", paid: false },
    { id: "website", name: "Website / Organic", paid: false }
  ];
  var REASONS = [
    { id: "schedule", name: "Schedule" },
    { id: "moving", name: "Moving" },
    { id: "cost", name: "Cost" },
    { id: "lost_interest", name: "Lost Interest" },
    { id: "medical", name: "Medical" },
    { id: "other", name: "Other" }
  ];
  var TENURES = [
    { id: "under3", name: "<3 mo" },
    { id: "m3to6", name: "3\u20136 mo" },
    { id: "m6to12", name: "6\u201312 mo" },
    { id: "m12plus", name: "12+ mo" }
  ];
  var GrowthInputError = class extends Error {
  };
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var NOVEMBER = [
    {
      id: "waunakee",
      start: 136,
      reasons: { schedule: 1, moving: 1, cost: 0, lost_interest: 1, medical: 0, other: 0 },
      tenure: { under3: 0, m3to6: 1, m6to12: 1, m12plus: 1 },
      channels: {
        google: { leads: 6, trials: 4, enrolled: 2, spendCents: 18e4 },
        meta: { leads: 5, trials: 3, enrolled: 2, spendCents: 14e4 },
        referrals: { leads: 4, trials: 3, enrolled: 2, spendCents: 0 },
        events: { leads: 3, trials: 2, enrolled: 1, spendCents: 25e3 },
        website: { leads: 2, trials: 1, enrolled: 0, spendCents: 0 }
      }
    },
    {
      id: "eastmad",
      start: 88,
      reasons: { schedule: 1, moving: 0, cost: 1, lost_interest: 0, medical: 0, other: 0 },
      tenure: { under3: 1, m3to6: 0, m6to12: 1, m12plus: 0 },
      channels: {
        google: { leads: 4, trials: 2, enrolled: 1, spendCents: 12e4 },
        meta: { leads: 3, trials: 2, enrolled: 1, spendCents: 9e4 },
        referrals: { leads: 3, trials: 2, enrolled: 2, spendCents: 0 },
        events: { leads: 2, trials: 1, enrolled: 1, spendCents: 15e3 },
        website: { leads: 1, trials: 1, enrolled: 0, spendCents: 0 }
      }
    },
    {
      id: "verona",
      start: 105,
      reasons: { schedule: 2, moving: 0, cost: 1, lost_interest: 1, medical: 0, other: 0 },
      tenure: { under3: 1, m3to6: 1, m6to12: 1, m12plus: 1 },
      channels: {
        google: { leads: 5, trials: 3, enrolled: 2, spendCents: 15e4 },
        meta: { leads: 4, trials: 2, enrolled: 1, spendCents: 11e4 },
        referrals: { leads: 3, trials: 2, enrolled: 2, spendCents: 0 },
        events: { leads: 2, trials: 2, enrolled: 1, spendCents: 2e4 },
        website: { leads: 2, trials: 1, enrolled: 0, spendCents: 0 }
      }
    },
    {
      id: "deforest",
      start: 72,
      reasons: { schedule: 1, moving: 0, cost: 2, lost_interest: 2, medical: 0, other: 0 },
      tenure: { under3: 3, m3to6: 1, m6to12: 1, m12plus: 0 },
      channels: {
        google: { leads: 4, trials: 2, enrolled: 1, spendCents: 9e4 },
        meta: { leads: 3, trials: 1, enrolled: 0, spendCents: 7e4 },
        referrals: { leads: 2, trials: 1, enrolled: 1, spendCents: 0 },
        events: { leads: 2, trials: 2, enrolled: 1, spendCents: 1e4 },
        website: { leads: 1, trials: 0, enrolled: 0, spendCents: 0 }
      }
    },
    {
      id: "goninjaW",
      start: 46,
      reasons: { schedule: 0, moving: 1, cost: 0, lost_interest: 0, medical: 0, other: 0 },
      tenure: { under3: 0, m3to6: 0, m6to12: 0, m12plus: 1 },
      channels: {
        google: { leads: 3, trials: 2, enrolled: 1, spendCents: 4e4 },
        meta: { leads: 2, trials: 1, enrolled: 1, spendCents: 35e3 },
        referrals: { leads: 2, trials: 1, enrolled: 1, spendCents: 0 },
        events: { leads: 2, trials: 1, enrolled: 1, spendCents: 5e3 },
        website: { leads: 1, trials: 1, enrolled: 0, spendCents: 0 }
      }
    },
    {
      id: "goninjaV",
      start: 35,
      reasons: { schedule: 1, moving: 0, cost: 0, lost_interest: 1, medical: 0, other: 0 },
      tenure: { under3: 1, m3to6: 1, m6to12: 0, m12plus: 0 },
      channels: {
        google: { leads: 2, trials: 1, enrolled: 1, spendCents: 3e4 },
        meta: { leads: 2, trials: 1, enrolled: 0, spendCents: 25e3 },
        referrals: { leads: 1, trials: 1, enrolled: 1, spendCents: 0 },
        events: { leads: 2, trials: 1, enrolled: 1, spendCents: 0 },
        website: { leads: 1, trials: 0, enrolled: 0, spendCents: 0 }
      }
    }
  ];
  function round1(value) {
    return Math.round(value * 10) / 10;
  }
  function attritionPct(cancellations, startingActive) {
    if (!startingActive) return null;
    return round1(cancellations / startingActive * 100);
  }
  function retentionPct(attrition) {
    if (attrition == null) return null;
    return round1(100 - attrition);
  }
  function cacCents(spendCents, newMembers) {
    if (!newMembers) return null;
    return Math.round(spendCents / newMembers);
  }
  function formatMoney(cents) {
    if (cents == null || !Number.isFinite(cents)) return "n/a";
    const sign = cents < 0 ? "-" : "";
    const abs = Math.abs(Math.round(cents));
    const dollars2 = Math.floor(abs / 100).toLocaleString("en-US");
    const coins = String(abs % 100).padStart(2, "0");
    return sign + "$" + dollars2 + "." + coins;
  }
  function formatPct(value) {
    if (value == null) return "n/a";
    return value.toFixed(1) + "%";
  }
  function monthLabel(month) {
    const monthNo = Number(month.slice(5, 7));
    const name = MONTH_NAMES[monthNo - 1] || month;
    return name + " " + month.slice(0, 4);
  }
  function monthShort(month) {
    return monthLabel(month).slice(0, 3);
  }
  function shiftMonth(month, delta) {
    const year = Number(month.slice(0, 4));
    const monthNo = Number(month.slice(5, 7));
    const date = new Date(Date.UTC(year, monthNo - 1 + delta, 1));
    return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
  }
  function schoolById(id) {
    return GROWTH_SCHOOLS.find((row) => row.id === id) || null;
  }
  function schoolsInScope(scope) {
    if (scope === "all") return GROWTH_SCHOOLS.map((row) => row.id);
    if (scope === "lvlup") return GROWTH_SCHOOLS.filter((row) => row.brand === "lvlup").map((row) => row.id);
    if (scope === "goninja") return GROWTH_SCHOOLS.filter((row) => row.brand === "goninja").map((row) => row.id);
    if (schoolById(scope)) return [scope];
    throw new GrowthInputError("Unknown scope");
  }
  function scopeName(scope) {
    var _a;
    if (scope === "all") return "All schools";
    if (scope === "lvlup") return "LVLUP";
    if (scope === "goninja") return "Go Ninja";
    return ((_a = schoolById(scope)) == null ? void 0 : _a.name) || scope;
  }
  function sum(values) {
    return values.reduce((total, value) => total + value, 0);
  }
  function apportion(total, weights) {
    const safe = weights.map((value) => Math.max(0, Math.round(value)));
    if (!safe.length) return [];
    if (total <= 0) return safe.map(() => 0);
    const weightSum = sum(safe);
    if (!weightSum) {
      const out = safe.map(() => 0);
      for (let i = 0; i < total; i += 1) out[i % out.length] += 1;
      return out;
    }
    const raw = safe.map((value) => total * value / weightSum);
    const base = raw.map((value) => Math.floor(value));
    let left = total - sum(base);
    const order = raw.map((value, index) => ({ index, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac || a.index - b.index);
    let cursor = 0;
    while (left > 0) {
      base[order[cursor % order.length].index] += 1;
      left -= 1;
      cursor += 1;
    }
    return base;
  }
  function blankChannels() {
    return {
      google: { leads: 0, trials: 0, enrolled: 0, spendCents: 0 },
      meta: { leads: 0, trials: 0, enrolled: 0, spendCents: 0 },
      referrals: { leads: 0, trials: 0, enrolled: 0, spendCents: 0 },
      events: { leads: 0, trials: 0, enrolled: 0, spendCents: 0 },
      website: { leads: 0, trials: 0, enrolled: 0, spendCents: 0 }
    };
  }
  function cloneCell(cell) {
    return {
      locationId: cell.locationId,
      month: cell.month,
      startingActive: cell.startingActive,
      newEnrollments: cell.newEnrollments,
      cancellations: cell.cancellations,
      reasons: { ...cell.reasons },
      tenure: { ...cell.tenure },
      channels: {
        google: { ...cell.channels.google },
        meta: { ...cell.channels.meta },
        referrals: { ...cell.channels.referrals },
        events: { ...cell.channels.events },
        website: { ...cell.channels.website }
      },
      tuitionCents: cell.tuitionCents,
      avgTenureMonths: cell.avgTenureMonths
    };
  }
  function cellFromSeed(seed, month) {
    const enrolled = sum(CHANNELS.map((channel) => seed.channels[channel.id].enrolled));
    const cancellations = sum(REASONS.map((reason) => seed.reasons[reason.id]));
    return {
      locationId: seed.id,
      month,
      startingActive: seed.start,
      newEnrollments: enrolled,
      cancellations,
      reasons: { ...seed.reasons },
      tenure: { ...seed.tenure },
      channels: {
        google: { ...seed.channels.google },
        meta: { ...seed.channels.meta },
        referrals: { ...seed.channels.referrals },
        events: { ...seed.channels.events },
        website: { ...seed.channels.website }
      }
    };
  }
  function deriveCell(base, monthsAgo) {
    if (monthsAgo <= 0) return cloneCell(base);
    const startingActive = Math.max(12, Math.round(base.startingActive * (1 - 0.012 * monthsAgo)));
    const cancellations = Math.min(
      Math.max(0, startingActive - 1),
      Math.max(0, Math.round(base.cancellations * (1 + 0.1 * monthsAgo)))
    );
    const gained = Math.max(0, Math.round(base.newEnrollments * (monthsAgo % 2 === 0 ? 0.92 : 1)));
    const reasonWeights = REASONS.map((reason) => base.reasons[reason.id]);
    const tenureWeights = TENURES.map((bucket) => base.tenure[bucket.id]);
    const reasonParts = apportion(cancellations, reasonWeights);
    const tenureParts = apportion(cancellations, tenureWeights);
    const enrolledParts = apportion(gained, CHANNELS.map((channel) => base.channels[channel.id].enrolled));
    const reasons = {};
    const tenure = {};
    REASONS.forEach((reason, index) => {
      reasons[reason.id] = reasonParts[index];
    });
    TENURES.forEach((bucket, index) => {
      tenure[bucket.id] = tenureParts[index];
    });
    const channels = blankChannels();
    const scale = monthsAgo % 2 === 0 ? 1.08 : 0.95;
    CHANNELS.forEach((channel, index) => {
      const enrolled = enrolledParts[index];
      const source = base.channels[channel.id];
      const leads = Math.max(enrolled, Math.round(source.leads * scale));
      const trials = Math.max(enrolled, Math.min(leads, Math.round(source.trials * scale)));
      const spendCents = source.spendCents === 0 ? 0 : Math.max(0, Math.round(source.spendCents * (1 + 0.03 * monthsAgo)));
      channels[channel.id] = { leads, trials, enrolled, spendCents };
    });
    return {
      locationId: base.locationId,
      month: base.month,
      startingActive,
      newEnrollments: sum(enrolledParts),
      cancellations,
      reasons,
      tenure,
      channels
    };
  }
  function buildBaseCells() {
    const november = NOVEMBER.map((seed) => cellFromSeed(seed, "2026-11"));
    const cells = [];
    for (const month of GROWTH_MONTHS) {
      const ago = GROWTH_MONTHS.indexOf("2026-11") - GROWTH_MONTHS.indexOf(month);
      for (const cell of november) {
        const derived = deriveCell(cell, ago);
        derived.month = month;
        cells.push(derived);
      }
    }
    const problems = auditCells(cells);
    if (problems.length) throw new Error(problems.join("; "));
    return cells;
  }
  var BASE_CELLS = buildBaseCells();
  function auditCells(cells) {
    const problems = [];
    for (const cell of cells) {
      const where = cell.locationId + " " + cell.month;
      const reasonSum = sum(REASONS.map((reason) => cell.reasons[reason.id] || 0));
      const tenureSum = sum(TENURES.map((bucket) => cell.tenure[bucket.id] || 0));
      const enrolled = sum(CHANNELS.map((channel) => cell.channels[channel.id].enrolled));
      if (reasonSum !== cell.cancellations) problems.push(where + " reasons");
      if (tenureSum !== cell.cancellations) problems.push(where + " tenure");
      if (enrolled !== cell.newEnrollments) problems.push(where + " enrolled");
      if (cell.cancellations > cell.startingActive) problems.push(where + " cancels exceed start");
      for (const channel of CHANNELS) {
        const stat = cell.channels[channel.id];
        if (stat.leads < stat.trials || stat.trials < stat.enrolled || stat.enrolled < 0 || stat.spendCents < 0) {
          problems.push(where + " " + channel.id + " funnel");
        }
      }
    }
    return problems;
  }
  function demoCells() {
    return BASE_CELLS.map(cloneCell);
  }
  function cellsWithSpend(overrides = [], cells = demoCells()) {
    const next = cells.map(cloneCell);
    for (const row of overrides) {
      const cell = next.find((item) => item.locationId === row.locationId && item.month === row.month);
      const channel = CHANNELS.find((item) => item.id === row.channel);
      if (!cell || !channel) continue;
      if (!Number.isInteger(row.amountCents) || row.amountCents < 0) continue;
      cell.channels[channel.id].spendCents = row.amountCents;
    }
    return next;
  }
  function applySnapshots(cells, snapshots) {
    var _a, _b, _c;
    const next = cells.map(cloneCell);
    for (const snap of snapshots) {
      const cell = next.find((item) => item.locationId === snap.locationId && item.month === snap.month);
      if (!cell || !schoolById(snap.locationId)) continue;
      const reasons = {};
      const tenure = {};
      let reasonsOk = true;
      for (const reason of REASONS) {
        const value = Number((_a = snap.reasons) == null ? void 0 : _a[reason.id]);
        if (!Number.isInteger(value) || value < 0) reasonsOk = false;
        reasons[reason.id] = value;
      }
      let tenureOk = true;
      for (const bucket of TENURES) {
        const value = Number((_b = snap.tenure) == null ? void 0 : _b[bucket.id]);
        if (!Number.isInteger(value) || value < 0) tenureOk = false;
        tenure[bucket.id] = value;
      }
      if (!reasonsOk || !tenureOk) continue;
      if (sum(Object.values(reasons)) !== snap.cancellations) continue;
      if (sum(Object.values(tenure)) !== snap.cancellations) continue;
      if (snap.cancellations > snap.startingActive || snap.startingActive < 0 || snap.newEnrollments < 0) continue;
      const channels = blankChannels();
      let enrolled = 0;
      let funnelOk = true;
      for (const channel of CHANNELS) {
        const source = (_c = snap.channels) == null ? void 0 : _c[channel.id];
        const leads = Number(source == null ? void 0 : source.leads);
        const trials = Number(source == null ? void 0 : source.trials);
        const joined = Number(source == null ? void 0 : source.enrolled);
        if (!Number.isInteger(leads) || !Number.isInteger(trials) || !Number.isInteger(joined)) funnelOk = false;
        if (leads < trials || trials < joined || joined < 0) funnelOk = false;
        channels[channel.id] = {
          leads,
          trials,
          enrolled: joined,
          spendCents: cell.channels[channel.id].spendCents
        };
        enrolled += joined;
      }
      if (!funnelOk || enrolled !== snap.newEnrollments) continue;
      cell.startingActive = snap.startingActive;
      cell.newEnrollments = snap.newEnrollments;
      cell.cancellations = snap.cancellations;
      cell.reasons = reasons;
      cell.tenure = tenure;
      cell.channels = channels;
      if (snap.tuitionCents != null && Number.isInteger(snap.tuitionCents) && snap.tuitionCents >= 0) {
        cell.tuitionCents = snap.tuitionCents;
      }
      if (snap.avgTenureMonths != null && Number.isFinite(Number(snap.avgTenureMonths)) && Number(snap.avgTenureMonths) >= 0) {
        cell.avgTenureMonths = Number(snap.avgTenureMonths);
      }
    }
    return next;
  }
  function assertMonth(month) {
    if (!GROWTH_MONTHS.includes(month)) throw new GrowthInputError("Unknown month");
  }
  function tuitionOf(cell) {
    var _a;
    if (cell.tuitionCents != null) return cell.tuitionCents;
    return ((_a = schoolById(cell.locationId)) == null ? void 0 : _a.tuitionCents) || 0;
  }
  function tenureMonthsOf(cell) {
    var _a;
    if (cell.avgTenureMonths != null) return cell.avgTenureMonths;
    return ((_a = schoolById(cell.locationId)) == null ? void 0 : _a.avgTenureMonths) || 0;
  }
  function idsFor(scope, cells) {
    const wanted = schoolsInScope(scope);
    const available = new Set(cells.map((cell) => cell.locationId));
    if (wanted.length === 1 && !available.has(wanted[0])) throw new GrowthInputError("Unknown scope");
    const ids = wanted.filter((id) => available.has(id));
    if (!ids.length) throw new GrowthInputError("Unknown scope");
    return { ids, partial: ids.length !== wanted.length };
  }
  function monthCells(cells, month, ids) {
    return ids.map((id) => cells.find((cell) => cell.locationId === id && cell.month === month)).filter((cell) => !!cell);
  }
  function countRows(catalog, pick) {
    return catalog.map((row) => ({ id: row.id, name: row.name, count: pick(row.id) }));
  }
  function movementOf(cell) {
    const school = schoolById(cell.locationId);
    const attrition = attritionPct(cell.cancellations, cell.startingActive);
    const under3 = cell.tenure.under3 || 0;
    const otherTenure = Math.max(...TENURES.filter((bucket) => bucket.id !== "under3").map((bucket) => cell.tenure[bucket.id] || 0));
    const earlyDrop = cell.cancellations > 0 && under3 / cell.cancellations >= 0.4 && under3 > otherTenure;
    return {
      id: cell.locationId,
      name: school.name,
      brand: school.brand,
      startingActive: cell.startingActive,
      newEnrollments: cell.newEnrollments,
      cancellations: cell.cancellations,
      attritionPct: attrition,
      retentionPct: retentionPct(attrition),
      netGrowth: cell.newEnrollments - cell.cancellations,
      onTrack: attrition == null ? true : attrition <= GOAL_PCT,
      earlyDrop,
      reasons: countRows(REASONS, (id) => cell.reasons[id] || 0),
      tenure: countRows(TENURES, (id) => cell.tenure[id] || 0)
    };
  }
  function combineMovement(rows, id, name, brand) {
    var _a;
    const startingActive = sum(rows.map((row) => row.startingActive));
    const newEnrollments = sum(rows.map((row) => row.newEnrollments));
    const cancellations = sum(rows.map((row) => row.cancellations));
    const attrition = attritionPct(cancellations, startingActive);
    const reasons = countRows(REASONS, (reasonId) => sum(rows.map((row) => {
      var _a2;
      return ((_a2 = row.reasons.find((item) => item.id === reasonId)) == null ? void 0 : _a2.count) || 0;
    })));
    const tenure = countRows(TENURES, (bucketId) => sum(rows.map((row) => {
      var _a2;
      return ((_a2 = row.tenure.find((item) => item.id === bucketId)) == null ? void 0 : _a2.count) || 0;
    })));
    const under3 = ((_a = tenure.find((row) => row.id === "under3")) == null ? void 0 : _a.count) || 0;
    return {
      id,
      name,
      brand: brand === "all" ? "lvlup" : brand,
      startingActive,
      newEnrollments,
      cancellations,
      attritionPct: attrition,
      retentionPct: retentionPct(attrition),
      netGrowth: newEnrollments - cancellations,
      onTrack: attrition == null ? true : attrition <= GOAL_PCT,
      earlyDrop: cancellations > 0 && under3 / cancellations >= 0.4,
      reasons,
      tenure
    };
  }
  function attritionReport(scope, month, cells = demoCells()) {
    var _a;
    assertMonth(month);
    const { ids, partial } = idsFor(scope, cells);
    const rows = monthCells(cells, month, ids).map(movementOf);
    const label = groupLabel(ids, scope, partial);
    const summary = combineMovement(rows, scope, label === "all 6 schools" ? "All schools" : label, scope === "goninja" ? "goninja" : scope === "all" ? "all" : ((_a = rows[0]) == null ? void 0 : _a.brand) || "lvlup");
    summary.name = label === "all 6 schools" ? "All schools" : label;
    const trend = GROWTH_MONTHS.map((key) => {
      const trendRows = monthCells(cells, key, ids).map(movementOf);
      const combined = combineMovement(trendRows, scope, scopeName(scope), "lvlup");
      return {
        month: key,
        label: monthLabel(key),
        short: monthShort(key),
        attritionPct: combined.attritionPct,
        retentionPct: combined.retentionPct,
        netGrowth: combined.netGrowth,
        cancellations: combined.cancellations,
        newEnrollments: combined.newEnrollments,
        startingActive: combined.startingActive
      };
    });
    return {
      scope,
      scopeLabel: label,
      month,
      monthLabel: monthLabel(month),
      partial,
      goalPct: GOAL_PCT,
      summary,
      bySchool: rows,
      trend,
      reasons: summary.reasons,
      tenure: summary.tenure
    };
  }
  function channelEconomics(id, stats) {
    const meta = CHANNELS.find((channel) => channel.id === id);
    const spendCents = sum(stats.map((row) => row.spendCents));
    const leads = sum(stats.map((row) => row.leads));
    const trials = sum(stats.map((row) => row.trials));
    const newMembers = sum(stats.map((row) => row.enrolled));
    return {
      id,
      name: meta.name,
      paid: meta.paid,
      spendCents,
      leads,
      trials,
      newMembers,
      costPerLeadCents: cacCents(spendCents, leads),
      costPerTrialCents: cacCents(spendCents, trials),
      cacCents: cacCents(spendCents, newMembers)
    };
  }
  function weighted(rows, valueOf) {
    const byNew = sum(rows.map((row) => row.newEnrollments));
    if (byNew) return Math.round(sum(rows.map((row) => row.newEnrollments * valueOf(row))) / byNew);
    const byStart = sum(rows.map((row) => row.startingActive));
    if (!byStart) return null;
    return Math.round(sum(rows.map((row) => row.startingActive * valueOf(row))) / byStart);
  }
  function unitEconomics(rows) {
    const stats = CHANNELS.map((channel) => channelEconomics(channel.id, rows.map((row) => row.channels[channel.id])));
    const spendCents = sum(stats.map((row) => row.spendCents));
    const leads = sum(stats.map((row) => row.leads));
    const trials = sum(stats.map((row) => row.trials));
    const newMembers = sum(stats.map((row) => row.newMembers));
    const paid = stats.filter((row) => row.paid);
    const paidSpendCents = sum(paid.map((row) => row.spendCents));
    const paidNewMembers = sum(paid.map((row) => row.newMembers));
    const blended = cacCents(spendCents, newMembers);
    const avgTuitionCents = weighted(rows, tuitionOf);
    const ltvCents = weighted(rows, (row) => tuitionOf(row) * tenureMonthsOf(row));
    return {
      spendCents,
      leads,
      trials,
      newMembers,
      blendedCacCents: blended,
      paidSpendCents,
      paidNewMembers,
      paidCacCents: cacCents(paidSpendCents, paidNewMembers),
      avgTuitionCents,
      ltvCents,
      ltvCacRatio: blended && ltvCents != null ? round1(ltvCents / blended) : null,
      paybackMonths: blended && avgTuitionCents ? round1(blended / avgTuitionCents) : null
    };
  }
  function schoolCac(rows, id, name, brand) {
    return {
      id,
      name,
      brand,
      ...unitEconomics(rows),
      channels: CHANNELS.map((channel) => channelEconomics(channel.id, rows.map((row) => row.channels[channel.id])))
    };
  }
  function cacReport(scope, month, cells = demoCells()) {
    var _a;
    assertMonth(month);
    const { ids, partial } = idsFor(scope, cells);
    const rows = monthCells(cells, month, ids);
    const bySchool = ids.map((id) => {
      const school = schoolById(id);
      return schoolCac(rows.filter((row) => row.locationId === id), id, school.name, school.brand);
    });
    const label = groupLabel(ids, scope, partial);
    const summary = schoolCac(rows, scope, label === "all 6 schools" ? "All schools" : label, scope === "all" ? "all" : scope === "goninja" ? "goninja" : scope === "lvlup" ? "lvlup" : ((_a = bySchool[0]) == null ? void 0 : _a.brand) || "lvlup");
    return {
      scope,
      scopeLabel: label,
      month,
      monthLabel: monthLabel(month),
      partial,
      summary,
      bySchool,
      channels: summary.channels
    };
  }
  function pulseReport(scope, month, cells = demoCells()) {
    var _a;
    const attrition = attritionReport(scope, month, cells);
    const cac = cacReport(scope, month, cells);
    const card = (movement, money, brand) => ({
      id: movement.id,
      name: movement.name,
      brand,
      attritionPct: movement.attritionPct,
      retentionPct: movement.retentionPct,
      netGrowth: movement.netGrowth,
      blendedCacCents: money.blendedCacCents,
      onTrack: movement.onTrack,
      earlyDrop: movement.earlyDrop,
      startingActive: movement.startingActive,
      cancellations: movement.cancellations,
      newEnrollments: movement.newEnrollments
    });
    return {
      scope,
      scopeLabel: attrition.scopeLabel,
      month,
      monthLabel: attrition.monthLabel,
      partial: attrition.partial,
      goalPct: GOAL_PCT,
      rollup: card(attrition.summary, cac.summary, scope === "goninja" ? "goninja" : scope === "lvlup" ? "lvlup" : scope === "all" ? "all" : ((_a = attrition.bySchool[0]) == null ? void 0 : _a.brand) || "lvlup"),
      schools: attrition.bySchool.map((row) => card(row, cac.bySchool.find((item) => item.id === row.id) || cac.summary, row.brand))
    };
  }
  function csvEscape(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }
  function dollars(cents) {
    if (cents == null) return "";
    return (cents / 100).toFixed(2);
  }
  function attritionCsv(scope, month, cells = demoCells()) {
    const report = attritionReport(scope, month, cells);
    const header = ["School", "Month", "Starting active", "New enrollments", "Cancellations", "Attrition %", "Net member growth", "Retention %"].concat(REASONS.map((reason) => reason.name)).concat(TENURES.map((bucket) => bucket.name));
    const line = (row) => [
      row.name,
      report.month,
      row.startingActive,
      row.newEnrollments,
      row.cancellations,
      row.attritionPct == null ? "" : row.attritionPct.toFixed(1),
      row.netGrowth,
      row.retentionPct == null ? "" : row.retentionPct.toFixed(1),
      ...row.reasons.map((item) => item.count),
      ...row.tenure.map((item) => item.count)
    ].map(csvEscape).join(",");
    return [header.join(","), ...report.bySchool.map(line), line(report.summary)].join("\n") + "\n";
  }
  function cacCsv(scope, month, cells = demoCells()) {
    const report = cacReport(scope, month, cells);
    const header = ["School", "Month", "Channel", "Spend", "Leads", "Trials", "New members", "Cost per lead", "Cost per trial", "CAC"];
    const lines = [header.join(",")];
    const push = (school, channel) => {
      lines.push([
        school,
        report.month,
        channel.name,
        dollars(channel.spendCents),
        channel.leads,
        channel.trials,
        channel.newMembers,
        dollars(channel.costPerLeadCents),
        dollars(channel.costPerTrialCents),
        dollars(channel.cacCents)
      ].map(csvEscape).join(","));
    };
    for (const school of report.bySchool) {
      for (const channel of school.channels) push(school.name, channel);
    }
    for (const channel of report.channels) push(report.summary.name, channel);
    return lines.join("\n") + "\n";
  }
  function groupLabel(ids, scope, partial) {
    var _a;
    if (!partial && scope === "all") return "all 6 schools";
    if (!partial && scope === "lvlup") return "LVLUP";
    if (!partial && scope === "goninja") return "Go Ninja";
    if (ids.length === 1) return ((_a = schoolById(ids[0])) == null ? void 0 : _a.name) || ids[0];
    return ids.map((id) => {
      var _a2;
      return ((_a2 = schoolById(id)) == null ? void 0 : _a2.name) || id;
    }).join(", ");
  }
  var ASK_SCHOOLS = [
    ["go ninja verona", "goninjaV"],
    ["goninja verona", "goninjaV"],
    ["go ninja waunakee", "goninjaW"],
    ["goninja waunakee", "goninjaW"],
    ["east madison", "eastmad"],
    ["east mad", "eastmad"],
    ["deforest", "deforest"],
    ["verona", "verona"],
    ["waunakee", "waunakee"],
    ["go ninja", "goninja"],
    ["lvlup", "lvlup"],
    ["level up", "lvlup"],
    ["all school", "all"],
    ["company", "all"],
    ["combined", "all"]
  ];
  function scopeFromQuestion(question) {
    const text = question.toLowerCase();
    for (const [needle, scope] of ASK_SCHOOLS) {
      if (text.includes(needle)) return scope;
    }
    return "";
  }
  function monthFromQuestion(question, asOf = GROWTH_AS_OF) {
    const text = question.toLowerCase();
    const current = asOf.slice(0, 7);
    if (text.includes("last month")) return shiftMonth(current, -1);
    if (text.includes("this month")) return current;
    const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
    if (iso) return iso[1] + "-" + iso[2];
    const names = [
      ["january", 1],
      ["february", 2],
      ["march", 3],
      ["april", 4],
      ["may", 5],
      ["june", 6],
      ["july", 7],
      ["august", 8],
      ["september", 9],
      ["october", 10],
      ["november", 11],
      ["december", 12]
    ];
    for (const [name, index] of names) {
      if (text.includes(name)) {
        const year = text.match(/\b(20\d{2})\b/);
        return (year ? year[1] : current.slice(0, 4)) + "-" + String(index).padStart(2, "0");
      }
    }
    return null;
  }
  function topCounts(rows, limit = 3) {
    return rows.filter((row) => row.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
  }
  function signed(value) {
    return value > 0 ? "+" + value : String(value);
  }
  function answerGrowthQuestion(question, opts = {}) {
    var _a;
    const asked = String(question || "").trim().slice(0, 500);
    const text = asked.toLowerCase();
    const asOf = opts.asOf || GROWTH_AS_OF;
    const namedScope = scopeFromQuestion(asked);
    const scope = namedScope || opts.scope || "all";
    const namedMonth = monthFromQuestion(asked, asOf);
    const month = namedMonth || opts.month || asOf.slice(0, 7);
    const cells = opts.cells || demoCells();
    if (!GROWTH_MONTHS.includes(month)) {
      return {
        question: asked,
        answer: "This preview covers June 2026 through November 2026. Ask about one of those months.",
        month,
        scope,
        topic: "help"
      };
    }
    let reportScope = scope;
    try {
      schoolsInScope(reportScope);
    } catch (e) {
      reportScope = "all";
    }
    const attrition = attritionReport(reportScope, month, cells);
    const cac = cacReport(reportScope, month, cells);
    const where = attrition.scopeLabel;
    const when = attrition.monthLabel;
    const wantsCac = /cac|acquisition|ad spend|channel|cost per/.test(text);
    const wantsWhy = /why|reason|leaving|left|cancel reason/.test(text);
    const wantsTenure = /tenure|early|how long|under 3|3 month/.test(text);
    const wantsUnit = /ltv|payback|tuition|unit economic/.test(text);
    const wantsNet = /net/.test(text) && /growth|member|enroll/.test(text);
    const wantsRetention = /retention/.test(text);
    const wantsHighest = /highest|worst|which school|who has/.test(text);
    const wantsAttrition = /attrition|churn/.test(text) || /cancel/.test(text) && !wantsWhy;
    const parts = [];
    let topic = "help";
    const wantsHelp = !asked || /what can you|help me ask/.test(text) && !wantsCac && !wantsAttrition;
    if (wantsHelp) {
      topic = "help";
      parts.push("Ask about attrition, retention, net member growth, why students left, tenure, CAC by school and channel, or LTV. For example: What was our attrition rate last month?");
    } else {
      if (wantsHighest && !wantsCac) {
        topic = "attrition";
        const ranked = attrition.bySchool.slice().sort((a, b) => {
          var _a2, _b;
          return ((_a2 = b.attritionPct) != null ? _a2 : -1) - ((_b = a.attritionPct) != null ? _b : -1);
        });
        const top = ranked[0];
        const tied = ranked.filter((row) => row.attritionPct === (top == null ? void 0 : top.attritionPct));
        const names = tied.map((row) => row.name).join(" and ");
        parts.push(names + " " + (tied.length > 1 ? "have" : "has") + " the highest attrition in " + when + " at " + formatPct((_a = top == null ? void 0 : top.attritionPct) != null ? _a : null) + ".");
        if (top == null ? void 0 : top.earlyDrop) parts.push("Most of those students had been enrolled under 3 months.");
      }
      if (wantsAttrition && !wantsHighest) {
        topic = "attrition";
        const row = attrition.summary;
        parts.push(when + " attrition across " + where + " was " + formatPct(row.attritionPct) + ". That is cancellations divided by starting active members. " + row.cancellations + " canceled and " + row.startingActive + " were active at the start of the month.");
        parts.push("Retention was " + formatPct(row.retentionPct) + ". Net member growth was " + signed(row.netGrowth) + " (" + row.newEnrollments + " new enrollments minus " + row.cancellations + " cancellations).");
        parts.push(row.onTrack ? "That is at or under the 3% goal." : "That is above the 3% goal.");
      }
      if (wantsRetention && !wantsAttrition) {
        topic = "retention";
        parts.push(when + " retention across " + where + " was " + formatPct(attrition.summary.retentionPct) + ". Retention is 100% minus attrition.");
      }
      if (wantsNet) {
        topic = topic === "help" ? "growth" : topic;
        const row = attrition.summary;
        parts.push("Net member growth in " + when + " across " + where + " was " + signed(row.netGrowth) + " (" + row.newEnrollments + " new enrollments minus " + row.cancellations + " cancellations).");
      }
      if (wantsWhy || wantsTenure) {
        topic = "reasons";
        const reasons = topCounts(attrition.reasons, 6);
        const reasonText = reasons.length ? reasons.map((row) => row.name + " (" + row.count + ")").join(", ") : "none recorded";
        parts.push("In " + when + ", " + attrition.summary.cancellations + " students canceled across " + where + ". Reasons: " + reasonText + ".");
        const tenure = topCounts(attrition.tenure, 4);
        parts.push("Tenure of those cancellations: " + tenure.map((row) => row.name + " (" + row.count + ")").join(", ") + ".");
        const early = attrition.bySchool.filter((row) => row.earlyDrop).map((row) => row.name);
        if (early.length) parts.push("Early-drop pattern at " + early.join(", ") + ", where at least 40% of cancellations had been enrolled under 3 months.");
      }
      if (wantsCac) {
        topic = "cac";
        const summary = cac.summary;
        parts.push(when + " blended CAC across " + where + " is " + formatMoney(summary.blendedCacCents) + ". That is total marketing spend of " + formatMoney(summary.spendCents) + " divided by " + summary.newMembers + " new enrolled students.");
        parts.push("Paid-only CAC (Google Ads and Meta / Facebook Ads) is " + formatMoney(summary.paidCacCents) + ".");
        const schoolBits = cac.bySchool.map((row) => row.name + " " + formatMoney(row.blendedCacCents));
        parts.push("By school: " + schoolBits.join("; ") + ".");
        const channelBits = cac.channels.map((row) => row.name + " " + formatMoney(row.cacCents) + " (" + formatMoney(row.spendCents) + " spend, " + row.newMembers + " new)");
        parts.push("By channel: " + channelBits.join("; ") + ".");
      }
      if (wantsUnit) {
        topic = "unit";
        const summary = cac.summary;
        parts.push("Across " + where + " in " + when + ", average monthly tuition is " + formatMoney(summary.avgTuitionCents) + " and LTV is " + formatMoney(summary.ltvCents) + ".");
        parts.push("The LTV to CAC ratio is " + (summary.ltvCacRatio == null ? "n/a" : summary.ltvCacRatio.toFixed(1) + " to 1") + ". CAC payback is " + (summary.paybackMonths == null ? "n/a" : summary.paybackMonths.toFixed(1) + " months") + ".");
        parts.push("LTV is average monthly tuition times average length of stay. Payback is blended CAC divided by that tuition.");
      }
    }
    if (!parts.length) {
      topic = "help";
      parts.push("Ask about attrition, retention, net member growth, why students left, tenure, CAC by school and channel, or LTV. For example: What is our CAC by school and channel?");
    }
    return {
      question: asked,
      answer: parts.join(" "),
      month,
      scope: reportScope,
      topic
    };
  }
  function parseSpendInput(body) {
    const record = body && typeof body === "object" ? body : {};
    const rawRows = Array.isArray(body) ? body : Array.isArray(record.rows) ? record.rows : [record];
    if (!rawRows.length || rawRows.length === 1 && !rawRows[0]) throw new GrowthInputError("Add at least one spend row.");
    if (rawRows.length > 60) throw new GrowthInputError("Too many spend rows.");
    return rawRows.map((row) => {
      const item = row && typeof row === "object" ? row : {};
      const locationId = String(item.locationId || "");
      const month = String(item.month || item.monthKey || "");
      const channel = String(item.channel || "");
      if (!schoolById(locationId)) throw new GrowthInputError("Choose a school.");
      if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) throw new GrowthInputError("Choose a month.");
      const year = Number(month.slice(0, 4));
      if (year < 2024 || year > 2030) throw new GrowthInputError("Choose a month between 2024 and 2030.");
      if (!CHANNELS.some((itemChannel) => itemChannel.id === channel)) throw new GrowthInputError("Choose a channel.");
      let cents;
      if (item.amountCents != null && item.amountCents !== "") {
        cents = Number(item.amountCents);
        if (!Number.isInteger(cents)) throw new GrowthInputError("Enter spend in cents as a whole number.");
      } else if (item.amountDollars != null) {
        const text = String(item.amountDollars).trim().replace(/[$,]/g, "");
        if (!text) cents = 0;
        else {
          if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new GrowthInputError("Enter a dollar amount from 0 to 250000.");
          cents = Math.round(Number(text) * 100);
        }
      } else {
        throw new GrowthInputError("Enter a dollar amount from 0 to 250000.");
      }
      if (cents < 0 || cents > 25e6) throw new GrowthInputError("Enter a dollar amount from 0 to 250000.");
      return { locationId, month, channel, amountCents: cents };
    });
  }
  function summaryPayload(cells, extra) {
    return {
      fixture: extra.fixture,
      database: extra.database,
      live: false,
      charged: false,
      asOf: GROWTH_AS_OF,
      goalPct: GOAL_PCT,
      months: [...GROWTH_MONTHS],
      schools: GROWTH_SCHOOLS.map((row) => ({
        id: row.id,
        name: row.name,
        brand: row.brand,
        tuitionCents: row.tuitionCents,
        avgTenureMonths: row.avgTenureMonths
      })),
      channels: CHANNELS.map((row) => ({ id: row.id, name: row.name, paid: row.paid })),
      cells
    };
  }
  return __toCommonJS(growth_exports);
})();
